const MAX_CHUNK_SIZE = 200 * 1024 * 1024; // 200MB maximum (permite chunks maiores para arquivos grandes)
const MAX_PARALLEL_CHUNKS = 5; // Limite de uploads simultâneos para estabilidade do sistema
const MAX_RETRIES = 3;
const CHUNK_UPLOAD_TIMEOUT = 5 * 60 * 1000; // 5 minutos por chunk
const STUCK_CHUNK_THRESHOLD = 6 * 60 * 1000; // 6 minutos para considerar chunk preso (timeout é 5min)

function calculateOptimalChunkSize(totalSize: number): number {
  // Configuração adaptativa baseada no tamanho do arquivo
  // Aumentamos o número de chunks para reduzir o tamanho individual
  // e evitar timeouts, mantendo 5 chunks simultâneos

  let targetChunks: number;
  let minChunkSize: number;

  if (totalSize < 500 * 1024 * 1024) {
    // Arquivos pequenos (< 500MB): 80 chunks, mínimo 10MB
    targetChunks = 80;
    minChunkSize = 10 * 1024 * 1024;
  } else if (totalSize < 5 * 1024 * 1024 * 1024) {
    // Arquivos médios (500MB - 5GB): 200 chunks, mínimo 50MB
    targetChunks = 200;
    minChunkSize = 50 * 1024 * 1024;
  } else {
    // Arquivos grandes (> 5GB): 400 chunks, mínimo 50MB
    targetChunks = 400;
    minChunkSize = 50 * 1024 * 1024;
  }

  const idealChunkSize = Math.floor(totalSize / targetChunks);

  if (idealChunkSize < minChunkSize) {
    return minChunkSize;
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
  private progressInterval?: NodeJS.Timeout;
  private activeUploadBytes: Map<number, number>; // Track bytes uploaded for active chunks
  private initialTimeRemaining: number | null = null; // Fixed time estimate calculated once
  private chunkUploadStartTimes: Map<number, number>; // Track when each chunk started uploading

  constructor(file: File, backendUrl: string, chunkSize?: number) {
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
    this.activeUploadBytes = new Map();
    this.chunkUploadStartTimes = new Map();
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

  private updateProgress(includeActiveUploads: boolean = false): void {
    if (!this.onProgress) return;

    const now = Date.now();

    if (this.startTime === 0) {
      this.startTime = now;
      this.lastProgressTime = now;
      this.lastProgressBytes = 0;
    }

    let uploadedBytes = 0;
    let chunksCompleted = 0;

    // Count completed chunks
    for (const status of this.chunkStatuses.values()) {
      if (status.status === "completed") {
        const chunk = this.chunks[status.index];
        if (chunk) {
          uploadedBytes += chunk.size;
          chunksCompleted++;
        }
      } else if (includeActiveUploads && status.status === "uploading") {
        // Estimate progress for currently uploading chunks
        const activeBytes = this.activeUploadBytes.get(status.index) || 0;
        const chunk = this.chunks[status.index];
        if (chunk) {
          // Use a conservative estimate: assume 50% of chunk is uploaded if we don't have exact data
          const estimatedBytes =
            activeBytes > 0 ? activeBytes : chunk.size * 0.5;
          uploadedBytes += Math.min(estimatedBytes, chunk.size);
        }
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
      const previousSpeed =
        this.lastProgressBytes > 0
          ? this.lastProgressBytes /
            ((this.lastProgressTime - this.startTime) / 1000)
          : currentSpeed;

      // Exponential moving average with alpha = 0.3
      uploadSpeed = previousSpeed * 0.7 + currentSpeed * 0.3;
    } else if (timeElapsed > 0) {
      uploadSpeed = uploadedBytes / timeElapsed;
    }

    // Calculate initial time remaining only once when we have a reliable speed estimate
    // Wait for at least 2 seconds and some progress to ensure accuracy
    if (
      this.initialTimeRemaining === null &&
      uploadSpeed > 0 &&
      timeElapsed >= 2 &&
      uploadedBytes > 0
    ) {
      const remainingBytes = this.file.size - uploadedBytes;
      this.initialTimeRemaining = remainingBytes / uploadSpeed;
    }

    // Use fixed time estimate if available, otherwise null
    const timeRemaining: number | null = this.initialTimeRemaining;

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
    const uploadStartTime = Date.now();
    this.chunkUploadStartTimes.set(chunk.index, uploadStartTime);
    this.updateProgress();

    const blob = this.getChunkBlob(chunk);
    const formData = new FormData();
    formData.append("uploadId", this.uploadId!);
    formData.append("chunkIndex", chunk.index.toString());
    formData.append("chunk", blob);

    const controller = new AbortController();
    this.abortControllers.set(chunk.index, controller);

    // Set up timeout
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, CHUNK_UPLOAD_TIMEOUT);

    try {
      const response = await fetch(`${this.backendUrl}/upload/chunk`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        status.status = "completed";
        this.chunkUploadStartTimes.delete(chunk.index);
        this.updateProgress();
        return true;
      } else {
        throw new Error(result.error || "Chunk upload failed");
      }
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort errors (timeout or manual cancellation)
      if (error instanceof Error && error.name === "AbortError") {
        status.status = "pending";
        status.error = "Upload timeout or cancelled";
        this.chunkUploadStartTimes.delete(chunk.index);
        return false;
      }

      // Handle network errors (ECONNRESET, network failures, etc.)
      const isNetworkError =
        error instanceof TypeError ||
        (error instanceof Error &&
          (error.message.includes("fetch") ||
            error.message.includes("network") ||
            error.message.includes("Failed to fetch") ||
            error.message.includes("ECONNRESET") ||
            error.message.includes("aborted")));

      if (isNetworkError) {
        status.error =
          error instanceof Error
            ? error.message
            : "Network error during upload";
        status.status = "failed";
      } else {
        status.error = error instanceof Error ? error.message : "Unknown error";
        status.status = "failed";
      }

      this.chunkUploadStartTimes.delete(chunk.index);
      this.updateProgress();
      return false;
    } finally {
      this.abortControllers.delete(chunk.index);
    }
  }

  private getPendingChunks(): number[] {
    // First, detect and reset any stuck chunks
    this.detectStuckChunks();

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

  private detectStuckChunks(): void {
    const now = Date.now();
    const stuckChunks: number[] = [];

    for (const [index, status] of this.chunkStatuses.entries()) {
      if (status.status === "uploading") {
        const startTime = this.chunkUploadStartTimes.get(index);
        if (startTime && now - startTime > STUCK_CHUNK_THRESHOLD) {
          stuckChunks.push(index);
        }
      }
    }

    // Reset stuck chunks to pending
    for (const chunkIndex of stuckChunks) {
      const status = this.chunkStatuses.get(chunkIndex);
      if (status) {
        // Abort any ongoing request
        const controller = this.abortControllers.get(chunkIndex);
        if (controller) {
          controller.abort();
          this.abortControllers.delete(chunkIndex);
        }

        // Reset status
        status.status = "pending";
        status.error = "Chunk stuck in uploading state, reset for retry";
        this.chunkUploadStartTimes.delete(chunkIndex);
      }
    }
  }

  async uploadAll(): Promise<void> {
    if (!this.uploadId) {
      throw new Error("Upload ID not set. Call initUpload first.");
    }

    // Start periodic progress updates for smoother feedback
    this.startProgressInterval();

    try {
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
          if (!chunk) return false;
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
    } finally {
      // Stop periodic progress updates
      this.stopProgressInterval();
    }
  }

  private startProgressInterval(): void {
    // Update progress every 200ms for smooth feedback, even during chunk uploads
    this.progressInterval = setInterval(() => {
      this.updateProgress(true); // Include active uploads in progress calculation
    }, 200);
  }

  private stopProgressInterval(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = undefined;
    }
  }

  cancel(): void {
    this.stopProgressInterval();
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();
    this.activeUploadBytes.clear();
    this.chunkUploadStartTimes.clear();
  }

  getProgress(): UploadProgress {
    const now = Date.now();
    const timeElapsed = this.startTime > 0 ? (now - this.startTime) / 1000 : 0;

    let uploadedBytes = 0;
    let chunksCompleted = 0;

    for (const status of this.chunkStatuses.values()) {
      if (status.status === "completed") {
        const chunk = this.chunks[status.index];
        if (chunk) {
          uploadedBytes += chunk.size;
          chunksCompleted++;
        }
      }
    }

    let uploadSpeed = 0;
    if (timeElapsed > 0 && uploadedBytes > 0) {
      uploadSpeed = uploadedBytes / timeElapsed;
    }

    // Use fixed time estimate if available
    const timeRemaining: number | null = this.initialTimeRemaining;

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
