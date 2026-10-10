import { BACKEND_URL } from "@/components/uploader/constants";

export type MediaType = "movies" | "series" | "animes";

export interface UploadProgress {
  percentage: number;
  timeElapsed: number; // seconds
  timeRemaining: number | null; // seconds
  uploadSpeed: number; // bytes per second
  /** Some chunks are waiting to retry after a network error. */
  reconnecting: boolean;
  sentBytes: number;
  totalBytes: number;
}

/** Abort reason that stops an upload but keeps it resumable. */
export const PAUSED = "paused";
const LAST_SPEED_KEY = "nenoflix-last-speed";

/** Average speed of the last finished upload on this device, in bytes/s. */
export function getLastSpeed(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_SPEED_KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

export interface UploadTarget {
  type: MediaType;
  folder?: string;
  fileName: string;
}

// More streams keep a lossy WAN link (Tailscale over Wi-Fi) busy.
const PARALLEL = 8;
const PROGRESS_MS = 250;
// Abort a chunk whose bytes stopped moving; a fresh connection recovers faster.
const STALL_MS = 45 * 1000;
const RESUME_KEY = "nenoflix-upload:";

// Remembers the server session per file so a reload or a dead link resumes
// instead of starting over. Storage may be unavailable (private mode).
const resumeStore = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(RESUME_KEY + key);
    } catch {
      return null;
    }
  },
  set(key: string, id: string) {
    try {
      localStorage.setItem(RESUME_KEY + key, id);
    } catch {
      // ignore
    }
  },
  clear(key: string) {
    try {
      localStorage.removeItem(RESUME_KEY + key);
    } catch {
      // ignore
    }
  },
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, init);
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || body.success === false) throw new Error(body.error || `HTTP ${res.status}`);
  return body as T;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });

// One chunk over XHR (fetch has no upload progress). Aborts for real on stall/cancel.
function putChunk(url: string, body: Blob, signal: AbortSignal, onBytes: (n: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let stalled = false;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    const armStall = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => ((stalled = true), xhr.abort()), STALL_MS);
    };
    const abort = () => xhr.abort();
    signal.addEventListener("abort", abort, { once: true });
    const done = (err?: Error) => {
      clearTimeout(stallTimer);
      signal.removeEventListener("abort", abort);
      if (err) reject(err);
      else resolve();
    };
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => (armStall(), onBytes(e.loaded));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return done();
      let msg = `HTTP ${xhr.status}`;
      try {
        msg = JSON.parse(xhr.responseText).error || msg;
      } catch {
        // non-JSON body: keep the status text
      }
      done(Object.assign(new Error(msg), { status: xhr.status }));
    };
    xhr.onerror = () => done(new Error("Network error"));
    xhr.onabort = () =>
      done(stalled ? new Error("Chunk stalled") : (signal.reason ?? new DOMException("Aborted", "AbortError")));
    armStall();
    xhr.send(body);
  });
}

const resumeKey = (file: File, target: UploadTarget) =>
  [file.name, file.size, file.lastModified, target.type, target.folder ?? "", target.fileName].join("|");

type Session = { uploadId: string; chunkSize: number; totalChunks: number; missingChunks: number[] };

// Reuse the server session of an earlier attempt for this exact file and target.
async function openSession(file: File, target: UploadTarget, key: string, signal: AbortSignal): Promise<Session> {
  const previous = resumeStore.get(key);
  if (previous) {
    try {
      const s = await api<{ size: number; chunkSize: number; totalChunks: number; missingChunks: number[] }>(
        `/upload/${previous}`,
        { signal }
      );
      if (s.size === file.size) return { uploadId: previous, ...s };
    } catch (err) {
      if (signal.aborted) throw err;
      // expired or server restarted: start a new session
    }
    resumeStore.clear(key);
  }
  const s = await api<{ uploadId: string; chunkSize: number; totalChunks: number }>("/upload/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...target, originalFileName: file.name, size: file.size }),
    signal,
  });
  resumeStore.set(key, s.uploadId);
  return { ...s, missingChunks: Array.from({ length: s.totalChunks }, (_, i) => i) };
}

/**
 * Uploads a file in chunks with a fixed pool of parallel requests,
 * retrying network errors until they pass, then finalizes on the server.
 * An interrupted upload resumes from the chunks the server already has.
 * Returns the final path on the server.
 */
