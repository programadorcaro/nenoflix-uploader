"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, CloudUploadIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { ALLOWED_EXTENSIONS } from "./constants";
import { useFileDrop } from "./utils/use-file-drop";

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  /** Compact strip once the queue has files. */
  compact?: boolean;
  disabled?: boolean;
}

export function DropZone({ onFiles, compact, disabled = false }: DropZoneProps) {
  const { isDragging, inputRef, open, onInputChange, dropProps } = useFileDrop(onFiles, disabled);

  return (
    <div
      {...dropProps}
      onClick={open}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open())}
      className={cn(
        "group relative flex cursor-pointer items-center rounded-2xl border border-dashed transition-all outline-none",
        "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30",
        compact ? "gap-3 px-4 py-3" : "flex-col justify-center gap-4 px-6 py-10 text-center sm:py-14",
        isDragging
          ? "scale-[1.01] border-primary bg-primary/10"
          : "border-white/15 bg-white/[0.02] hover:border-primary/50 hover:bg-primary/5",
        disabled && "pointer-events-none opacity-50"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_EXTENSIONS.join(",")}
        onChange={onInputChange}
        disabled={disabled}
        className="hidden"
      />
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-105",
          compact ? "size-9 rounded-xl" : "size-16"
        )}
      >
        <HugeiconsIcon icon={compact ? Add01Icon : CloudUploadIcon} className={compact ? "size-5" : "size-8"} strokeWidth={1.8} />
      </span>
      {compact ? (
        <span className="min-w-0 text-sm">
          <span className="font-medium">Adicionar mais arquivos</span>
          <span className="hidden text-muted-foreground sm:inline"> · ou arraste aqui</span>
        </span>
      ) : (
        <span>
          <span className="block text-base font-semibold sm:text-lg">
            <span className="sm:hidden">Toque para escolher arquivos</span>
            <span className="hidden sm:inline">Arraste filmes ou episódios aqui</span>
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">
            <span className="hidden sm:inline">ou clique para escolher · </span>um ou vários · {ALLOWED_EXTENSIONS.join(" ")}
          </span>
        </span>
      )}
    </div>
  );
}
