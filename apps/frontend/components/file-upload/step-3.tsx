"use client";

import * as React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import confetti from "canvas-confetti";
import type { Step3Data, Step2Data, Step1Data } from "./types";

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

interface Step3Props {
  step1Data: Step1Data;
  step2Data: Step2Data;
  step3Data: Step3Data;
  error: string | null;
  progress: number;
  isUploading: boolean;
  uploadStatus: "idle" | "uploading" | "completing" | "success" | "error";
  timeElapsed?: number;
  timeRemaining?: number | null;
  uploadSpeed?: number;
  finalFilePath?: string;
  onDataChange: (data: Partial<Step3Data>) => void;
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
  timeElapsed,
  timeRemaining,
  uploadSpeed,
  finalFilePath,
  onDataChange,
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

  // Formata o caminho para exibir apenas a parte relevante
  const displayPath = React.useMemo(() => {
    if (!finalFilePath) return "";

    // Extrair apenas a parte relevante baseado no tipo de conteúdo
    if (step1Data.contentType === "movies") {
      // Para filmes: apenas o nome da pasta base (Movies)
      const pathParts = finalFilePath.split(/[/\\]/).filter(Boolean);
      const moviesIndex = pathParts.findIndex(
        (part) => part.toLowerCase() === "movies"
      );
      if (moviesIndex !== -1) {
        return `/${pathParts[moviesIndex]}`;
      }
      // Se não encontrar "Movies", pega a última pasta antes do arquivo
      if (pathParts.length >= 2) {
        return `/${pathParts[pathParts.length - 2]}`;
      }
      return finalFilePath;
    } else if (
      step1Data.contentType === "series" ||
      step1Data.contentType === "animes"
    ) {
      // Para séries/animes: pasta base + pasta criada
      const pathParts = finalFilePath.split(/[/\\]/).filter(Boolean);
      const contentType =
        step1Data.contentType === "series" ? "Series" : "Animes";
      const contentTypeIndex = pathParts.findIndex(
        (part) =>
          part === contentType ||
          part === contentType.toLowerCase() ||
          part.toLowerCase() === contentType.toLowerCase()
      );

      if (contentTypeIndex !== -1 && folderName) {
        // Retorna /Animes/{pasta} ou /Series/{pasta}
        return `/${pathParts[contentTypeIndex]}/${folderName}`;
      } else if (contentTypeIndex !== -1) {
        // Se não houver folderName, apenas a pasta base
        return `/${pathParts[contentTypeIndex]}`;
      }
      // Fallback: pega as duas últimas pastas antes do arquivo
      if (pathParts.length >= 2) {
        const lastTwoParts = pathParts.slice(-2);
        return `/${lastTwoParts[0]}`;
      }
      return finalFilePath;
    }

    return finalFilePath;
  }, [finalFilePath, step1Data.contentType, folderName]);

