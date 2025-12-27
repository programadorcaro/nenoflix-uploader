export interface MultipleFileItem {
  id: string;
  file: File;
  fileName: string; // Nome sugerido/editável
  originalFileName: string; // Nome original (somente leitura)
  status: "pending" | "uploading" | "completed" | "error";
  progress: number;
  error?: string;
  uploadId?: string;
  timeElapsed?: number;
  timeRemaining?: number | null;
  uploadSpeed?: number;
  finalFilePath?: string;
}

export interface MultipleUploadState {
  files: MultipleFileItem[];
  currentUploadIndex: number;
  isUploading: boolean;
  allCompleted: boolean;
  error: string | null;
}

