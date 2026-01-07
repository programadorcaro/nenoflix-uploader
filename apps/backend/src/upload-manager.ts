import { join } from "path";
import { existsSync, statSync } from "fs";

export interface UploadSession {
  uploadId: string;
  fileName: string;
  folderName: string;
  destinationPath: string;
  totalSize: number;
  totalChunks: number;
  chunkSize: number;
  receivedChunks: Set<number>;
  tempFilePath: string;
  createdAt: number;
  lastActivity: number;
  processing?: boolean; // Indica se está processando a conclusão
  finalPath?: string; // Caminho final do arquivo após processamento
  processingError?: string; // Erro durante processamento
}

const SESSION_TTL = 48 * 60 * 60 * 1000; // 48 hours (aumentado de 24h)
const CLEANUP_INTERVAL = 20 * 60 * 1000; // 20 minutes
const ACTIVE_SESSION_THRESHOLD = 5 * 60 * 1000; // 5 minutos - considerar sessão ativa se teve atividade recente

class UploadManager {
  private sessions: Map<string, UploadSession> = new Map();

  constructor() {
    this.startCleanupInterval();
  }

  createSession(
    uploadId: string,
    fileName: string,
    folderName: string,
    destinationPath: string,
    totalSize: number,
    chunkSize: number,
    tempFilePath: string
  ): UploadSession {
    const totalChunks = Math.ceil(totalSize / chunkSize);

    const session: UploadSession = {
      uploadId,
      fileName,
      folderName,
      destinationPath,
      totalSize,
      totalChunks,
      chunkSize,
      receivedChunks: new Set(),
      tempFilePath,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    this.sessions.set(uploadId, session);
    return session;
  }

  getSession(uploadId: string): UploadSession | undefined {
    const session = this.sessions.get(uploadId);
    if (session) {
      session.lastActivity = Date.now();
    }
    return session;
  }

  markChunkReceived(uploadId: string, chunkIndex: number): boolean {
    const session = this.getSession(uploadId);
    if (!session) {
      return false;
    }

    if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      return false;
    }

    session.receivedChunks.add(chunkIndex);
    session.lastActivity = Date.now();
    return true;
  }

  getReceivedChunks(uploadId: string): number[] {
    const session = this.getSession(uploadId);
    if (!session) {
      return [];
    }

    return Array.from(session.receivedChunks).sort((a, b) => a - b);
  }

  isComplete(uploadId: string): boolean {
    const session = this.getSession(uploadId);
    if (!session) {
      return false;
    }

    return session.receivedChunks.size === session.totalChunks;
  }

  deleteSession(uploadId: string): void {
    this.sessions.delete(uploadId);
  }

  getSessionStatus(uploadId: string) {
    const session = this.getSession(uploadId);
    if (!session) {
      return null;
    }

    const receivedChunks = Array.from(session.receivedChunks).sort(
      (a, b) => a - b
    );
    const missingChunks: number[] = [];

    for (let i = 0; i < session.totalChunks; i++) {
      if (!session.receivedChunks.has(i)) {
        missingChunks.push(i);
      }
    }

    const uploadedBytes = receivedChunks.length * session.chunkSize;
    const progress = (receivedChunks.length / session.totalChunks) * 100;

    return {
      uploadId: session.uploadId,
      fileName: session.fileName,
      totalSize: session.totalSize,
      totalChunks: session.totalChunks,
      receivedChunks: receivedChunks.length,
      missingChunks,
      uploadedBytes: Math.min(uploadedBytes, session.totalSize),
      progress: Math.min(progress, 100),
      isComplete: this.isComplete(uploadId),
      tempFilePath: session.tempFilePath,
      fileExists: existsSync(session.tempFilePath),
      fileSize: existsSync(session.tempFilePath)
        ? statSync(session.tempFilePath).size
        : 0,
      processing: session.processing || false,
      finalPath: session.finalPath,
      processingError: session.processingError,
    };
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, CLEANUP_INTERVAL);
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredUploadIds: string[] = [];

    for (const [uploadId, session] of this.sessions.entries()) {
      const age = now - session.lastActivity;
      const timeSinceCreation = now - session.createdAt;

      // Não deletar sessões que estão ativas (atividade recente)
      const isActive = age < ACTIVE_SESSION_THRESHOLD;

      // Só deletar se:
      // 1. Passou o TTL desde a última atividade E
      // 2. Não está ativa (sem atividade recente) E
      // 3. Passou pelo menos 1 hora desde a criação (evitar deletar sessões recém-criadas)
      if (
        age > SESSION_TTL &&
        !isActive &&
        timeSinceCreation > 60 * 60 * 1000
      ) {
        expiredUploadIds.push(uploadId);
      }
    }

    for (const uploadId of expiredUploadIds) {
      this.sessions.delete(uploadId);
    }

    if (expiredUploadIds.length > 0) {
      console.log(
        `Cleaned up ${expiredUploadIds.length} expired upload sessions`
      );
    }
  }
}

export const uploadManager = new UploadManager();
