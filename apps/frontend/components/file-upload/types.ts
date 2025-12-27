export type ContentType = "movies" | "series" | "animes" | null;

export interface Step1Data {
  contentType: ContentType;
  baseDestinationPath: string;
  subFolderName: string;
  selectedExistingFolder: string;
  useMultipleUpload?: boolean; // Para séries/animes: usar upload múltiplo
}

export interface Step2Data {
  selectedFile: File | null;
  fileName: string;
}

export interface Step3Data {
  folderName: string;
  fileName: string;
  selectedFile: File | null;
}

export type UploadStatus = "idle" | "uploading" | "completing" | "success" | "error";

export interface FileUploadState {
  step1: Step1Data;
  step2: Step2Data;
  step3: Step3Data;
  progress: number;
  isUploading: boolean;
  uploadStatus: UploadStatus;
  error: string | null;
  timeElapsed?: number;
  timeRemaining?: number | null;
  uploadSpeed?: number;
  finalFilePath?: string;
}

