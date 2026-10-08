import { BACKEND_URL } from "@/components/file-upload/constants";

export type MediaType = "movies" | "series" | "animes";

export interface UploadProgress {
  percentage: number;
  timeElapsed: number; // seconds
  timeRemaining: number | null; // seconds
  uploadSpeed: number; // bytes per second
}

export interface UploadTarget {
  type: MediaType;
  folder?: string;
  fileName: string;
}

const PARALLEL = 4;
const MAX_RETRIES = 5;
const PROGRESS_MS = 250;
const CHUNK_TIMEOUT_MS = 5 * 60 * 1000;

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

// One chunk over XHR (fetch has no upload progress). Aborts for real on timeout/cancel.
function putChunk(url: string, body: Blob, signal: AbortSignal, onBytes: (n: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    signal.addEventListener("abort", abort, { once: true });
    const done = (err?: Error) => {
      signal.removeEventListener("abort", abort);
      if (err) reject(err);
      else resolve();
    };
    xhr.open("PUT", url);
    xhr.timeout = CHUNK_TIMEOUT_MS;
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => onBytes(e.loaded);
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
    xhr.ontimeout = () => done(new Error("Chunk timeout"));
    xhr.onabort = () => done(signal.reason ?? new DOMException("Aborted", "AbortError"));
    xhr.send(body);
  });
}

/**
 * Uploads a file in chunks with a fixed pool of parallel requests,
 * per-chunk retry with backoff, then finalizes on the server.
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
  const { uploadId, chunkSize, totalChunks } = await api<{
    uploadId: string;
    chunkSize: number;
    totalChunks: number;
  }>("/upload/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...target, originalFileName: file.name, size: file.size }),
    signal,
  });

  // Progress: bytes of finished chunks + bytes in flight, EMA speed.
  const start = performance.now();
  const inFlight = new Map<number, number>();
  let doneBytes = 0;
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
    lastAt = now;
    onProgress?.({
      percentage: Math.min(99.9, (bytes / file.size) * 100),
      timeElapsed: (now - start) / 1000,
      timeRemaining: speed > 0 ? (file.size - bytes) / speed : null,
      uploadSpeed: speed,
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
        if (signal.aborted || fatal || attempt >= MAX_RETRIES) throw err;
        await sleep(Math.min(30_000, 1000 * 2 ** attempt) * (0.75 + Math.random() * 0.5), signal);
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
    await runPool(Array.from({ length: totalChunks }, (_, i) => i));
    // Reconcile with the server before finalizing.
    const { missingChunks } = await api<{ missingChunks: number[] }>(`/upload/${uploadId}`, { signal });
    if (missingChunks.length) {
      doneBytes -= missingChunks.length * chunkSize;
      await runPool(missingChunks);
    }
    clearInterval(timer);
    report(); // final tick: small files can finish before the first interval
    onFinalizing?.();
    const { filePath } = await api<{ filePath: string }>(`/upload/${uploadId}/complete`, {
      method: "POST",
      signal,
    });
    return filePath;
  } catch (err) {
    fetch(`${BACKEND_URL}/upload/${uploadId}`, { method: "DELETE", keepalive: true }).catch(() => {});
    throw err;
  } finally {
    clearInterval(timer);
  }
}

export async function listFolders(type: MediaType, signal?: AbortSignal) {
  const { folders } = await api<{ folders: string[] }>(`/folders?type=${type}`, { signal });
  return folders;
}
