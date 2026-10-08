"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ALLOWED_EXTENSIONS } from "../constants";
import { estimateUploadTime, formatFileSize, getFileExtension } from "../utils/format";
import { useFileDrop } from "../utils/use-file-drop";
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
  const { isDragging, inputRef: fileInputRef, open, onInputChange, dropProps } =
    useFileDrop((files) => files[0] && onFileSelect(files[0]), disabled);

  const input = (
    <input
      ref={fileInputRef}
      type="file"
      accept={accept}
      onChange={onInputChange}
      disabled={disabled}
      className="hidden"
    />
  );

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-xl border-2 border-primary/20 bg-primary/5 p-3 sm:p-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
          {getFileExtension(file.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={file.name}>
            {file.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(file.size)} · ~{estimateUploadTime(file.size)}
          </p>
        </div>
        <button
          type="button"
          onClick={onFileRemove}
          disabled={disabled}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
          aria-label="Remover arquivo"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-5" strokeWidth={2} />
        </button>
        {input}
      </div>
    );
  }

  return (
    <div
      {...dropProps}
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open()}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors sm:p-10",
        isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      {input}
      <div className="flex size-14 items-center justify-center rounded-full bg-muted sm:size-16">
        <HugeiconsIcon icon={CloudUploadIcon} className="size-7 text-muted-foreground sm:size-8" strokeWidth={2} />
      </div>
      <div>
        <p className="text-base font-semibold">
          <span className="sm:hidden">Toque para escolher o arquivo</span>
          <span className="hidden sm:inline">Arraste o arquivo aqui</span>
        </p>
        <p className="mt-1 hidden text-sm text-muted-foreground sm:block">ou clique para selecionar</p>
      </div>
      <p className="text-xs text-muted-foreground">{ALLOWED_EXTENSIONS.join(", ")}</p>
    </div>
  );
}
