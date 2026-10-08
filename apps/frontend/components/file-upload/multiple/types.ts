export interface MultipleFileItem {
  id: string;
  file: File;
  fileName: string; // Nome sugerido/editável
  originalFileName: string; // Nome original (somente leitura)
  status: "pending" | "uploading" | "completing" | "completed" | "error";
  progress: number;
  error?: string;
  timeElapsed?: number;
  uploadSpeed?: number;
  finalFilePath?: string;
}

export interface MultipleUploadState {
  files: MultipleFileItem[];
  currentUploadIndex: number;
  isUploading: boolean;
  error: string | null;
}
