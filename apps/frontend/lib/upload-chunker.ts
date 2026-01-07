const MAX_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB máximo (reduzido de 200MB para melhorar em conexões lentas)
const MAX_PARALLEL_CHUNKS = 5; // Máximo de uploads simultâneos
const MIN_PARALLEL_CHUNKS = 1; // Mínimo de uploads simultâneos (começa conservador)
const MAX_RETRIES = 5; // Aumentado para permitir mais tentativas com backoff
const MIN_TIMEOUT = 30 * 1000; // 30 segundos mínimo
const MAX_TIMEOUT = 10 * 60 * 1000; // 10 minutos máximo
const STUCK_CHUNK_THRESHOLD = 2 * 60 * 1000; // 2 minutos para considerar chunk preso (reduzido de 6min)
const SERVER_STATUS_CHECK_INTERVAL = 10 * 1000; // Verificar status do servidor a cada 10 segundos
const PARALLELISM_ADJUST_INTERVAL = 5 * 1000; // Ajustar paralelismo a cada 5 segundos

function calculateOptimalChunkSize(totalSize: number): number {
  // Configuração adaptativa baseada no tamanho do arquivo
  // Criamos mais chunks menores para reduzir risco de timeout e melhorar recuperação

  let targetChunks: number;
  let minChunkSize: number;

  if (totalSize < 500 * 1024 * 1024) {
    // Arquivos pequenos (< 500MB): 100 chunks, mínimo 1MB
    targetChunks = 100;
    minChunkSize = 1 * 1024 * 1024;
  } else if (totalSize < 5 * 1024 * 1024 * 1024) {
    // Arquivos médios (500MB - 5GB): 200 chunks, mínimo 2MB
    targetChunks = 200;
    minChunkSize = 2 * 1024 * 1024;
  } else {
    // Arquivos grandes (> 5GB): 300 chunks, mínimo 5MB
    targetChunks = 300;
    minChunkSize = 5 * 1024 * 1024;
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

function calculateExponentialBackoff(retryCount: number): number {
  // Backoff exponencial: 1s, 2s, 4s, 8s, 16s
  const baseDelay = Math.min(1000 * Math.pow(2, retryCount), 16000);
  // Adicionar jitter aleatório (0-30% do delay) para evitar thundering herd
  const jitter = baseDelay * 0.3 * Math.random();
  return baseDelay + jitter;
}

function calculateAdaptiveTimeout(
  chunkSize: number,
  uploadSpeed: number
): number {
  if (uploadSpeed <= 0) {
    return MAX_TIMEOUT; // Se não temos velocidade, usar timeout máximo
  }

  // Calcular timeout baseado no tamanho do chunk e velocidade
  // Multiplicar por 3 para dar margem de segurança
  const estimatedTime = (chunkSize / uploadSpeed) * 3;
  return Math.max(MIN_TIMEOUT, Math.min(MAX_TIMEOUT, estimatedTime));
}

function calculateAdaptiveParallelism(uploadSpeed: number): number {
  // Começar com 1 chunk e aumentar gradualmente até 5 baseado na velocidade
  // Velocidade em bytes por segundo
  const mbps = uploadSpeed / (1024 * 1024); // Converter para MB/s

  if (mbps < 0.5) {
    // Conexão muito lenta: usar apenas 1 chunk
    return 1;
  } else if (mbps < 1) {
    // Conexão lenta: usar 2 chunks
    return 2;
  } else if (mbps < 2) {
    // Conexão média: usar 3 chunks
    return 3;
  } else if (mbps < 5) {
    // Conexão boa: usar 4 chunks
    return 4;
  } else {
    // Conexão rápida: usar 5 chunks (máximo)
    return 5;
  }
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
  lastRetryTime?: number; // Timestamp da última tentativa de retry
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
  private currentParallelism: number = MIN_PARALLEL_CHUNKS; // Paralelismo atual (adaptativo)
  private lastParallelismAdjust: number = 0; // Timestamp da última ajuste de paralelismo
  private serverStatusCheckInterval?: NodeJS.Timeout; // Interval para verificar status do servidor
  private lastUploadSpeed: number = 0; // Última velocidade de upload calculada

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
        // Use real progress for currently uploading chunks
        const activeBytes = this.activeUploadBytes.get(status.index) || 0;
        const chunk = this.chunks[status.index];
        if (chunk) {
          uploadedBytes += Math.min(activeBytes, chunk.size);
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
      this.lastUploadSpeed = uploadSpeed;
    } else if (timeElapsed > 0) {
      uploadSpeed = uploadedBytes / timeElapsed;
      this.lastUploadSpeed = uploadSpeed;
    } else {
      uploadSpeed = this.lastUploadSpeed;
    }

    // Ajustar paralelismo baseado na velocidade
    if (now - this.lastParallelismAdjust > PARALLELISM_ADJUST_INTERVAL) {
      const newParallelism = calculateAdaptiveParallelism(uploadSpeed);
      if (newParallelism !== this.currentParallelism) {
        this.currentParallelism = Math.max(
          MIN_PARALLEL_CHUNKS,
          Math.min(MAX_PARALLEL_CHUNKS, newParallelism)
        );
        this.lastParallelismAdjust = now;
      }
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

  private async checkServerStatus(): Promise<void> {
    if (!this.uploadId) return;

    try {
      const response = await fetch(
        `${this.backendUrl}/upload/status/${this.uploadId}`
      );
      if (!response.ok) return;

      const result = await response.json();
      if (result.success && result.receivedChunks) {
        // Sincronizar chunks recebidos pelo servidor
        const serverReceivedChunks = new Set(result.receivedChunks || []);
        for (const [index, status] of this.chunkStatuses.entries()) {
          // Se o servidor já recebeu o chunk mas localmente está como pending/failed,
          // marcar como completed
          if (
            serverReceivedChunks.has(index) &&
            (status.status === "pending" || status.status === "failed")
          ) {
            status.status = "completed";
            this.chunkUploadStartTimes.delete(index);
            this.activeUploadBytes.delete(index);
          }
        }
      }
    } catch (error) {
      // Ignorar erros de verificação de status (não crítico)
      console.debug("Server status check failed:", error);
    }
  }

  private async uploadChunk(chunk: ChunkInfo): Promise<boolean> {
    const status = this.chunkStatuses.get(chunk.index);
    if (!status) return false;

    if (status.status === "completed") {
      return true;
    }

    // Verificar se precisa esperar pelo backoff antes de tentar novamente
    if (
      status.status === "failed" &&
      status.lastRetryTime &&
      status.retries > 0
    ) {
      const backoffDelay = calculateExponentialBackoff(status.retries - 1);
      const timeSinceLastRetry = Date.now() - status.lastRetryTime;
      if (timeSinceLastRetry < backoffDelay) {
        // Ainda não passou tempo suficiente do backoff
        return false;
      }
    }

    status.status = "uploading";
    const uploadStartTime = Date.now();
    this.chunkUploadStartTimes.set(chunk.index, uploadStartTime);
    this.activeUploadBytes.set(chunk.index, 0); // Reset progress tracking
    this.updateProgress();

    const blob = this.getChunkBlob(chunk);
    const formData = new FormData();
    formData.append("uploadId", this.uploadId!);
    formData.append("chunkIndex", chunk.index.toString());
    formData.append("chunk", blob);

    // Calcular timeout adaptativo baseado na velocidade atual
    const adaptiveTimeout = calculateAdaptiveTimeout(
      chunk.size,
      this.lastUploadSpeed
    );

    const controller = new AbortController();
    this.abortControllers.set(chunk.index, controller);

    // Set up timeout adaptativo
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, adaptiveTimeout);

    try {
      // Usar XMLHttpRequest para rastrear progresso real
      const xhr = new XMLHttpRequest();
      const uploadPromise = new Promise<{ success: boolean; error?: string }>(
        (resolve) => {
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              // Atualizar bytes enviados em tempo real
              this.activeUploadBytes.set(chunk.index, event.loaded);
              this.updateProgress(true);
            }
          };

          xhr.onload = () => {
            clearTimeout(timeoutId);
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const result = JSON.parse(xhr.responseText);
                if (result.success) {
                  resolve({ success: true });
                } else {
                  resolve({
                    success: false,
                    error: result.error || "Chunk upload failed",
                  });
                }
              } catch {
                resolve({ success: false, error: "Invalid response" });
              }
            } else {
              resolve({
                success: false,
                error: `HTTP error! status: ${xhr.status}`,
              });
            }
          };

          xhr.onerror = () => {
            clearTimeout(timeoutId);
            resolve({
              success: false,
              error: "Network error during upload",
            });
          };

          xhr.onabort = () => {
            clearTimeout(timeoutId);
            resolve({
              success: false,
              error: "Upload timeout or cancelled",
            });
          };

          xhr.open("POST", `${this.backendUrl}/upload/chunk`);
          xhr.send(formData);
        }
      );

      // Aguardar upload ou timeout
      const timeoutPromise = new Promise<{ success: boolean; error: string }>(
        (resolve) => {
          controller.signal.addEventListener("abort", () => {
            resolve({ success: false, error: "Upload timeout" });
          });
        }
      );

      const result = await Promise.race([uploadPromise, timeoutPromise]);

      if (result.success) {
        status.status = "completed";
        status.retries = 0; // Reset retries on success
        this.chunkUploadStartTimes.delete(chunk.index);
        this.activeUploadBytes.delete(chunk.index);
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
        status.lastRetryTime = Date.now();
        this.chunkUploadStartTimes.delete(chunk.index);
        this.activeUploadBytes.delete(chunk.index);
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
            error.message.includes("aborted") ||
            error.message.includes("timeout")));

      if (isNetworkError) {
        status.error =
          error instanceof Error
            ? error.message
            : "Network error during upload";
        status.status = "failed";
        status.lastRetryTime = Date.now();
      } else {
        status.error = error instanceof Error ? error.message : "Unknown error";
        status.status = "failed";
        status.lastRetryTime = Date.now();
      }

      this.chunkUploadStartTimes.delete(chunk.index);
      this.activeUploadBytes.delete(chunk.index);
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
        // Verificar se pode tentar novamente (backoff)
        if (status.status === "failed" && status.lastRetryTime) {
          const backoffDelay = calculateExponentialBackoff(status.retries);
          const timeSinceLastRetry = Date.now() - status.lastRetryTime;
          if (timeSinceLastRetry < backoffDelay) {
            // Ainda não passou tempo suficiente do backoff, pular este chunk por agora
            continue;
          }
        }
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
          // Verificar se há progresso real
          const activeBytes = this.activeUploadBytes.get(index) || 0;
          const chunk = this.chunks[index];
          const expectedProgress = chunk
            ? (now - startTime) /
              calculateAdaptiveTimeout(chunk.size, this.lastUploadSpeed)
            : 0;

          // Se não há progresso significativo, considerar travado
          if (
            chunk &&
            activeBytes < chunk.size * 0.1 &&
            expectedProgress > 0.5
          ) {
            stuckChunks.push(index);
          } else if (now - startTime > STUCK_CHUNK_THRESHOLD * 1.5) {
            // Se passou muito tempo mesmo com algum progresso, considerar travado
            stuckChunks.push(index);
          }
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
        status.lastRetryTime = Date.now();
        this.chunkUploadStartTimes.delete(chunkIndex);
        this.activeUploadBytes.delete(chunkIndex);
      }
    }
  }

  async uploadAll(): Promise<void> {
    if (!this.uploadId) {
      throw new Error("Upload ID not set. Call initUpload first.");
    }

    // Start periodic progress updates for smoother feedback
    this.startProgressInterval();

    // Start periodic server status checks
    this.startServerStatusCheck();

    try {
      while (true) {
        const pending = this.getPendingChunks();
        if (pending.length === 0) {
          break;
        }

        const active = this.getActiveUploads();
        const slotsAvailable = this.currentParallelism - active;

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
      this.stopServerStatusCheck();
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

  private startServerStatusCheck(): void {
    // Check server status periodically to sync chunks
    this.serverStatusCheckInterval = setInterval(() => {
      this.checkServerStatus();
    }, SERVER_STATUS_CHECK_INTERVAL);
  }

  private stopServerStatusCheck(): void {
    if (this.serverStatusCheckInterval) {
      clearInterval(this.serverStatusCheckInterval);
      this.serverStatusCheckInterval = undefined;
    }
  }

  cancel(): void {
    this.stopProgressInterval();
    this.stopServerStatusCheck();
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
