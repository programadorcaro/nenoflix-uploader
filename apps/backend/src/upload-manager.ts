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
}

const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL = 20 * 60 * 1000; // 20 minutes

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
      if (age > SESSION_TTL) {
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
