"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { MultipleFileSelector } from "./multiple-file-selector";
import { FileNamesEditor } from "./file-names-editor";
import { MultipleUploadProgress } from "./multiple-upload-progress";
import type { MultipleFileItem, MultipleUploadState } from "./types";
import { BACKEND_URL } from "../constants";
import { UploadChunker } from "@/lib/upload-chunker";
import { UploadStateManager } from "@/lib/upload-state";

interface MultipleUploadProps {
  folderName: string;
  destinationPath: string;
  contentType: "series" | "animes";
  onComplete?: () => void;
  onReset: () => void;
}

export function MultipleUpload({
  folderName,
  destinationPath,
  contentType,
  onComplete,
  onReset,
}: MultipleUploadProps) {
  const [state, setState] = React.useState<MultipleUploadState>({
    files: [],
    currentUploadIndex: 0,
    isUploading: false,
    allCompleted: false,
    error: null,
  });

  const [currentStep, setCurrentStep] = React.useState<"select" | "names" | "upload">("select");

  // Adiciona arquivos à lista
  const handleFilesSelect = (newFiles: File[]) => {
    const newFileItems: MultipleFileItem[] = newFiles.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      fileName: "",
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
      files: prev.files.map((f) =>
        f.id === id ? { ...f, fileName } : f
      ),
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

    setCurrentStep("upload");
    
    // Captura a lista de arquivos atual antes de iniciar
    let filesToUpload: MultipleFileItem[] = [];
    
    setState((prev) => {
      filesToUpload = prev.files;
      return {
        ...prev,
        isUploading: true,
        currentUploadIndex: 0,
        error: null,
      };
    });

    // Upload em fila (um por vez) - usando a lista capturada
    for (let i = 0; i < filesToUpload.length; i++) {
      const fileItem = filesToUpload[i];
      const fileId = fileItem.id;

      // Atualiza índice atual e status para uploading
      setState((prev) => ({
        ...prev,
        currentUploadIndex: i,
        files: prev.files.map((f) =>
          f.id === fileId
            ? { ...f, status: "uploading" as const, progress: 0 }
            : f
        ),
      }));

      let chunker: UploadChunker | null = null;

      try {
        // Initialize upload session
        const initResponse = await fetch(`${BACKEND_URL}/upload/init`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName: fileItem.fileName.trim(),
            folderName: folderName,
            destinationPath: destinationPath,
            totalSize: fileItem.file.size,
            originalFileName: fileItem.originalFileName,
          }),
        });

        const initResult = await initResponse.json();

        if (!initResult.success) {
          throw new Error(initResult.error || "Failed to initialize upload");
        }

        const uploadId = initResult.uploadId;

        // Create chunker with optimal chunk size from backend
        const optimalChunkSize = initResult.chunkSize;
        chunker = new UploadChunker(fileItem.file, BACKEND_URL, optimalChunkSize);
        chunker.setUploadId(uploadId);

        // Progress callback - igual ao upload único
        chunker.setProgressCallback((progress) => {
          setState((prev) => ({
            ...prev,
            files: prev.files.map((f) =>
              f.id === fileId
                ? {
                    ...f,
                    progress: progress.percentage,
                    timeElapsed: progress.timeElapsed,
                    timeRemaining: progress.timeRemaining,
                    uploadSpeed: progress.uploadSpeed,
                  }
                : f
            ),
          }));
        });

        // Save session state
        const stateManager = new UploadStateManager(uploadId);
        stateManager.save({
          uploadId,
          fileName: fileItem.fileName.trim(),
          folderName: folderName,
          destinationPath: destinationPath,
          totalSize: fileItem.file.size,
          totalChunks: initResult.totalChunks,
          chunkSize: initResult.chunkSize,
          timestamp: Date.now(),
        });

        // Upload all chunks
        await chunker.uploadAll();

        // Update UI to show "completing..." during completion
        setState((prev) => ({
          ...prev,
          files: prev.files.map((f) =>
            f.id === fileId ? { ...f, status: "completing" as const } : f
          ),
        }));

        // Complete upload
        const completeResponse = await fetch(`${BACKEND_URL}/upload/complete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ uploadId }),
        });

        const completeResult = await completeResponse.json();

        if (!completeResult.success) {
          throw new Error(completeResult.error || "Failed to complete upload");
        }

        // Clear session state
        stateManager.clear();

        // Construir caminho final
        let finalFilePath = destinationPath;
        if (folderName) {
          finalFilePath = `${destinationPath}/${folderName}`;
        }
        finalFilePath = `${finalFilePath}/${fileItem.fileName.trim()}`;

        // Marca como concluído
        setState((prev) => ({
          ...prev,
          files: prev.files.map((f) =>
            f.id === fileId
              ? {
                  ...f,
                  status: "completed" as const,
                  progress: 100,
                  finalFilePath: completeResult.filePath || finalFilePath,
                  uploadId: uploadId,
                }
              : f
          ),
        }));
      } catch (error) {
        if (chunker) {
          chunker.cancel();
        }

        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";

        // Marca como erro
        setState((prev) => ({
          ...prev,
          files: prev.files.map((f) =>
            f.id === fileId
              ? {
                  ...f,
                  status: "error" as const,
                  error: errorMessage,
                }
              : f
          ),
          error: errorMessage,
        }));
      }
    }

    // Todos os uploads finalizados
    setState((prev) => ({
      ...prev,
      isUploading: false,
      allCompleted: true,
    }));
  };

  // Reset completo
  const handleReset = () => {
    setState({
      files: [],
      currentUploadIndex: 0,
      isUploading: false,
      allCompleted: false,
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

