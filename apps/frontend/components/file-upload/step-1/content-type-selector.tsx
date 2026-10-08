"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Video01Icon, Tv01Icon, PlayIcon } from "@hugeicons/core-free-icons";
import type { ContentType } from "../types";

interface ContentTypeSelectorProps {
  selectedType: ContentType;
  onSelect: (type: ContentType) => void;
  disabled?: boolean;
}

const OPTIONS = [
  { type: "movies", icon: Video01Icon, label: "Filmes" },
  { type: "series", icon: Tv01Icon, label: "Séries" },
  { type: "animes", icon: PlayIcon, label: "Animes" },
] as const;

export function ContentTypeSelector({ selectedType, onSelect, disabled = false }: ContentTypeSelectorProps) {
  return (
    <div role="radiogroup" aria-label="Tipo de conteúdo" className="grid grid-cols-3 gap-2 sm:gap-4">
      {OPTIONS.map(({ type, icon, label }) => {
        const selected = selectedType === type;
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(type)}
            disabled={disabled}
            className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 transition-colors sm:gap-3 sm:p-6 ${
              selected
                ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                : "border-border hover:border-primary/50 hover:bg-muted/50"
            } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
          >
            <HugeiconsIcon
              icon={icon}
              className={`size-6 sm:size-11 ${selected ? "text-primary" : "text-muted-foreground"}`}
              strokeWidth={1.5}
            />
            <span className={`text-sm font-medium sm:text-lg ${selected ? "text-primary" : "text-foreground"}`}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
