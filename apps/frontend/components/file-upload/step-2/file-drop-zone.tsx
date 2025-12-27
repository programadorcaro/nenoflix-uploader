"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ALLOWED_EXTENSIONS } from "../constants";
import { HugeiconsIcon } from "@hugeicons/react";
import { CloudUploadIcon, Cancel01Icon } from "@hugeicons/core-free-icons";

interface FileDropZoneProps {
  file: File | null;
  onFileSelect: (file: File | null) => void;
  onFileRemove: () => void;
  disabled?: boolean;
  accept?: string;
}

export function FileDropZone({
  file,
  onFileSelect,
  onFileRemove,
  disabled = false,
  accept = ".mkv,.mp4,.srt",
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const validateFile = (file: File): boolean => {
    const fileName = file.name;
    const lastDotIndex = fileName.lastIndexOf(".");
    if (lastDotIndex === -1 || lastDotIndex === fileName.length - 1) {
      return false;
    }
    const extension = fileName.substring(lastDotIndex).toLowerCase();
    return ALLOWED_EXTENSIONS.includes(extension);
  };

  const handleFile = (file: File) => {
    if (!validateFile(file)) {
      return;
    }
    onFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFile(droppedFile);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFile(selectedFile);
    }
  };

  const handleClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const getFileExtension = (fileName: string): string => {
    const lastDotIndex = fileName.lastIndexOf(".");
    if (lastDotIndex === -1) return "";
    return fileName.substring(lastDotIndex + 1).toUpperCase();
  };

  const estimateUploadTime = (fileSizeBytes: number): string => {
    const averageSpeedMbps = 10;
    const speedBytesPerSecond = (averageSpeedMbps * 1024 * 1024) / 8;
    const seconds = fileSizeBytes / speedBytesPerSecond;

    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  };

  if (file) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <div className="shrink-0 w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-semibold text-primary">
                    {getFileExtension(file.name)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Extensão:</span>
                  <span className="ml-2 font-medium">
                    {getFileExtension(file.name)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Tamanho:</span>
                  <span className="ml-2 font-medium">
                    {formatFileSize(file.size)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Tipo:</span>
                  <span className="ml-2 font-medium">{file.type || "N/A"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Tempo estimado:</span>
                  <span className="ml-2 font-medium">
                    {estimateUploadTime(file.size)}
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onFileRemove}
              disabled={disabled}
              className="shrink-0 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
              aria-label="Remover arquivo"
            >
              <HugeiconsIcon
                icon={Cancel01Icon}
                className="h-5 w-5"
                strokeWidth={2}
              />
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileInputChange}
          disabled={disabled}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={cn(
        "relative border-2 border-dashed rounded-xl p-8 sm:p-12 text-center transition-all duration-200 cursor-pointer",
        isDragging
          ? "border-primary bg-primary/5 scale-[1.02]"
          : "border-border hover:border-primary/50 hover:bg-muted/50",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileInputChange}
        disabled={disabled}
        className="hidden"
      />
      <div className="space-y-3 sm:space-y-4">
        <div className="mx-auto w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-muted flex items-center justify-center">
          <HugeiconsIcon
            icon={CloudUploadIcon}
            className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground"
            strokeWidth={2}
          />
        </div>
        <div>
          <p className="text-base sm:text-lg font-semibold">Arraste e solte o arquivo aqui</p>
          <p className="text-sm text-muted-foreground mt-2">
            ou clique para selecionar
          </p>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Formatos permitidos: {ALLOWED_EXTENSIONS.join(", ")}
        </p>
      </div>
    </div>
  );
}
