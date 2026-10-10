"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Loading03Icon,
  MagicWand01Icon,
  PauseIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import type { Phase, QueueItem } from "./types";
import { formatFileSize, formatSpeed, formatTime } from "./utils/format";
import { episodeTag } from "./utils/queue";

interface QueueListProps {
  items: QueueItem[];
  phase: Phase;
  conflicts: Map<string, string>;
  canSuggest: boolean;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onSuggestAll: () => void;
}

function StatusIcon({ item }: { item: QueueItem }) {
  switch (item.status) {
    case "done":
      return <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-5 text-emerald-400" />;
    case "error":
      return <HugeiconsIcon icon={Alert02Icon} className="size-5 text-destructive" />;
    case "paused":
      return <HugeiconsIcon icon={PauseIcon} className="size-5 text-amber-400" />;
    case "uploading":
    case "completing":
      return <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin text-primary" />;
    default:
      return <span className="block size-2 rounded-full bg-muted-foreground/40" />;
  }
}

export function QueueList({ items, phase, conflicts, canSuggest, onRename, onRemove, onSuggestAll }: QueueListProps) {
  const composing = phase === "compose";
  const total = items.reduce((n, it) => n + it.file.size, 0);
  const done = items.filter((it) => it.status === "done").length;

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-3 sm:px-5">
        <p className="text-sm font-semibold">
          {composing ? `${items.length} arquivos` : `${done} de ${items.length} enviados`}
          <span className="font-normal text-muted-foreground"> · {formatFileSize(total)}</span>
        </p>
        {composing && canSuggest && (
          <button
            type="button"
            onClick={onSuggestAll}
            className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
          >
            <HugeiconsIcon icon={MagicWand01Icon} className="size-4" />
            Padronizar nomes
          </button>
        )}
      </div>

      <ol className="max-h-[60dvh] divide-y divide-white/5 overflow-y-auto lg:max-h-[calc(100dvh-26rem)]">
        {items.map((it, i) => {
          const conflict = conflicts.get(it.id);
          const tag = episodeTag(it.file.name);
          const active = it.status === "uploading" || it.status === "completing";
          return (
            <li key={it.id} className={cn("relative px-4 py-3 sm:px-5", active && "bg-primary/[0.06]")}>
              <div className="flex items-center gap-3">
                <span className="flex w-6 shrink-0 justify-center text-xs font-semibold text-muted-foreground tabular-nums">
                  {composing ? i + 1 : <StatusIcon item={it} />}
                </span>

                <div className="min-w-0 flex-1">
                  {composing ? (
                    <input
                      value={it.name}
                      onChange={(e) => onRename(it.id, e.target.value)}
                      aria-label={`Nome de ${it.file.name}`}
                      aria-invalid={!!conflict}
                      className={cn(
                        "h-9 w-full min-w-0 rounded-lg border bg-transparent px-2 text-base font-medium outline-none transition-colors sm:text-sm",
                        "focus:border-primary focus:bg-white/[0.03] focus:ring-2 focus:ring-primary/30",
                        conflict ? "border-destructive/60" : "border-transparent hover:border-white/10"
                      )}
                    />
                  ) : (
                    <p className="truncate text-sm font-medium" title={it.name}>
                      {it.name}
                    </p>
                  )}
                  <div className={cn("mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground", composing && "px-2")}>
                    {tag && <span className="shrink-0 rounded bg-primary/15 px-1 font-semibold text-primary">{tag}</span>}
                    <span className="min-w-0 truncate">
                      {conflict ? (
                        <span className="font-medium text-destructive">{conflict}</span>
                      ) : it.status === "error" ? (
                        <span className="text-destructive">{it.error}</span>
                      ) : it.status === "done" ? (
                        <>
                          {formatFileSize(it.file.size)}
                          {it.elapsed ? ` · ${formatTime(it.elapsed)} · ${formatSpeed(it.file.size / it.elapsed)}` : ""}
                        </>
                      ) : active || it.status === "paused" ? (
                        `${formatFileSize(it.sentBytes)} de ${formatFileSize(it.file.size)}`
                      ) : (
                        <span title={it.file.name}>
                          {formatFileSize(it.file.size)} · {it.file.name}
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {composing ? (
                  <button
                    type="button"
                    onClick={() => onRemove(it.id)}
                    aria-label={`Remover ${it.file.name}`}
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                  </button>
                ) : (
                  (active || it.status === "paused") && (
                    <span className="shrink-0 text-xs font-semibold text-primary tabular-nums">
                      {it.status === "completing" ? "Salvando" : `${Math.floor(it.progress)}%`}
                    </span>
                  )
                )}
              </div>
              {(active || it.status === "paused") && (
                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/5">
                  <div
                    className={cn("h-full transition-[width] duration-300", it.status === "paused" ? "bg-amber-400" : "bg-primary")}
                    style={{ width: `${it.status === "completing" ? 100 : it.progress}%` }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
