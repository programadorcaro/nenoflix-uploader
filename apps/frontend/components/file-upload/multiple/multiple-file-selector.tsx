"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ALLOWED_EXTENSIONS } from "../constants";
import { formatFileSize, getFileExtension } from "../utils/format";
import { useFileDrop } from "../utils/use-file-drop";
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
  const { isDragging, inputRef: fileInputRef, open, onInputChange, dropProps } =
    useFileDrop(onFilesSelect, disabled);

  const input = (
    <input
      ref={fileInputRef}
      type="file"
      accept={accept}
      multiple
      onChange={onInputChange}
      disabled={disabled}
      className="hidden"
    />
  );

  if (files.length > 0) {
    const total = files.reduce((n, f) => n + f.file.size, 0);
    return (
      <div className="rounded-xl border border-border bg-card" {...dropProps}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">
            {files.length} arquivo{files.length !== 1 ? "s" : ""}
            <span className="font-normal text-muted-foreground"> · {formatFileSize(total)}</span>
          </p>
          <button
            type="button"
            onClick={open}
            disabled={disabled}
            className="-mr-2 min-h-11 rounded-md px-2 text-sm font-medium text-primary hover:text-primary/80 disabled:opacity-50"
          >
            + Adicionar
          </button>
        </div>
        <ul className={cn("max-h-[50dvh] divide-y divide-border overflow-y-auto sm:max-h-80", isDragging && "bg-primary/5")}>
          {files.map((fileItem) => (
            <li key={fileItem.id} className="flex items-center gap-3 py-2 pr-2 pl-4">
              <span className="w-10 shrink-0 text-xs font-semibold text-primary">
                {getFileExtension(fileItem.originalFileName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={fileItem.originalFileName}>
                  {fileItem.originalFileName}
                </p>
                <p className="text-xs text-muted-foreground">{formatFileSize(fileItem.file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => onFileRemove(fileItem.id)}
                disabled={disabled}
                className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
                aria-label={`Remover ${fileItem.originalFileName}`}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-5" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
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
          <span className="sm:hidden">Toque para escolher os arquivos</span>
          <span className="hidden sm:inline">Arraste os arquivos aqui</span>
        </p>
        <p className="mt-1 hidden text-sm text-muted-foreground sm:block">ou clique para selecionar vários</p>
      </div>
      <p className="text-xs text-muted-foreground">{ALLOWED_EXTENSIONS.join(", ")}</p>
    </div>
  );
}
