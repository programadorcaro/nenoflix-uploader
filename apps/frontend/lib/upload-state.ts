const STORAGE_KEY_PREFIX = "upload_session_";

export interface UploadSessionData {
  uploadId: string;
  fileName: string;
  folderName: string;
  destinationPath: string;
  totalSize: number;
  totalChunks: number;
  chunkSize: number;
  timestamp: number;
}

export class UploadStateManager {
  private storageKey: string;

  constructor(uploadId: string) {
    this.storageKey = `${STORAGE_KEY_PREFIX}${uploadId}`;
  }

  save(sessionData: UploadSessionData): void {
    try {
      const data = JSON.stringify({
        ...sessionData,
        timestamp: Date.now(),
      });
      localStorage.setItem(this.storageKey, data);
    } catch (error) {
      console.warn("Failed to save upload state:", error);
    }
  }

  load(): UploadSessionData | null {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (!data) return null;

      const sessionData = JSON.parse(data) as UploadSessionData;
      const age = Date.now() - sessionData.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      if (age > maxAge) {
        this.clear();
        return null;
      }

      return sessionData;
    } catch (error) {
      console.warn("Failed to load upload state:", error);
      this.clear();
      return null;
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.warn("Failed to clear upload state:", error);
    }
  }

  static clearAll(): void {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
          keys.push(key);
        }
      }
      keys.forEach((key) => localStorage.removeItem(key));
    } catch (error) {
      console.warn("Failed to clear all upload states:", error);
    }
  }

  static getAllSessions(): UploadSessionData[] {
    const sessions: UploadSessionData[] = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
          const data = localStorage.getItem(key);
          if (data) {
            try {
              const sessionData = JSON.parse(data) as UploadSessionData;
              const age = Date.now() - sessionData.timestamp;
              const maxAge = 24 * 60 * 60 * 1000; // 24 hours

              if (age <= maxAge) {
                sessions.push(sessionData);
              }
            } catch {
              // Skip invalid entries
            }
          }
        }
      }
    } catch (error) {
      console.warn("Failed to get all sessions:", error);
    }

    return sessions;
  }
}