  // Copia o fileName do Step 2 para o Step 3 quando entra no Step 3
  // O nome já vem do Step 2 através do handleNextStep, mas garantimos aqui também
  React.useEffect(() => {
    if (step2Data.fileName && !step3Data.fileName.trim()) {
      // Sempre usa o nome original do arquivo do Step 2
      onDataChange({ fileName: step2Data.fileName });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step2Data.fileName]);

  // Inicia o upload automaticamente quando entra no Step 3
  React.useEffect(() => {
    if (
      uploadStatus === "idle" &&
      !isUploading &&
      step2Data.selectedFile &&
      step3Data.fileName.trim()
    ) {
      onUpload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (uploadStatus === "success") {
      // Fire confetti animation with fireworks effect
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = {
        startVelocity: 30,
        spread: 360,
        ticks: 60,
        zIndex: 1000,
      };

      const randomInRange = (min: number, max: number) =>
        Math.random() * (max - min) + min;

      const interval = window.setInterval(() => {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        });
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        });
      }, 250);

      return () => clearInterval(interval);
    }
  }, [uploadStatus]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const estimateUploadTime = (
    fileSizeBytes: number,
    speedMBps?: number
  ): string => {
    const averageSpeedMbps = speedMBps || 10;
    const speedBytesPerSecond = (averageSpeedMbps * 1024 * 1024) / 8;
    const seconds = fileSizeBytes / speedBytesPerSecond;

    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  };

  // Tempo estimado fixo, calculado apenas uma vez quando temos velocidade confiável
  const [fixedEstimatedTime, setFixedEstimatedTime] = React.useState<
    string | null
  >(null);

  React.useEffect(() => {
    // Calcula o tempo estimado apenas uma vez quando temos velocidade confiável
    // Espera pelo menos 2 segundos e alguma velocidade para garantir precisão
    if (
      step2Data.selectedFile &&
      uploadSpeed &&
      uploadSpeed > 0 &&
      timeElapsed &&
      timeElapsed >= 2 &&
      !fixedEstimatedTime
    ) {
      const speedMBps = uploadSpeed / 1024 / 1024;
      const estimated = estimateUploadTime(
        step2Data.selectedFile.size,
        speedMBps
      );
      setFixedEstimatedTime(estimated);
    }
  }, [uploadSpeed, timeElapsed, step2Data.selectedFile, fixedEstimatedTime]);

  // Resumo das informações (deve ser antes dos early returns)
  const summaryItems = React.useMemo(() => {
    const items: Array<{ label: string; value: string }> = [];

    if (folderName) {
      items.push({ label: "Pasta", value: folderName });
    }

    if (step3Data.fileName) {
      items.push({ label: "Nome do arquivo", value: step3Data.fileName });
    }

    if (step2Data.selectedFile) {
      items.push({
        label: "Tamanho",
        value: formatFileSize(step2Data.selectedFile.size),
      });

      // Usa o tempo estimado fixo se disponível, caso contrário calcula com velocidade padrão
      const estimatedTime =
        fixedEstimatedTime ||
        estimateUploadTime(
          step2Data.selectedFile.size,
          undefined // Usa velocidade padrão de 10 MB/s se ainda não tiver velocidade confiável
        );
      items.push({ label: "Tempo estimado", value: estimatedTime });
    }

    return items;
  }, [
    folderName,
    step3Data.fileName,
    step2Data.selectedFile,
    fixedEstimatedTime,
  ]);

  if (uploadStatus === "success") {
    return (
      <div className="space-y-6 relative">
        <div className="text-center py-8 sm:py-12">
          <div className="mx-auto mb-8 max-w-xs sm:max-w-sm">
            <div className="relative w-full max-w-32 aspect-square mx-auto">
              <Image
                src="/sucess.jpg"
                alt="Erro"
                width={400}
                height={300}
                className="w-full h-auto object-cover rounded-2xl shadow-2xl"
                priority
              />
              <div className="absolute inset-0 bg-destructive/10 rounded-2xl blur-xl -z-10" />
            </div>
          </div>
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="space-y-3">
              <h3 className="text-2xl sm:text-3xl font-bold text-primary">
                Upload concluído com sucesso!
              </h3>
              <p className="text-sm sm:text-base text-muted-foreground">
                O arquivo foi enviado com sucesso para o servidor.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-sm space-y-4 text-left">
              {step3Data.fileName && (
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm text-muted-foreground font-medium">
                    Nome do arquivo
                  </p>
                  <p className="text-sm sm:text-base font-semibold text-foreground break-all">
                    {step3Data.fileName}
                  </p>
                </div>
              )}

              {displayPath && (
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm text-muted-foreground font-medium">
                    Localização
                  </p>
                  <p className="text-sm sm:text-base font-mono text-foreground break-all bg-muted/50 p-2 rounded-md">
                    {displayPath}
                  </p>
                </div>
              )}
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

  if (uploadStatus === "error") {
    return (
      <div className="space-y-6">
        <div className="text-center py-8 sm:py-12">
          <div className="mx-auto mb-8 max-w-xs sm:max-w-sm">
            <div className="relative w-full max-w-32 aspect-square mx-auto">
              <Image
                src="/error.jpg"
                alt="Erro no upload"
                width={400}
                height={300}
                className="w-full h-auto object-cover rounded-2xl shadow-2xl"
                priority
              />
              <div className="absolute inset-0 bg-destructive/10 rounded-2xl blur-xl -z-10" />
            </div>
          </div>
          <div className="space-y-4 max-w-md mx-auto">
            <h3 className="text-2xl sm:text-3xl font-bold text-destructive">
              Erro no upload
            </h3>
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <p className="text-sm sm:text-base text-destructive font-medium">
                {error || "Ocorreu um erro ao enviar o arquivo."}
              </p>
            </div>
            <Button
              onClick={onReset}
              type="button"
              className="w-full sm:w-auto sm:min-w-[200px]"
              size="lg"
            >
              Voltar ao Início
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Resumo */}
      {summaryItems.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-sm">
          <h3 className="text-lg sm:text-xl font-semibold mb-4">
            Resumo do Upload
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {summaryItems.map((item, index) => (
              <div key={index} className="space-y-1">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium">
                  {item.label}
                </p>
                <p className="text-sm sm:text-base font-semibold text-foreground">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progresso do Upload */}
      {(isUploading || uploadStatus === "completing") && (
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
                <div className="absolute inset-0 bg-destructive/10 rounded-2xl blur-xl -z-10" />
              </div>
            </div>
            <div className="flex-1 w-full space-y-4">
              <div>
                <h3 className="text-lg sm:text-xl font-semibold mb-2">
                  {uploadStatus === "completing"
                    ? "Finalizando upload..."
                    : "Enviando arquivo"}
                </h3>
                <Progress
                  value={uploadStatus === "completing" ? 100 : progress}
                  className="h-3 mb-3"
                />
                <p className="text-sm text-muted-foreground">
                  {Math.round(progress)}% concluído
                </p>
              </div>

              {uploadStatus !== "completing" && (
                <div className="text-sm">
                  {timeElapsed !== undefined && (
                    <div className="bg-background/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">
                        Tempo decorrido
                      </p>
                      <p className="text-base font-semibold text-foreground">
                        {formatTime(timeElapsed)}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {error && uploadStatus === "idle" && (
        <div className="text-sm text-destructive bg-destructive/10 p-4 rounded-lg border border-destructive/20">
          {error}
        </div>
      )}
    </div>
  );
}
