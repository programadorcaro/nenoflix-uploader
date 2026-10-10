"use client";

import * as React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import confetti from "canvas-confetti";
import type { Step3Data, Step2Data, Step1Data } from "./types";
import { formatFileSize, formatTime, mediaLocation } from "./utils/format";

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
  reconnecting?: boolean;
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
  reconnecting,
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

  // Short location: "/Movies" or "/Series/<folder>"
  const displayPath =
    finalFilePath && step1Data.contentType
      ? mediaLocation(finalFilePath, step1Data.contentType)
      : "";

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

    }

    return items;
  }, [
    folderName,
    step3Data.fileName,
    step2Data.selectedFile,
  ]);

  const result = (ok: boolean) => (
    <div className="flex flex-col gap-5 pb-4 sm:gap-6 sm:pb-0">
      <div className="flex items-center gap-4 sm:flex-col sm:text-center">
        <Image
          src={ok ? "/sucess.jpg" : "/error.jpg"}
          alt={ok ? "Upload concluído" : "Erro no upload"}
          width={400}
          height={300}
          className="size-16 shrink-0 rounded-xl object-cover shadow-lg sm:size-28 sm:rounded-2xl"
          priority
        />
        <div className="min-w-0">
          <h3 className={`text-xl font-bold sm:text-3xl ${ok ? "text-primary" : "text-destructive"}`}>
            {ok ? "Upload concluído com sucesso!" : "Erro no upload"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {ok ? "O arquivo foi salvo na pasta do NenoFlix." : "Nada foi salvo. Tente de novo."}
          </p>
        </div>
      </div>

      {ok ? (
        <dl className="grid gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-2 sm:p-5">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Nome do arquivo</dt>
            <dd className="mt-0.5 break-all font-semibold">{step3Data.fileName}</dd>
          </div>
          {displayPath && (
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Localização</dt>
              <dd className="mt-0.5 break-all font-mono">{displayPath}</dd>
            </div>
          )}
        </dl>
      ) : (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm font-medium text-destructive">
          {error || "Ocorreu um erro ao enviar o arquivo."}
        </div>
      )}

      <Button
        onClick={onReset}
        type="button"
        className="h-12 w-full text-base font-semibold sm:mx-auto sm:h-11 sm:w-auto sm:min-w-48"
      >
        {ok ? "Concluir" : "Voltar ao início"}
      </Button>
    </div>
  );

  if (uploadStatus === "success") return result(true);
  if (uploadStatus === "error") return result(false);

  const completing = uploadStatus === "completing";
  const stats = [
    {
      label: "Velocidade",
      value: reconnecting ? "Reconectando…" : uploadSpeed ? `${(uploadSpeed / 1048576).toFixed(1)} MB/s` : "—",
    },
    { label: "Decorrido", value: timeElapsed !== undefined ? formatTime(timeElapsed) : "—" },
    { label: "Restante", value: completing ? "0s" : timeRemaining != null ? formatTime(timeRemaining) : "—" },
  ];

  return (
    <div className="flex flex-col gap-4 pb-4 sm:gap-5 sm:pb-0">
      {(isUploading || completing) && (
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 sm:p-6">
          <div className="flex items-center gap-4">
            <Image
              src="/loading.jpg"
              alt=""
              width={400}
              height={300}
              className="size-14 shrink-0 rounded-xl object-cover shadow-lg sm:size-20"
              priority
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-base font-semibold sm:text-lg">
                  {completing ? "Finalizando..." : "Enviando arquivo"}
                </h3>
                <span className="text-2xl font-bold tabular-nums text-primary">
                  {completing ? 100 : Math.round(progress)}%
                </span>
              </div>
              <Progress value={completing ? 100 : progress} className="mt-2 h-2.5" />
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg bg-background/50 px-2 py-2">
                <dt className="text-[11px] text-muted-foreground">{s.label}</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {summaryItems.length > 0 && (
        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:p-5">
          {summaryItems.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="mt-0.5 truncate font-semibold" title={item.value}>
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {error && uploadStatus === "idle" && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
