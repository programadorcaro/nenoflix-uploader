const MIN_CHUNK_SIZE = 20 * 1024 * 1024; // 20MB minimum
const MAX_CHUNK_SIZE = 100 * 1024 * 1024; // 100MB maximum
const TARGET_CHUNKS = 200; // Target number of chunks
const MAX_PARALLEL_CHUNKS = 4;
const MAX_RETRIES = 3;

function calculateOptimalChunkSize(totalSize: number): number {
  const idealChunkSize = Math.floor(totalSize / TARGET_CHUNKS);
  
  if (idealChunkSize < MIN_CHUNK_SIZE) {
    return MIN_CHUNK_SIZE;
  }
  
  if (idealChunkSize > MAX_CHUNK_SIZE) {
    return MAX_CHUNK_SIZE;
  }
  
  // Round to nearest MB for cleaner numbers
  return Math.floor(idealChunkSize / (1024 * 1024)) * 1024 * 1024;
}

export interface ChunkInfo {
  index: number;
  start: number;
  end: number;
  size: number;
}

export interface ChunkStatus {
  index: number;
  status: "pending" | "uploading" | "completed" | "failed";
  retries: number;
  error?: string;
}

export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
  chunksCompleted: number;
  totalChunks: number;
  timeElapsed: number;
  timeRemaining: number | null;
  uploadSpeed: number; // bytes per second
}

export class UploadChunker {
  private file: File;
  private chunkSize: number;
  private chunks: ChunkInfo[];
  private chunkStatuses: Map<number, ChunkStatus>;
  private abortControllers: Map<number, AbortController>;
  private onProgress?: (progress: UploadProgress) => void;
  private uploadId?: string;
  private backendUrl: string;
  private startTime: number = 0;
  private lastProgressTime: number = 0;
  private lastProgressBytes: number = 0;

  constructor(
    file: File,
    backendUrl: string,
    chunkSize?: number
  ) {
    this.file = file;
    this.backendUrl = backendUrl;
    this.chunkSize = chunkSize || calculateOptimalChunkSize(file.size);
    this.chunks = this.calculateChunks();
    this.chunkStatuses = new Map();
    this.abortControllers = new Map();

    this.chunks.forEach((chunk) => {
      this.chunkStatuses.set(chunk.index, {
        index: chunk.index,
        status: "pending",
        retries: 0,
      });
    });
  }

  setProgressCallback(callback: (progress: UploadProgress) => void): void {
    this.onProgress = callback;
  }

  setUploadId(uploadId: string): void {
    this.uploadId = uploadId;
  }

  private calculateChunks(): ChunkInfo[] {
    const chunks: ChunkInfo[] = [];
    const totalSize = this.file.size;

    for (let start = 0; start < totalSize; start += this.chunkSize) {
      const end = Math.min(start + this.chunkSize, totalSize);
      chunks.push({
        index: chunks.length,
        start,
        end,
        size: end - start,
      });
    }

    return chunks;
  }

  getChunks(): ChunkInfo[] {
    return this.chunks;
  }

  getTotalChunks(): number {
    return this.chunks.length;
  }

  private getChunkBlob(chunk: ChunkInfo): Blob {
    return this.file.slice(chunk.start, chunk.end);
  }

  private updateProgress(): void {
    if (!this.onProgress) return;

    const now = Date.now();
    
    if (this.startTime === 0) {
      this.startTime = now;
      this.lastProgressTime = now;
      this.lastProgressBytes = 0;
    }

    let uploadedBytes = 0;
    let chunksCompleted = 0;

    for (const status of this.chunkStatuses.values()) {
      if (status.status === "completed") {
        const chunk = this.chunks[status.index];
        uploadedBytes += chunk.size;
        chunksCompleted++;
      }
    }

    const timeElapsed = (now - this.startTime) / 1000; // seconds
    const timeSinceLastUpdate = (now - this.lastProgressTime) / 1000; // seconds
    const bytesSinceLastUpdate = uploadedBytes - this.lastProgressBytes;

    // Calculate upload speed (bytes per second)
    // Use exponential moving average for smoother speed calculation
    let uploadSpeed = 0;
    if (timeSinceLastUpdate > 0 && bytesSinceLastUpdate > 0) {
      const currentSpeed = bytesSinceLastUpdate / timeSinceLastUpdate;
      const previousSpeed = this.lastProgressBytes > 0 
        ? this.lastProgressBytes / ((this.lastProgressTime - this.startTime) / 1000)
        : currentSpeed;
      
      // Exponential moving average with alpha = 0.3
      uploadSpeed = previousSpeed * 0.7 + currentSpeed * 0.3;
    } else if (timeElapsed > 0) {
      uploadSpeed = uploadedBytes / timeElapsed;
    }

    // Calculate time remaining
    let timeRemaining: number | null = null;
    if (uploadSpeed > 0 && uploadedBytes < this.file.size) {
      const remainingBytes = this.file.size - uploadedBytes;
      timeRemaining = remainingBytes / uploadSpeed;
    }

    this.lastProgressTime = now;
    this.lastProgressBytes = uploadedBytes;

    const progress: UploadProgress = {
      uploadedBytes,
      totalBytes: this.file.size,
      percentage: (uploadedBytes / this.file.size) * 100,
      chunksCompleted,
      totalChunks: this.chunks.length,
      timeElapsed,
      timeRemaining,
      uploadSpeed,
    };

    this.onProgress(progress);
  }

