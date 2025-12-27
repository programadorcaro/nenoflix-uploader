"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ALLOWED_EXTENSIONS } from "../constants";
import { HugeiconsIcon } from "@hugeicons/react";
import { CloudUploadIcon, Cancel01Icon } from "@hugeicons/core-free-icons";
import type { MultipleFileItem } from "./types";

interface MultipleFileSelectorProps {
  files: MultipleFileItem[];
  onFilesSelect: (files: File[]) => void;
  onFileRemove: (id: string) => void;
  disabled?: boolean;
  accept?: string;
}

export function MultipleFileSelector({
  files,
  onFilesSelect,
  onFileRemove,
  disabled = false,
  accept = ".mkv,.mp4,.srt",
}: MultipleFileSelectorProps) {
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

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;

    const validFiles: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file && validateFile(file)) {
        validFiles.push(file);
      }
    }

    if (validFiles.length > 0) {
      onFilesSelect(validFiles);
    }
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

    handleFiles(e.dataTransfer.files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    // Reset input to allow selecting same files again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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

  if (files.length > 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-foreground">
              {files.length} arquivo{files.length !== 1 ? "s" : ""} selecionado
              {files.length !== 1 ? "s" : ""}
            </p>
            <button
              type="button"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.click();
                }
              }}
              disabled={disabled}
              className="text-sm text-primary hover:text-primary/80 font-medium disabled:opacity-50"
            >
              Adicionar mais
            </button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {files.map((fileItem) => (
              <div
                key={fileItem.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background"
              >
                <div className="shrink-0 w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-semibold text-primary">
                    {fileItem.originalFileName
                      .substring(fileItem.originalFileName.lastIndexOf(".") + 1)
                      .toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {fileItem.originalFileName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(fileItem.file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onFileRemove(fileItem.id)}
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
            ))}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
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
        multiple
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
          <p className="text-base sm:text-lg font-semibold">
            Arraste e solte os arquivos aqui
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            ou clique para selecionar múltiplos arquivos
          </p>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Formatos permitidos: {ALLOWED_EXTENSIONS.join(", ")}
        </p>
      </div>
    </div>
  );
}
