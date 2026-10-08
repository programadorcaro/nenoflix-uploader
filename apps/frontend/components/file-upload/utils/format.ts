import { ALLOWED_EXTENSIONS } from "../constants";

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round((bytes / 1024 ** i) * 100) / 100 + " " + sizes[i];
}

export function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/** Upload time at `bytesPerSecond`, defaulting to 10 MB/s until a real speed is known. */
export function estimateUploadTime(sizeBytes: number, bytesPerSecond = 10 * 1024 * 1024): string {
  return formatTime(sizeBytes / bytesPerSecond);
}

/** File name without its extension. */
export function extractFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? name : name.substring(0, dot);
}

export function getFileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.substring(dot + 1).toUpperCase();
}

export function isAllowedFile(file: File): boolean {
  const dot = file.name.lastIndexOf(".");
  if (dot === -1 || dot === file.name.length - 1) return false;
  return ALLOWED_EXTENSIONS.includes(file.name.substring(dot).toLowerCase());
}

const TYPE_DIRS = { movies: "Movies", series: "Series", animes: "Animes" } as const;

/**
 * Short location shown to the user, e.g. "/Series/Breaking Bad" or
 * "/Movies/Name.mkv" (with `withFile`), taken from the server's full path.
 */
export function mediaLocation(
  finalFilePath: string,
  contentType: keyof typeof TYPE_DIRS,
  withFile = false
): string {
  const parts = finalFilePath.split(/[/\\]/).filter(Boolean);
  const dir = TYPE_DIRS[contentType];
  const at = parts.findIndex((p) => p.toLowerCase() === dir.toLowerCase());
  if (at === -1) return finalFilePath;
  const rest = parts.slice(at, withFile ? undefined : -1);
  return `/${rest.join("/")}`;
}
