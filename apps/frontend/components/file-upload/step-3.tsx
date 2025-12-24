"use client";

import * as React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import type { Step3Data, Step2Data, Step1Data } from "./types";

interface Step3Props {
  step1Data: Step1Data;
  step2Data: Step2Data;
  step3Data: Step3Data;
  error: string | null;
  progress: number;
  isUploading: boolean;
  uploadStatus: "idle" | "uploading" | "success" | "error";
  onDataChange: (data: Partial<Step3Data>) => void;
  onBack: () => void;
  onUpload: () => void;
  onReset: () => void;
}

export function Step3({
  step1Data,
  step2Data,
  step3Data,
  error,
  progress,
  isUploading,
  uploadStatus,
  onDataChange,
  onBack,
  onUpload,
  onReset,
}: Step3Props) {
  const folderName = React.useMemo(() => {
    if (
      step1Data.contentType === "series" ||
      step1Data.contentType === "animes"
    ) {
      return step1Data.selectedExistingFolder || step1Data.subFolderName.trim();
    }
    return "";
  }, [
    step1Data.contentType,
    step1Data.selectedExistingFolder,
    step1Data.subFolderName,
  ]);

  // Pré-preenche o fileName quando entra no Step 3 para séries/animes
  React.useEffect(() => {
    if (
      (step1Data.contentType === "series" ||
        step1Data.contentType === "animes") &&
      folderName &&
      !step3Data.fileName.trim()
    ) {
      onDataChange({ fileName: `${folderName} - S01E01` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step1Data.contentType, folderName]);

  const isFormValid = React.useMemo(() => {
    const hasFileName = step3Data.fileName.trim() !== "";
    const hasFile = step2Data.selectedFile !== null;

    if (!hasFileName || !hasFile) {
      return false;
    }

    // Para séries e animes, folderName é obrigatório
    if (
      step1Data.contentType === "series" ||
      step1Data.contentType === "animes"
    ) {
      return folderName.trim() !== "";
    }

    // Para filmes, apenas fileName e file são necessários
    return true;
  }, [
    step3Data.fileName,
    step2Data.selectedFile,
    step1Data.contentType,
    folderName,
  ]);

  if (uploadStatus === "success") {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <div className="mx-auto mb-4 aspect-square w-full">
            <Image
              src="/sucess.jpg"
              alt="Sucesso"
              width={400}
              height={300}
              className="w-full h-full object-cover rounded-lg"
            />
          </div>
          <h3 className="text-lg font-semibold mb-2">
            Upload concluído com sucesso!
          </h3>
          <p className="text-sm text-muted-foreground">
            O arquivo foi enviado com sucesso.
          </p>
        </div>
      </div>
    );
  }

  if (uploadStatus === "error") {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <div className="mx-auto mb-4 aspect-square w-full">
            <Image
              src="/error.jpg"
              alt="Erro"
              width={400}
              height={300}
              className="w-full h-full object-cover rounded-lg"
            />
          </div>
          <h3 className="text-lg font-semibold mb-2">Erro no upload</h3>
          <p className="text-sm text-destructive mb-4">
            {error || "Ocorreu um erro ao enviar o arquivo."}
          </p>
          <Button onClick={onReset} type="button" className="w-full">
            Voltar ao Início
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {step2Data.selectedFile && (
        <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-semibold text-primary">
                {step2Data.selectedFile.name
                  .substring(step2Data.selectedFile.name.lastIndexOf(".") + 1)
                  .toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {step2Data.selectedFile.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {(step2Data.selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
        </div>
      )}

      {folderName && (
        <div className="rounded-lg border border-border bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground mb-1">
            Pasta selecionada:
          </p>
          <p className="text-sm font-medium">{folderName}</p>
        </div>
      )}

      <Field>
        <FieldLabel htmlFor="file-name">File Name</FieldLabel>
        <Input
          id="file-name"
          placeholder="Enter file name"
          value={step3Data.fileName}
          onChange={(e) => onDataChange({ fileName: e.target.value })}
          disabled={isUploading}
          required
        />
      </Field>

      {isUploading && (
        <Field>
          <div className="mb-4 aspect-square w-full">
            <Image
              src="/loading.jpg"
              alt="Carregando"
              width={400}
              height={300}
              className="w-full h-full object-cover rounded-lg"
            />
          </div>
          <FieldLabel>Progresso do Upload</FieldLabel>
          <Progress value={progress} />
          <p className="text-sm text-muted-foreground mt-1">
            {Math.round(progress)}% enviado
          </p>
        </Field>
      )}

      {error && uploadStatus === "idle" && (
        <div className="text-sm text-destructive bg-destructive/10 p-2 rounded-md">
          {error}
        </div>
      )}

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
          onClick={onUpload}
          disabled={!isFormValid || isUploading}
          type="button"
          className="flex-1"
        >
          {isUploading ? "Enviando..." : "Enviar"}
        </Button>
      </Field>
    </div>
  );
}
