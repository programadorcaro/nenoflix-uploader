import { ALLOWED_EXTENSIONS } from "../constants";

export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const n = (bytes / 1024 ** i).toLocaleString("pt-BR", { maximumFractionDigits: i >= 3 ? 2 : 1 });
  return `${n} ${sizes[i]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${(bytesPerSecond / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB/s`;
}

export function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
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
