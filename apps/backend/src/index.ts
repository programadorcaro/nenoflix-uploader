import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { open, mkdir, readdir, rename, rm, rmdir, stat, type FileHandle } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, extname, join } from "node:path";

const PORT = Number(process.env.PORT ?? 8098);
const MEDIA_ROOT = process.env.MEDIA_ROOT ?? "/Volumes/MediaNAS/Jellyfin/media";
// Small enough that a dropped connection over Tailscale costs little to resend.
const CHUNK_SIZE = 8 * 1024 * 1024;
// Socket buffers (~64 KiB) are batched into one write of this size.
const WRITE_BATCH = 2 * 1024 * 1024;
const STALE_MS = 24 * 60 * 60 * 1000;
const ALLOWED_EXTENSIONS = [".mkv", ".mp4", ".srt"];
const TYPE_DIRS: Record<string, string> = { movies: "Movies", series: "Series", animes: "Animes" };

interface Session {
  fh: FileHandle;
  tmpPath: string;
  finalPath: string;
  size: number;
  totalChunks: number;
  received: Set<number>;
  writing: Set<number>;
  touched: number;
  syncing: boolean;
  startedAt: number;
  aborts: number;
}
const sessions = new Map<string, Session>();

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Strip characters that are unsafe in file names; folders also lose dots.
const cleanName = (s: unknown, isFolder = false) =>
  String(s ?? "").replace(isFolder ? /[<>:"/\\|?*.\x00-\x1F]/g : /[<>:"/\\|?*\x00-\x1F]/g, "").trim();

const typeDir = (type: unknown) => {
  const dir = TYPE_DIRS[String(type)];
  if (!dir) throw new HttpError(400, "Invalid type");
  return join(MEDIA_ROOT, dir);
};

const exists = (p: string) => stat(p).then(() => true, () => false);

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const readJson = async (req: IncomingMessage) => {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64 * 1024) throw new HttpError(413, "Body too large");
  }
  try {
    return JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
};

const getSession = (id: string) => {
  const s = sessions.get(id);
  if (!s) throw new HttpError(404, "Upload not found");
  s.touched = Date.now();
  return s;
};

const missingChunks = (s: Session) => {
  const missing: number[] = [];
  for (let i = 0; i < s.totalChunks; i++) if (!s.received.has(i)) missing.push(i);
  return missing;
};

const dropSession = async (id: string, s: Session) => {
  sessions.delete(id);
  await s.fh.close().catch(() => {});
  await rm(s.tmpPath, { force: true });
  // Remove a series/anime folder created for this upload if it is now empty.
  const dir = dirname(s.tmpPath);
  if (!Object.values(TYPE_DIRS).some((t) => join(MEDIA_ROOT, t) === dir)) await rmdir(dir).catch(() => {});
};

async function init(req: IncomingMessage) {
  const body = await readJson(req);
  const size = Number(body.size);
  if (!Number.isSafeInteger(size) || size <= 0) throw new HttpError(400, "Invalid size");

  const ext = extname(String(body.originalFileName || body.fileName || "")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new HttpError(400, `Invalid file format. Allowed formats: ${ALLOWED_EXTENSIONS.join(", ")}`);
  }
  let name = cleanName(body.fileName);
  if (!name.toLowerCase().endsWith(ext)) name += ext;
  if (name === ext || name.startsWith(".")) throw new HttpError(400, "Invalid file name");

  const folder = cleanName(body.folder, true);
  const dir = folder ? join(typeDir(body.type), folder) : typeDir(body.type);
  const finalPath = join(dir, name);
  if (await exists(finalPath)) throw new HttpError(409, "File already exists");

  await mkdir(dir, { recursive: true });
  const tmpPath = join(dir, `.${name}.uploading`);
  const fh = await open(tmpPath, "w+");
  await fh.truncate(size);

  const id = randomUUID();
  const totalChunks = Math.ceil(size / CHUNK_SIZE);
  sessions.set(id, {
    fh, tmpPath, finalPath, size, totalChunks,
    received: new Set(), writing: new Set(), touched: Date.now(), syncing: false,
    startedAt: Date.now(), aborts: 0,
  });
  return { success: true, uploadId: id, chunkSize: CHUNK_SIZE, totalChunks };
}

// Streams the raw body straight into its slot of the preallocated file.
async function writeChunk(req: IncomingMessage, id: string, index: number) {
  const s = getSession(id);
  if (!Number.isInteger(index) || index < 0 || index >= s.totalChunks) {
    throw new HttpError(400, "Invalid chunk index");
  }
  const start = index * CHUNK_SIZE;
  const expected = Math.min(CHUNK_SIZE, s.size - start);
  if (Number(req.headers["content-length"]) !== expected) {
    throw new HttpError(400, `Chunk must be ${expected} bytes`);
  }
  if (s.received.has(index)) {
    req.resume();
    return { success: true, chunkIndex: index };
  }
  if (s.writing.has(index)) throw new HttpError(409, "Chunk is already being written");

  s.writing.add(index);
  try {
    let written = 0;
    let pending: Buffer[] = [];
    let pendingBytes = 0;
    const flush = async () => {
      if (!pendingBytes) return;
      const buf = pending.length === 1 ? pending[0]! : Buffer.concat(pending, pendingBytes);
      pending = [];
      pendingBytes = 0;
      await s.fh.write(buf, 0, buf.length, start + written);
      written += buf.length;
    };
    try {
      for await (const buf of req as AsyncIterable<Buffer>) {
        if (written + pendingBytes + buf.length > expected) throw new HttpError(400, "Chunk too large");
        pending.push(buf);
        pendingBytes += buf.length;
        if (pendingBytes >= WRITE_BATCH) await flush();
      }
    } catch (err) {
      if (!(err instanceof HttpError)) {
        s.aborts++;
        throw new HttpError(499, "Client aborted");
      }
      throw err;
    }
    await flush();
    if (written !== expected) throw new HttpError(400, "Chunk incomplete");
    s.received.add(index);
    s.touched = Date.now();
    flushInBackground(s);
    return { success: true, chunkIndex: index };
  } finally {
    s.writing.delete(index);
  }
}

