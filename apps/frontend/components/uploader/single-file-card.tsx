"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, Delete02Icon, MagicWand01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import type { MediaType, QueueItem } from "./types";
import { formatFileSize, getFileExtension } from "./utils/format";
import { destinationPath, episodeTag, finalFileName } from "./utils/queue";

interface SingleFileCardProps {
  item: QueueItem;
  type: MediaType;
  folder: string;
  conflict?: string;
  suggestion: string | null;
  locked: boolean;
  onRename: (name: string) => void;
  onRemove: () => void;
}

export function SingleFileCard({ item, type, folder, conflict, suggestion, locked, onRename, onRemove }: SingleFileCardProps) {
  const tag = episodeTag(item.file.name);
  const showSuggestion = !locked && suggestion && suggestion !== item.name;

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-3 p-4 sm:gap-4 sm:p-5">
        <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-primary/5 text-[11px] font-bold tracking-wide text-primary ring-1 ring-primary/30 sm:size-14">
          {getFileExtension(item.file.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium sm:text-base" title={item.file.name}>
            {item.file.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="rounded-md bg-white/5 px-1.5 py-0.5 tabular-nums">{formatFileSize(item.file.size)}</span>
            {tag && <span className="rounded-md bg-primary/15 px-1.5 py-0.5 font-semibold text-primary">{tag}</span>}
          </div>
        </div>
        {!locked && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remover arquivo"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-5" />
          </button>
        )}
      </div>

      <div className="space-y-2 border-t border-white/5 bg-black/10 p-4 sm:p-5">
        <label htmlFor={`name-${item.id}`} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Nome no servidor
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={`name-${item.id}`}
            value={item.name}
            onChange={(e) => onRename(e.target.value)}
            disabled={locked}
            aria-invalid={!!conflict}
            placeholder="Nome do arquivo"
            className={cn(
              "h-11 w-full min-w-0 rounded-xl border bg-white/[0.03] px-3 text-base outline-none transition-colors sm:text-sm",
              "focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-60",
              conflict ? "border-destructive/60" : "border-white/10"
            )}
          />
          {showSuggestion && (
            <button
              type="button"
              onClick={() => onRename(suggestion)}
              className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <HugeiconsIcon icon={MagicWand01Icon} className="size-4" />
              <span className="truncate">{suggestion}</span>
            </button>
          )}
        </div>
        {conflict ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <HugeiconsIcon icon={Alert02Icon} className="size-3.5" />
            {conflict}. Troque o nome para enviar.
          </p>
        ) : (
          <p className="truncate font-mono text-xs text-muted-foreground" title={destinationPath(type, folder, finalFileName(item))}>
            {destinationPath(type, folder, finalFileName(item))}
          </p>
        )}
      </div>
    </div>
  );
}
