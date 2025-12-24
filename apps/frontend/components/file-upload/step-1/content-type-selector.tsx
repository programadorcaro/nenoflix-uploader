"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Video01Icon, Tv01Icon, PlayIcon } from "@hugeicons/core-free-icons";
import type { ContentType } from "../types";

interface ContentTypeSelectorProps {
  selectedType: ContentType;
  onSelect: (type: ContentType) => void;
  disabled?: boolean;
}

export function ContentTypeSelector({
  selectedType,
  onSelect,
  disabled = false,
}: ContentTypeSelectorProps) {
  const options = [
    {
      type: "movies" as ContentType,
      icon: Video01Icon,
      label: "Filmes",
    },
    {
      type: "series" as ContentType,
      icon: Tv01Icon,
      label: "Séries",
    },
    {
      type: "animes" as ContentType,
      icon: PlayIcon,
      label: "Animes",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4">
      {options.map((option) => (
        <button
          key={option.type}
          type="button"
          onClick={() => onSelect(option.type)}
          disabled={disabled}
          className={`p-6 rounded-lg border-2 transition-all ${
            selectedType === option.type
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <div className="flex flex-col items-center gap-3">
            <HugeiconsIcon
              icon={option.icon}
              className="size-12 text-primary"
              strokeWidth={1.5}
            />
            <span className="text-lg font-medium">{option.label}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

