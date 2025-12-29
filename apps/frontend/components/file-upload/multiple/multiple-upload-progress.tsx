"use client";

import * as React from "react";
import Image from "next/image";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import type { MultipleFileItem } from "./types";

interface MultipleUploadProgressProps {
  files: MultipleFileItem[];
  currentUploadIndex: number;
  contentType: "series" | "animes";
  onReset: () => void;
}

function formatFilePath(
  finalFilePath: string,
  contentType: "series" | "animes"
): string {
  const pathParts = finalFilePath.split(/[/\\]/).filter(Boolean);
  const contentTypeName = contentType === "series" ? "Series" : "Animes";
  const contentTypeIndex = pathParts.findIndex(
    (part) =>
      part === contentTypeName ||
      part === contentTypeName.toLowerCase() ||
      part.toLowerCase() === contentTypeName.toLowerCase()
  );

  if (contentTypeIndex !== -1) {
    // Retorna /Animes/{pasta} ou /Series/{pasta}
    const folderPart = pathParts[contentTypeIndex + 1];
    if (folderPart) {
      return `/${pathParts[contentTypeIndex]}/${folderPart}`;
    }
    return `/${pathParts[contentTypeIndex]}`;
  }

  // Fallback: pega as duas últimas pastas antes do arquivo
  if (pathParts.length >= 2) {
    return `/${pathParts[pathParts.length - 2]}`;
  }
  return finalFilePath;
}

function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

