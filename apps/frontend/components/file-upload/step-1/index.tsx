"use client";

import * as React from "react";
import { ContentTypeSelector } from "./content-type-selector";
import { FolderSelector } from "./folder-selector";
import { StepActions } from "../step-actions";
import type { ContentType, Step1Data } from "../types";
import { listFolders } from "@/lib/upload";

interface Step1Props {
  data: Step1Data;
  error: string | null;
  isUploading: boolean;
  onDataChange: (data: Partial<Step1Data>) => void;
  onNext: () => void;
  onError: (error: string | null) => void;
}

export function Step1({
  data,
  error,
  isUploading,
  onDataChange,
  onNext,
  onError,
}: Step1Props) {
  const [existingFolders, setExistingFolders] = React.useState<string[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = React.useState(false);

  React.useEffect(() => {
    const type = data.contentType;
    if (type !== "series" && type !== "animes") return;
    const controller = new AbortController();
    setIsLoadingFolders(true);
    listFolders(type, controller.signal)
      .then(setExistingFolders, () => setExistingFolders([]))
      .finally(() => setIsLoadingFolders(false));
    return () => controller.abort();
  }, [data.contentType]);

  const handleContentTypeSelect = (type: ContentType) => {
    onError(null);
    onDataChange({
      contentType: type,
      subFolderName: "",
      selectedExistingFolder: "",
    });
  };

  const handleNext = () => {
    if (!data.contentType) {
      onError("Selecione o tipo de conteúdo");
      return;
    }
    if (data.contentType === "series" || data.contentType === "animes") {
      if (!data.subFolderName.trim() && !data.selectedExistingFolder) {
        onError("Informe ou escolha a pasta");
        return;
      }
    }
    onError(null);
    onNext();
  };

  const isShow = data.contentType === "series" || data.contentType === "animes";

  return (
    <div className="flex flex-1 flex-col gap-5 sm:gap-6">
      <ContentTypeSelector
        selectedType={data.contentType}
        onSelect={handleContentTypeSelect}
        disabled={isUploading}
      />

      {isShow && (
        <FolderSelector
          subFolderName={data.subFolderName}
          selectedExistingFolder={data.selectedExistingFolder}
          existingFolders={existingFolders}
          isLoadingFolders={isLoadingFolders}
          onSubFolderNameChange={(value) => onDataChange({ subFolderName: value })}
          onExistingFolderChange={(value) => onDataChange({ selectedExistingFolder: value })}
          disabled={isUploading}
        />
      )}

      {data.contentType && (
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">Upload múltiplo</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {data.contentType === "movies"
                ? "Vários filmes de uma vez, em fila"
                : "Vários episódios de uma vez"}
            </span>
          </span>
          <span className="relative inline-flex shrink-0 items-center">
            <input
              type="checkbox"
              checked={data.useMultipleUpload || false}
              onChange={(e) => onDataChange({ useMultipleUpload: e.target.checked })}
              disabled={isUploading}
              className="peer sr-only"
            />
            <span className="h-7 w-12 rounded-full bg-muted transition-colors after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:transition-transform after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-primary" />
          </span>
        </label>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <StepActions primary={{ label: "Próximo", onClick: handleNext, disabled: !data.contentType || isUploading }} />
    </div>
  );
}