export async function uploadFile(
  file: File,
  target: UploadTarget,
  { onProgress, onFinalizing, signal = new AbortController().signal }: {
    onProgress?: (p: UploadProgress) => void;
    /** All bytes sent; the server is flushing and moving the file. */
    onFinalizing?: () => void;
    signal?: AbortSignal;
  } = {}
): Promise<string> {
  const key = resumeKey(file, target);
  const { uploadId, chunkSize, missingChunks: todo } = await openSession(file, target, key, signal);
  const chunkBytes = (i: number) => Math.min(file.size, (i + 1) * chunkSize) - i * chunkSize;

  // Progress: bytes of finished chunks + bytes in flight, EMA speed.
  const start = performance.now();
  const inFlight = new Map<number, number>();
  let retrying = 0;
  let doneBytes = file.size - todo.reduce((sum, i) => sum + chunkBytes(i), 0);
  const resumedBytes = doneBytes;
  let speed = 0;
  let lastBytes = 0;
  let lastAt = start;
  const report = () => {
    const now = performance.now();
    let bytes = doneBytes;
    for (const n of inFlight.values()) bytes += n;
    const dt = (now - lastAt) / 1000;
    if (dt > 0) {
      const instant = Math.max(0, bytes - lastBytes) / dt;
      speed = speed ? speed * 0.8 + instant * 0.2 : instant;
    }
    lastBytes = bytes;
    if (retrying) speed *= 0.8; // let the shown speed fall while the link is down
    lastAt = now;
    onProgress?.({
      percentage: Math.min(99.9, (bytes / file.size) * 100),
      timeElapsed: (now - start) / 1000,
      timeRemaining: speed > 0 ? (file.size - bytes) / speed : null,
      uploadSpeed: speed,
      reconnecting: retrying > 0,
      sentBytes: bytes,
      totalBytes: file.size,
    });
  };
  const timer = setInterval(report, PROGRESS_MS);

  const sendChunk = async (i: number) => {
    const blob = file.slice(i * chunkSize, Math.min(file.size, (i + 1) * chunkSize));
    for (let attempt = 0; ; attempt++) {
      try {
        await putChunk(`${BACKEND_URL}/upload/${uploadId}/${i}`, blob, signal, (n) => inFlight.set(i, n));
        inFlight.delete(i);
        doneBytes += blob.size;
        return;
      } catch (err) {
        inFlight.delete(i);
        const status = (err as { status?: number }).status ?? 0;
        // 4xx other than 408/409/429 will not get better by retrying.
        const fatal = status >= 400 && status < 500 && ![408, 409, 429].includes(status);
        if (signal.aborted || fatal) throw Object.assign(err as Error, { fatal });
        // Network errors are retried for as long as it takes; chunks already sent are kept.
        retrying++;
        try {
          await sleep(Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)) * (0.75 + Math.random() * 0.5), signal);
        } finally {
          retrying--;
        }
      }
    }
  };

  // Each worker pulls the next chunk as soon as it finishes one.
  const runPool = async (queue: number[]) => {
    let next = 0;
    const worker = async () => {
      while (next < queue.length) await sendChunk(queue[next++]!);
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
  };

  try {
    await runPool(todo);
    // Reconcile with the server before finalizing.
    const { missingChunks } = await api<{ missingChunks: number[] }>(`/upload/${uploadId}`, { signal });
    if (missingChunks.length) {
      for (const i of missingChunks) doneBytes -= chunkBytes(i);
      await runPool(missingChunks);
    }
    clearInterval(timer);
    report(); // final tick: small files can finish before the first interval
    onFinalizing?.();
    const { filePath } = await api<{ filePath: string }>(`/upload/${uploadId}/complete`, {
      method: "POST",
      signal,
    });
    resumeStore.clear(key);
    const secs = (performance.now() - start) / 1000;
    if (secs > 5) {
      try {
        localStorage.setItem(LAST_SPEED_KEY, String((file.size - resumedBytes) / secs));
      } catch {
        // ignore
      }
    }
    return filePath;
  } catch (err) {
    // Keep the server session on other errors so a retry resumes where it stopped.
    if ((signal.aborted && signal.reason !== PAUSED) || (err as { fatal?: boolean }).fatal) {
      resumeStore.clear(key);
      fetch(`${BACKEND_URL}/upload/${uploadId}`, { method: "DELETE", keepalive: true }).catch(() => {});
    }
    throw err;
  } finally {
    clearInterval(timer);
  }
}

/** Drops the server session of a paused upload so its temp file goes away. */
export function discardUpload(file: File, target: UploadTarget) {
  const key = resumeKey(file, target);
  const id = resumeStore.get(key);
  resumeStore.clear(key);
  if (id) fetch(`${BACKEND_URL}/upload/${id}`, { method: "DELETE", keepalive: true }).catch(() => {});
}

export async function listFiles(type: MediaType, folder: string, signal?: AbortSignal) {
  const q = new URLSearchParams({ type, folder });
  const { files } = await api<{ files: { name: string; size: number }[] }>(`/files?${q}`, { signal });
  return files;
}

export async function listFolders(type: MediaType, signal?: AbortSignal) {
  const { folders } = await api<{ folders: string[] }>(`/folders?type=${type}`, { signal });
  return folders;
}
