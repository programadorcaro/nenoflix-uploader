"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { MultipleFileSelector } from "./multiple-file-selector";
import { FileNamesEditor } from "./file-names-editor";
import { MultipleUploadProgress } from "./multiple-upload-progress";
import type { MultipleFileItem, MultipleUploadState } from "./types";
import { uploadFile } from "@/lib/upload";
import { extractEpisodeInfo } from "../utils/name-suggestion";
import { extractFileName } from "../utils/format";

interface MultipleUploadProps {
  folderName: string;
  contentType: "series" | "animes" | "movies";
  onReset: () => void;
}

export function MultipleUpload({
  folderName,
  contentType,
  onReset,
}: MultipleUploadProps) {
  const [state, setState] = React.useState<MultipleUploadState>({
    files: [],
    currentUploadIndex: 0,
    isUploading: false,
    error: null,
  });
  const abortRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => abortRef.current?.abort(), []);

  const [currentStep, setCurrentStep] = React.useState<
    "select" | "names" | "upload"
  >("select");

  // Adiciona arquivos à lista
  const handleFilesSelect = (newFiles: File[]) => {
    const newFileItems: MultipleFileItem[] = newFiles.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      fileName: extractFileName(file.name),
      originalFileName: file.name,
      status: "pending",
      progress: 0,
    }));

    setState((prev) => ({
      ...prev,
      files: [...prev.files, ...newFileItems],
      error: null,
    }));
  };

  // Remove arquivo da lista
  const handleFileRemove = (id: string) => {
    setState((prev) => ({
      ...prev,
      files: prev.files.filter((f) => f.id !== id),
    }));
  };

  // Atualiza nome de um arquivo
  const handleFileNameChange = (id: string, fileName: string) => {
    setState((prev) => ({
      ...prev,
      files: prev.files.map((f) => (f.id === id ? { ...f, fileName } : f)),
    }));
  };

  // Valida se pode avançar para edição de nomes
  const canGoToNames = React.useMemo(() => {
    return state.files.length > 0;
  }, [state.files.length]);

  // Valida se pode iniciar upload
  const canStartUpload = React.useMemo(() => {
    return (
      state.files.length > 0 &&
      state.files.every((f) => f.fileName.trim() !== "")
    );
  }, [state.files]);

  // Avança para edição de nomes
  const handleGoToNames = () => {
    if (canGoToNames) {
      setCurrentStep("names");
    }
  };

  // Volta para seleção
  const handleBackToSelect = () => {
    setCurrentStep("select");
  };

  // Inicia upload em fila
  const handleStartUpload = async () => {
    if (!canStartUpload) return;

    // Captura a lista e ordena por SXXEXX (primeiros episódios primeiro)
    const filesToUpload = sortFilesByEpisodeOrder([...state.files]);

    // Atualiza estado e muda para step de upload (lista já ordenada)
    setState((prev) => ({
      ...prev,
      files: filesToUpload,
      isUploading: true,
      currentUploadIndex: 0,
      error: null,
    }));

    setCurrentStep("upload");
    const controller = new AbortController();
    abortRef.current = controller;

    const patch = (id: string, data: Partial<MultipleFileItem>) =>
      setState((prev) => ({
        ...prev,
        files: prev.files.map((f) => (f.id === id ? { ...f, ...data } : f)),
      }));

    // One file at a time: the chunk pool already saturates the link.
    for (const [i, fileItem] of filesToUpload.entries()) {
      if (controller.signal.aborted) break;
      setState((prev) => ({ ...prev, currentUploadIndex: i }));
      patch(fileItem.id, { status: "uploading", progress: 0 });
      try {
        const finalFilePath = await uploadFile(
          fileItem.file,
          { type: contentType, folder: folderName, fileName: fileItem.fileName.trim() },
          {
            signal: controller.signal,
            onFinalizing: () => patch(fileItem.id, { status: "completing" }),
            onProgress: (p) =>
              patch(fileItem.id, { progress: p.percentage, timeElapsed: p.timeElapsed }),
          }
        );
        patch(fileItem.id, { status: "completed", progress: 100, finalFilePath });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed";
        patch(fileItem.id, { status: "error", error: message });
        setState((prev) => ({ ...prev, error: message }));
      }
    }

    setState((prev) => ({ ...prev, isUploading: false }));
  };

  // Reset completo
  const handleReset = () => {
    setState({
      files: [],
      currentUploadIndex: 0,
      isUploading: false,
      error: null,
    });
    setCurrentStep("select");
    onReset();
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {currentStep === "select" && (
        <>
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold mb-3">
                Selecionar Arquivos
              </h3>
              <MultipleFileSelector
                files={state.files}
                onFilesSelect={handleFilesSelect}
                onFileRemove={handleFileRemove}
                disabled={state.isUploading}
              />
            </div>

            {state.error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20">
                {state.error}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button
                onClick={onReset}
                disabled={state.isUploading}
                type="button"
                variant="outline"
                className="flex-1 sm:flex-initial sm:min-w-[120px]"
                size="lg"
              >
                Voltar
              </Button>
              <Button
                onClick={handleGoToNames}
                disabled={!canGoToNames || state.isUploading}
                type="button"
                className="flex-1 sm:flex-initial sm:min-w-[200px] sm:ml-auto"
                size="lg"
              >
                Próximo
              </Button>
            </div>
          </div>
        </>
      )}

      {currentStep === "names" && (
        <>
          <FileNamesEditor
            files={state.files}
            onFileNameChange={handleFileNameChange}
            folderName={folderName}
            contentType={contentType}
            disabled={state.isUploading}
          />

          {state.error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20">
              {state.error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              onClick={handleBackToSelect}
              disabled={state.isUploading}
              type="button"
              variant="outline"
              className="flex-1 sm:flex-initial sm:min-w-[120px]"
              size="lg"
            >
              Voltar
            </Button>
            <Button
              onClick={handleStartUpload}
              disabled={!canStartUpload || state.isUploading}
              type="button"
              className="flex-1 sm:flex-initial sm:min-w-[200px] sm:ml-auto"
              size="lg"
            >
              Iniciar Upload
            </Button>
          </div>
        </>
      )}

      {currentStep === "upload" && (
        <MultipleUploadProgress
          files={state.files}
          currentUploadIndex={state.currentUploadIndex}
          contentType={contentType}
          onReset={handleReset}
        />
      )}
    </div>
  );
}

function sortFilesByEpisodeOrder(items: MultipleFileItem[]): MultipleFileItem[] {
  function getSortKey(item: MultipleFileItem): [number, number] {
    let info = extractEpisodeInfo(item.originalFileName);
    if (info.season === null || info.episode === null) {
      info = extractEpisodeInfo(item.fileName);
    }
    return [info.season ?? Infinity, info.episode ?? Infinity];
  }

  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const [sA, eA] = getSortKey(a.item);
      const [sB, eB] = getSortKey(b.item);
      if (sA !== sB) return sA - sB;
      if (eA !== eB) return eA - eB;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}
