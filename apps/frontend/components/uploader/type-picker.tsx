"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { PlayIcon, Tv01Icon, Video01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import type { MediaType } from "./types";

const OPTIONS = [
  { type: "movies", icon: Video01Icon, label: "Filmes", hint: "Direto em /Movies" },
  { type: "series", icon: Tv01Icon, label: "Séries", hint: "Uma pasta por série" },
  { type: "animes", icon: PlayIcon, label: "Animes", hint: "Uma pasta por anime" },
] as const;

interface TypePickerProps {
  value: MediaType | null;
  onChange: (type: MediaType) => void;
  disabled?: boolean;
}

export function TypePicker({ value, onChange, disabled }: TypePickerProps) {
  return (
    <div role="radiogroup" aria-label="Tipo de conteúdo" className="grid grid-cols-3 gap-2 sm:gap-3">
      {OPTIONS.map(({ type, icon, label, hint }) => {
        const selected = value === type;
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(type)}
            className={cn(
              "group relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-all sm:flex-row sm:gap-3 sm:px-4 sm:text-left",
              "disabled:cursor-not-allowed disabled:opacity-50",
              selected
                ? "border-primary/60 bg-primary/15 shadow-lg shadow-primary/10"
                : "border-white/10 bg-white/[0.03] hover:border-primary/40 hover:bg-white/[0.06]"
            )}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors sm:size-10",
                selected ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground group-hover:text-foreground"
              )}
            >
              <HugeiconsIcon icon={icon} className="size-5" strokeWidth={1.8} />
            </span>
            <span className="min-w-0">
              <span className={cn("block text-sm font-semibold", selected && "text-primary")}>{label}</span>
              <span className="hidden truncate text-xs text-muted-foreground sm:block">{hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
