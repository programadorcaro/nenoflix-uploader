"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { FileDropZone } from "./file-drop-zone";
import type { Step2Data } from "../types";

interface Step2Props {
  data: Step2Data;
  isUploading: boolean;
  onDataChange: (data: Partial<Step2Data>) => void;
  onBack: () => void;
  onNext: () => void;
}

export function Step2({
  data,
  isUploading,
  onDataChange,
  onBack,
  onNext,
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
          <FieldLabel
            htmlFor="file-name-step2"
            className="text-base font-semibold mb-3"
          >
            Nome do Arquivo <span className="text-destructive">*</span>
          </FieldLabel>
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
