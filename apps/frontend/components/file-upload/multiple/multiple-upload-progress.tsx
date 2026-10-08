"use client";

import Image from "next/image";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import type { MultipleFileItem } from "./types";
import { formatFileSize, formatTime, mediaLocation } from "../utils/format";

interface MultipleUploadProgressProps {
  files: MultipleFileItem[];
  currentUploadIndex: number;
  contentType: "series" | "animes" | "movies";
  onReset: () => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? "s" : ""}`;

function StatusMark({ status }: { status: MultipleFileItem["status"] }) {
  if (status === "completed") return <span className="text-primary" aria-label="Concluído">✓</span>;
  if (status === "error") return <span className="text-destructive" aria-label="Erro">✕</span>;
  if (status === "pending") return <span className="text-muted-foreground" aria-label="Aguardando">•</span>;
  return <span className="inline-block size-3 animate-pulse rounded-full bg-primary" aria-label="Enviando" />;
}

export function MultipleUploadProgress({ files, currentUploadIndex, contentType, onReset }: MultipleUploadProgressProps) {
  const completed = files.filter((f) => f.status === "completed").length;
  const errors = files.filter((f) => f.status === "error").length;
  const finished = completed + errors === files.length;
  const current = files[currentUploadIndex];

  // Overall progress weighted by size, so one big file doesn't jump the bar.
  const totalBytes = files.reduce((n, f) => n + f.file.size, 0) || 1;
  const sentBytes = files.reduce(
    (n, f) => n + (f.status === "completed" ? f.file.size : f.status === "error" ? 0 : (f.file.size * f.progress) / 100),
    0
  );
  const overall = finished ? 100 : (sentBytes / totalBytes) * 100;

  const list = (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {files.map((f) => {
        const active = f.status === "uploading" || f.status === "completing";
        return (
          <li key={f.id} className={`px-4 py-3 ${active ? "bg-primary/5" : ""}`}>
            <div className="flex items-center gap-3">
              <span className="w-4 shrink-0 text-center text-sm">
                <StatusMark status={f.status} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={f.fileName}>
                  {f.fileName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {f.status === "completed" && f.finalFilePath
                    ? mediaLocation(f.finalFilePath, contentType, contentType === "movies")
                    : f.status === "error"
                      ? f.error
                      : formatFileSize(f.file.size)}
                </p>
              </div>
              {active && (
                <span className="shrink-0 text-xs font-semibold tabular-nums text-primary">
                  {f.status === "completing" ? "Finalizando" : `${Math.round(f.progress)}%`}
                </span>
              )}
            </div>
            {active && <Progress value={f.status === "completing" ? 100 : f.progress} className="mt-2 h-1.5" />}
          </li>
        );
      })}
    </ul>
  );

  if (finished) {
    const ok = errors === 0;
    return (
      <div className="flex flex-col gap-5 pb-4 sm:gap-6 sm:pb-0">
        <div className="flex items-center gap-4 sm:flex-col sm:text-center">
          <Image
            src={ok ? "/sucess.jpg" : "/error.jpg"}
            alt={ok ? "Upload concluído" : "Upload com erros"}
            width={400}
            height={300}
            className="size-16 shrink-0 rounded-xl object-cover shadow-lg sm:size-28 sm:rounded-2xl"
            priority
          />
          <div>
            <h3 className={`text-xl font-bold sm:text-3xl ${ok ? "text-primary" : "text-destructive"}`}>
              {ok ? "Todos os uploads concluídos!" : "Upload finalizado com erros"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {ok
                ? `${plural(completed, "arquivo")} enviado${completed !== 1 ? "s" : ""}.`
                : `${completed} enviado${completed !== 1 ? "s" : ""}, ${errors} com erro.`}
            </p>
          </div>
        </div>
        {list}
        <Button type="button" onClick={onReset} className="h-12 w-full text-base font-semibold sm:mx-auto sm:h-11 sm:w-auto sm:min-w-48">
          Concluir
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-4 sm:pb-0">
      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-base font-semibold sm:text-lg">
            Enviando {Math.min(currentUploadIndex + 1, files.length)} de {files.length}
          </h3>
          <span className="text-2xl font-bold tabular-nums text-primary">{Math.round(overall)}%</span>
        </div>
        <Progress value={overall} className="mt-3 h-2.5" />
        <p className="mt-2 text-xs text-muted-foreground tabular-nums">
          {current?.uploadSpeed ? `${(current.uploadSpeed / 1048576).toFixed(1)} MB/s` : "Calculando velocidade..."}
          {current?.timeElapsed !== undefined && ` · ${formatTime(current.timeElapsed)} neste arquivo`}
        </p>
      </div>
      {list}
    </div>
  );
}
