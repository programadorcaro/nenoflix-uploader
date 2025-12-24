"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
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
  const handleFileSelect = (file: File | null) => {
    onDataChange({ selectedFile: file });
  };

  const handleFileRemove = () => {
    onDataChange({ selectedFile: null });
  };

  return (
    <div className="space-y-6">
      <Field>
        <FieldLabel>Selecionar Arquivo</FieldLabel>
        <FileDropZone
          file={data.selectedFile}
          onFileSelect={handleFileSelect}
          onFileRemove={handleFileRemove}
          disabled={isUploading}
        />
      </Field>

      <Field orientation="horizontal" className="gap-2">
        <Button
          onClick={onBack}
          disabled={isUploading}
          type="button"
          variant="outline"
          className="flex-1"
        >
          Voltar
        </Button>
        <Button
          onClick={onNext}
          disabled={isUploading || !data.selectedFile}
          type="button"
          className="flex-1"
        >
          Próximo
        </Button>
      </Field>
    </div>
  );
}
