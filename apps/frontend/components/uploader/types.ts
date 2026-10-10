import type { MediaType } from "@/lib/upload";

export type { MediaType };

export type ItemStatus = "pending" | "uploading" | "completing" | "paused" | "done" | "error";

export interface QueueItem {
  id: string;
  file: File;
  /** Final name on the server, without extension. */
  name: string;
  status: ItemStatus;
  progress: number; // 0-100
  sentBytes: number;
  error?: string;
  finalPath?: string;
  /** Seconds spent sending this file. */
  elapsed?: number;
}

/** compose: picking files; uploading/paused: queue running or held; done: queue finished. */
export type Phase = "compose" | "uploading" | "paused" | "done";

export interface LiveStats {
  speed: number; // bytes/s, EMA from the upload lib
  reconnecting: boolean;
  /** One speed sample per second, newest last. */
  samples: number[];
  /** Seconds the queue has been sending, pauses excluded. */
  elapsed: number;
}

export interface ExistingFile {
  name: string;
  size: number;
}