  private async uploadChunk(chunk: ChunkInfo): Promise<boolean> {
    const status = this.chunkStatuses.get(chunk.index);
    if (!status) return false;

    if (status.status === "completed") {
      return true;
    }

    status.status = "uploading";
    this.updateProgress();

    const blob = this.getChunkBlob(chunk);
    const formData = new FormData();
    formData.append("uploadId", this.uploadId!);
    formData.append("chunkIndex", chunk.index.toString());
    formData.append("chunk", blob);

    const controller = new AbortController();
    this.abortControllers.set(chunk.index, controller);

    try {
      const response = await fetch(`${this.backendUrl}/upload/chunk`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const result = await response.json();

      if (result.success) {
        status.status = "completed";
        this.updateProgress();
        return true;
      } else {
        throw new Error(result.error || "Chunk upload failed");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        status.status = "pending";
        return false;
      }

      status.error = error instanceof Error ? error.message : "Unknown error";
      status.status = "failed";
      this.updateProgress();
      return false;
    } finally {
      this.abortControllers.delete(chunk.index);
    }
  }

  private getPendingChunks(): number[] {
    const pending: number[] = [];

    for (const [index, status] of this.chunkStatuses.entries()) {
      if (status.status === "pending" || status.status === "failed") {
        pending.push(index);
      }
    }

    return pending.sort((a, b) => a - b);
  }

  private getActiveUploads(): number {
    let active = 0;
    for (const status of this.chunkStatuses.values()) {
      if (status.status === "uploading") {
        active++;
      }
    }
    return active;
  }

  async uploadAll(): Promise<void> {
    if (!this.uploadId) {
      throw new Error("Upload ID not set. Call initUpload first.");
    }

    while (true) {
      const pending = this.getPendingChunks();
      if (pending.length === 0) {
        break;
      }

      const active = this.getActiveUploads();
      const slotsAvailable = MAX_PARALLEL_CHUNKS - active;

      if (slotsAvailable <= 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }

      const chunksToUpload = pending.slice(0, slotsAvailable);
      const uploadPromises = chunksToUpload.map(async (chunkIndex) => {
        const chunk = this.chunks[chunkIndex];
        const status = this.chunkStatuses.get(chunkIndex)!;

        if (status.retries >= MAX_RETRIES) {
          throw new Error(
            `Chunk ${chunkIndex} failed after ${MAX_RETRIES} retries`
          );
        }

        const success = await this.uploadChunk(chunk);
        if (!success && status.status === "failed") {
          status.retries++;
          status.status = "pending";
          status.error = undefined;
        }

        return success;
      });

      await Promise.allSettled(uploadPromises);
    }

    const allCompleted = Array.from(this.chunkStatuses.values()).every(
      (s) => s.status === "completed"
    );

    if (!allCompleted) {
      throw new Error("Some chunks failed to upload");
    }
  }

  cancel(): void {
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();
  }

  getProgress(): UploadProgress {
    const now = Date.now();
    const timeElapsed = this.startTime > 0 ? (now - this.startTime) / 1000 : 0;
    
    let uploadedBytes = 0;
    let chunksCompleted = 0;

    for (const status of this.chunkStatuses.values()) {
      if (status.status === "completed") {
        const chunk = this.chunks[status.index];
        uploadedBytes += chunk.size;
        chunksCompleted++;
      }
    }

    let uploadSpeed = 0;
    let timeRemaining: number | null = null;

    if (timeElapsed > 0 && uploadedBytes > 0) {
      uploadSpeed = uploadedBytes / timeElapsed;
      if (uploadSpeed > 0 && uploadedBytes < this.file.size) {
        const remainingBytes = this.file.size - uploadedBytes;
        timeRemaining = remainingBytes / uploadSpeed;
      }
    }

    return {
      uploadedBytes,
      totalBytes: this.file.size,
      percentage: (uploadedBytes / this.file.size) * 100,
      chunksCompleted,
      totalChunks: this.chunks.length,
      timeElapsed,
      timeRemaining,
      uploadSpeed,
    };
  }
}

