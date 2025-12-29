"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
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
  const extractFileName = (file: File): string => {
    const lastDotIndex = file.name.lastIndexOf(".");
    if (lastDotIndex === -1) return file.name;
    return file.name.substring(0, lastDotIndex);
  };

  const handleFileSelect = (file: File | null) => {
    if (file) {
      const fileName = extractFileName(file);
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

  const suggestedName = showSuggestion
    ? generateSuggestedName(folderName, data.selectedFile.name, 0)
    : null;

  const isFormValid = React.useMemo(() => {
    return data.selectedFile !== null && data.fileName.trim() !== "";
  }, [data.selectedFile, data.fileName]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <Field>
        <FieldLabel className="text-base font-semibold mb-3">
          Selecionar Arquivo
        </FieldLabel>
        <FileDropZone
          file={data.selectedFile}
          onFileSelect={handleFileSelect}
          onFileRemove={handleFileRemove}
          disabled={isUploading}
        />
      </Field>

      {data.selectedFile && (
        <Field>
          <div className="flex items-center gap-2 mb-3">
            <FieldLabel
              htmlFor="file-name-step2"
              className="text-base font-semibold"
            >
              Nome do Arquivo <span className="text-destructive">*</span>
            </FieldLabel>
            {showSuggestion && suggestedName && (
              <div className="group relative">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4 text-muted-foreground cursor-help"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <path d="M12 17h.01" />
                </svg>
                <div className="absolute left-0 top-6 z-10 hidden group-hover:block w-64 p-2 bg-popover border border-border rounded-md shadow-md text-xs text-popover-foreground">
                  <p className="font-semibold mb-1">Sugestão:</p>
                  <p className="text-muted-foreground">{suggestedName}</p>
                </div>
              </div>
            )}
            {showSuggestion && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleApplySuggestion}
                disabled={isUploading}
                className="text-xs ml-auto"
              >
                Aplicar sugestão
              </Button>
            )}
          </div>
          <Input
            id="file-name-step2"
            placeholder="Digite o nome do arquivo"
            value={data.fileName}
            onChange={(e) => handleFileNameChange(e.target.value)}
            disabled={isUploading}
            required
            className="text-base"
          />
          <p className="text-xs text-muted-foreground mt-2">
            O nome do arquivo será usado para salvar no servidor
          </p>
        </Field>
      )}

      <Field orientation="horizontal" className="gap-3 pt-4">
        <Button
          onClick={onBack}
          disabled={isUploading}
          type="button"
          variant="outline"
          className="flex-1 sm:flex-initial sm:min-w-[120px]"
          size="lg"
        >
          Voltar
        </Button>
        <Button
          onClick={onNext}
          disabled={isUploading || !isFormValid}
          type="button"
          className="flex-1 sm:flex-initial sm:min-w-[200px] sm:ml-auto"
          size="lg"
        >
          Enviar
        </Button>
      </Field>
    </div>
  );
}