export function MultipleUploadProgress({
  files,
  currentUploadIndex,
  contentType,
  onReset,
}: MultipleUploadProgressProps) {
  const completedCount = files.filter((f) => f.status === "completed").length;
  const errorCount = files.filter((f) => f.status === "error").length;
  const allCompleted = files.every(
    (f) => f.status === "completed" || f.status === "error"
  );
  const currentFile = files[currentUploadIndex];
  const isUploading =
    currentFile?.status === "uploading" || currentFile?.status === "completing";

  if (allCompleted) {
    const allSuccess = errorCount === 0;
    return (
      <div className="space-y-6 relative">
        <div className="text-center py-8 sm:py-12">
          <div className="mx-auto mb-8 max-w-xs sm:max-w-sm">
            <div className="relative">
              <Image
                src={allSuccess ? "/sucess.jpg" : "/error.jpg"}
                alt={allSuccess ? "Sucesso" : "Erro"}
                width={400}
                height={300}
                className="w-full h-auto object-cover rounded-2xl shadow-2xl"
                priority
              />
              <div
                className={`absolute inset-0 ${
                  allSuccess ? "bg-primary/10" : "bg-destructive/10"
                } rounded-2xl blur-xl -z-10`}
              />
            </div>
          </div>
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="space-y-3">
              <h3 className="text-2xl sm:text-3xl font-bold text-primary">
                {allSuccess
                  ? "Todos os uploads concluídos!"
                  : "Upload finalizado com erros"}
              </h3>
              <p className="text-sm sm:text-base text-muted-foreground">
                {allSuccess
                  ? `${completedCount} arquivo${completedCount !== 1 ? "s" : ""} enviado${completedCount !== 1 ? "s" : ""} com sucesso.`
                  : `${completedCount} arquivo${completedCount !== 1 ? "s" : ""} enviado${completedCount !== 1 ? "s" : ""} com sucesso, ${errorCount} com erro.`}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-sm">
              <h4 className="text-base font-semibold mb-4">
                Resumo dos arquivos
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {files.map((fileItem) => (
                  <div
                    key={fileItem.id}
                    className={`p-3 rounded-lg border ${
                      fileItem.status === "completed"
                        ? "border-primary/20 bg-primary/5"
                        : "border-destructive/20 bg-destructive/5"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {fileItem.fileName}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {fileItem.originalFileName}
                        </p>
                        {fileItem.finalFilePath && (
                          <p className="text-xs font-mono text-muted-foreground mt-1 break-all">
                            {formatFilePath(
                              fileItem.finalFilePath,
                              contentType
                            )}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0">
                        {fileItem.status === "completed" ? (
                          <span className="text-xs font-semibold text-primary">
                            ✓ Concluído
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-destructive">
                            ✗ Erro
                          </span>
                        )}
                      </div>
                    </div>
                    {fileItem.error && (
                      <p className="text-xs text-destructive mt-2">
                        {fileItem.error}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Button
              onClick={onReset}
              type="button"
              className="w-full sm:w-auto sm:min-w-[200px]"
              size="lg"
            >
              Concluir
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Progresso geral */}
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg sm:text-xl font-semibold">
            Upload em progresso
          </h3>
          <p className="text-sm text-muted-foreground">
            {completedCount} de {files.length} concluído
            {completedCount !== files.length ? "s" : ""}
          </p>
        </div>
        <Progress
          value={(completedCount / files.length) * 100}
          className="h-3"
        />
      </div>

      {/* Arquivo atual sendo enviado */}
      {isUploading && currentFile && (
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="shrink-0 max-w-32 sm:max-w-40">
              <div className="relative w-full max-w-32 aspect-square mx-auto">
                <Image
                  src="/loading.jpg"
                  alt="Carregando"
                  width={400}
                  height={300}
                  className="w-full h-auto object-cover rounded-2xl shadow-2xl"
                  priority
                />
                <div className="absolute inset-0 bg-primary/10 rounded-2xl blur-xl -z-10" />
              </div>
            </div>
            <div className="flex-1 w-full space-y-4">
              <div>
                <h3 className="text-lg sm:text-xl font-semibold mb-2">
                  {currentFile.status === "completing"
                    ? "Finalizando upload..."
                    : `Enviando: ${currentFile.fileName}`}
                </h3>
                <Progress
                  value={
                    currentFile.status === "completing"
                      ? 100
                      : currentFile.progress
                  }
                  className="h-3 mb-3"
                />
                <p className="text-sm text-muted-foreground">
                  {currentFile.status === "completing"
                    ? "100% concluído"
                    : `${Math.round(currentFile.progress)}% concluído`}
                </p>
              </div>

              {currentFile.status !== "completing" && (
                <div className="text-sm">
                  {currentFile.timeElapsed !== undefined && (
                    <div className="bg-background/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">
                        Tempo decorrido
                      </p>
                      <p className="text-base font-semibold text-foreground">
                        {formatTime(currentFile.timeElapsed)}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lista de arquivos */}
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-sm">
        <h4 className="text-base font-semibold mb-4">Lista de arquivos</h4>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {files.map((fileItem, index) => {
            const isCurrent = index === currentUploadIndex;
            const isCompleted = fileItem.status === "completed";
            const isError = fileItem.status === "error";
            const isPending = fileItem.status === "pending";

            return (
              <div
                key={fileItem.id}
                className={`p-3 rounded-lg border ${
                  isCurrent
                    ? "border-primary bg-primary/5"
                    : isCompleted
                      ? "border-primary/20 bg-primary/5"
                      : isError
                        ? "border-destructive/20 bg-destructive/5"
                        : "border-border bg-muted/30"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-muted-foreground">
                        #{index + 1}
                      </span>
                      <p className="text-sm font-medium text-foreground truncate">
                        {fileItem.fileName}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {fileItem.originalFileName}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatFileSize(fileItem.file.size)}
                    </p>
                    {isCurrent && (
                      <div className="mt-2">
                        <Progress value={fileItem.progress} className="h-2" />
                      </div>
                    )}
                    {isError && fileItem.error && (
                      <p className="text-xs text-destructive mt-2">
                        {fileItem.error}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {isCurrent && (
                      <span className="text-xs font-semibold text-primary">
                        Enviando...
                      </span>
                    )}
                    {isCompleted && (
                      <span className="text-xs font-semibold text-primary">
                        ✓ Concluído
                      </span>
                    )}
                    {isError && (
                      <span className="text-xs font-semibold text-destructive">
                        ✗ Erro
                      </span>
                    )}
                    {isPending && (
                      <span className="text-xs font-semibold text-muted-foreground">
                        Aguardando...
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