// macOS defers writeback, so without this the whole file is flushed at
// complete time. Keeping one datasync running overlaps disk and network.
function flushInBackground(s: Session) {
  if (s.syncing) return;
  s.syncing = true;
  s.fh.datasync().catch(() => {}).finally(() => (s.syncing = false));
}

async function complete(id: string) {
  const s = getSession(id);
  const missing = missingChunks(s);
  if (missing.length) throw new HttpError(409, `Missing ${missing.length} chunks`);
  if (await exists(s.finalPath)) throw new HttpError(409, "File already exists");
  sessions.delete(id);
  await s.fh.sync();
  await s.fh.close();
  await rename(s.tmpPath, s.finalPath);
  const secs = (Date.now() - s.startedAt) / 1000;
  console.log(
    `upload done ${s.finalPath} ${(s.size / 1048576).toFixed(0)} MiB in ${secs.toFixed(0)}s ` +
      `(${(s.size / 1048576 / secs).toFixed(2)} MiB/s, ${s.aborts} aborted chunks)`
  );
  return { success: true, filePath: s.finalPath };
}

// Network-only throughput check: reads the body and discards it.
async function speedtest(req: IncomingMessage) {
  const t0 = Date.now();
  let bytes = 0;
  for await (const buf of req as AsyncIterable<Buffer>) bytes += buf.length;
  const ms = Math.max(1, Date.now() - t0);
  return { success: true, bytes, ms, mibPerSec: bytes / 1048576 / (ms / 1000) };
}

async function listFolders(type: unknown) {
  const entries = await readdir(typeDir(type), { withFileTypes: true }).catch(() => []);
  const folders = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
  return { success: true, folders };
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://x");
  const parts = url.pathname.split("/").filter(Boolean);
  const m = req.method;

  if (m === "GET" && (parts.length === 0 || url.pathname === "/health")) {
    return { status: "ok", mediaRoot: MEDIA_ROOT, mediaRootOk: await exists(MEDIA_ROOT), uploads: sessions.size };
  }
  if (m === "PUT" && url.pathname === "/speedtest") return speedtest(req);
  if (m === "GET" && url.pathname === "/folders") return listFolders(url.searchParams.get("type"));
  if (parts[0] === "upload") {
    if (m === "POST" && parts[1] === "init" && parts.length === 2) return init(req);
    const id = parts[1] ?? "";
    if (m === "PUT" && parts.length === 3) return writeChunk(req, id, Number(parts[2]));
    if (m === "POST" && parts[2] === "complete" && parts.length === 3) return complete(id);
    if (m === "GET" && parts.length === 2) {
      const s = getSession(id);
      return {
        success: true, size: s.size, chunkSize: CHUNK_SIZE, totalChunks: s.totalChunks,
        missingChunks: missingChunks(s),
      };
    }
    if (m === "DELETE" && parts.length === 2) {
      await dropSession(id, getSession(id));
      return { success: true };
    }
  }
  throw new HttpError(404, "Not found");
}

const server = createServer(async (req, res) => {
  // LAN/Tailscale tool with no auth: reflect the caller's origin.
  res.setHeader("access-control-allow-origin", req.headers.origin ?? "*");
  res.setHeader("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-max-age", "86400");
  if (req.method === "OPTIONS") return void res.writeHead(204).end();
  try {
    send(res, 200, await route(req, res));
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(req.method, req.url, err);
    else if (status === 499) console.log(req.method, req.url, "client aborted");
    if (!req.complete) req.resume();
    send(res, status, { success: false, error: err instanceof Error ? err.message : String(err) });
  }
});
server.keepAliveTimeout = 65_000;
server.requestTimeout = 0; // big chunks on slow links must not be cut off

// Drop uploads idle for a day, plus orphaned temp files from earlier runs.
async function sweep() {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.touched > STALE_MS) await dropSession(id, s);
  const active = new Set([...sessions.values()].map((s) => s.tmpPath));
  // Uploads only land in <type>/ or <type>/<folder>/, so scan two levels.
  const ls = (dir: string) => readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const typeName of Object.values(TYPE_DIRS)) {
    const root = join(MEDIA_ROOT, typeName);
    const dirs = [root, ...(await ls(root)).filter((e) => e.isDirectory()).map((e) => join(root, e.name))];
    for (const dir of dirs) {
      for (const e of await ls(dir)) {
        if (!e.isFile() || !e.name.endsWith(".uploading")) continue;
        const p = join(dir, e.name);
        const st = await stat(p).catch(() => null);
        if (st && !active.has(p) && now - st.mtimeMs > STALE_MS) await rm(p, { force: true });
      }
    }
  }
}
sweep().catch(console.error);
setInterval(() => sweep().catch(console.error), 60 * 60 * 1000).unref();

server.listen(PORT, "0.0.0.0", () => console.log(`NenoFlix uploader API on :${PORT} -> ${MEDIA_ROOT}`));
