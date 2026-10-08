"use client";

import * as React from "react";
import { extractFileName } from "../utils/format";
import { Button } from "@/components/ui/button";
import { StepActions } from "../step-actions";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { FileDropZone } from "./file-drop-zone";
import type { Step2Data, ContentType } from "../types";
import { generateSuggestedName } from "../utils/name-suggestion";

interface Step2Props {
  data: Step2Data;
  isUploading: boolean;
  onDataChange: (data: Partial<Step2Data>) => void;
  onBack: () => void;
  onNext: () => void;
  contentType?: ContentType;
  folderName?: string;
}

export function Step2({
  data,
  isUploading,
  onDataChange,
  onBack,
  onNext,
  contentType,
  folderName = "",
}: Step2Props) {
  const handleFileSelect = (file: File | null) => {
    if (file) {
      const fileName = extractFileName(file.name);
      onDataChange({ selectedFile: file, fileName });
    } else {
      onDataChange({ selectedFile: null, fileName: "" });
    }
  };

  const handleFileRemove = () => {
    onDataChange({ selectedFile: null, fileName: "" });
  };

  const handleFileNameChange = (value: string) => {
    onDataChange({ fileName: value });
  };

  const handleApplySuggestion = () => {
    if (data.selectedFile && folderName) {
      const suggestedName = generateSuggestedName(
        folderName,
        data.selectedFile.name,
        0
      );
      onDataChange({ fileName: suggestedName });
    }
  };

  const showSuggestion =
    (contentType === "series" || contentType === "animes") &&
    data.selectedFile &&
    folderName;

  const suggestedName = showSuggestion && data.selectedFile
    ? generateSuggestedName(folderName, data.selectedFile.name, 0)
    : null;

  const isFormValid = React.useMemo(() => {
    return data.selectedFile !== null && data.fileName.trim() !== "";
  }, [data.selectedFile, data.fileName]);

  return (
    <div className="flex flex-1 flex-col gap-5 sm:gap-6">
      <FileDropZone
        file={data.selectedFile}
        onFileSelect={handleFileSelect}
        onFileRemove={handleFileRemove}
        disabled={isUploading}
      />

      {data.selectedFile && (
        <Field>
          <FieldLabel htmlFor="file-name-step2" className="text-sm font-semibold sm:text-base">
            Nome do arquivo no servidor
          </FieldLabel>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="file-name-step2"
              placeholder="Digite o nome do arquivo"
              value={data.fileName}
              onChange={(e) => handleFileNameChange(e.target.value)}
              disabled={isUploading}
              required
              className="h-11 text-base sm:flex-1"
            />
            {showSuggestion && suggestedName && suggestedName !== data.fileName && (
              <Button
                type="button"
                variant="outline"
                onClick={handleApplySuggestion}
                disabled={isUploading}
                className="h-11 shrink-0"
              >
                Usar sugestão
              </Button>
            )}
          </div>
          {showSuggestion && suggestedName && suggestedName !== data.fileName ? (
            <p className="truncate text-xs text-muted-foreground">
              Sugestão: <span className="text-foreground">{suggestedName}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">A extensão é mantida automaticamente.</p>
          )}
        </Field>
      )}

      <StepActions
        back={{ onClick: onBack, disabled: isUploading }}
        primary={{ label: "Enviar", onClick: onNext, disabled: isUploading || !isFormValid }}
      />
    </div>
  );
}
