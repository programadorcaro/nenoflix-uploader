"use client";

import * as React from "react";
import { extractFileName, formatFileSize } from "../utils/format";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { MultipleFileItem } from "./types";
import { generateSuggestedName } from "../utils/name-suggestion";

interface FileNamesEditorProps {
  files: MultipleFileItem[];
  onFileNameChange: (id: string, fileName: string) => void;
  folderName: string;
  contentType: "series" | "animes" | "movies";
  disabled?: boolean;
}

export function FileNamesEditor({
  files,
  onFileNameChange,
  folderName,
  contentType,
  disabled = false,
}: FileNamesEditorProps) {
  // Inicializa nomes com o nome original do arquivo se estiver vazio
  React.useEffect(() => {
    files.forEach((fileItem) => {
      if (!fileItem.fileName.trim()) {
        // Usa o nome original do arquivo (já vem pré-preenchido do multiple/index.tsx)
        // Mas garante que se estiver vazio, preenche com o nome original
        const originalName = extractFileName(fileItem.originalFileName);
        onFileNameChange(fileItem.id, originalName);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length]);

  // Aplica sugestão de nomes para todos os arquivos
  const handleApplySuggestions = () => {
    files.forEach((fileItem, index) => {
      const suggestedName = generateSuggestedName(
        folderName,
        fileItem.originalFileName,
        index
      );
      onFileNameChange(fileItem.id, suggestedName);
    });
  };

  const isShow = contentType === "series" || contentType === "animes";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold sm:text-base">Nomes dos arquivos</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Cada arquivo será salvo com o nome abaixo.</p>
        </div>
        {isShow && (
          <Button
            type="button"
            variant="outline"
            onClick={handleApplySuggestions}
            disabled={disabled}
            className="h-11 w-full shrink-0 sm:w-auto"
          >
            Aplicar sugestão de nomes
          </Button>
        )}
      </div>

      <ol className="flex flex-col gap-3">
        {files.map((fileItem, index) => (
          <li key={fileItem.id} className="rounded-xl border border-border bg-card p-3 sm:p-4">
            <Field className="gap-2">
              <FieldLabel
                htmlFor={`file-name-${fileItem.id}`}
                className="flex min-w-0 items-baseline gap-2 text-xs font-normal text-muted-foreground"
              >
                <span className="shrink-0 font-semibold text-primary">{index + 1}.</span>
                <span className="truncate" title={fileItem.originalFileName}>
                  {fileItem.originalFileName}
                </span>
                <span className="ml-auto shrink-0">{formatFileSize(fileItem.file.size)}</span>
              </FieldLabel>
              <Input
                id={`file-name-${fileItem.id}`}
                placeholder="Digite o nome do arquivo"
                value={fileItem.fileName}
                onChange={(e) => onFileNameChange(fileItem.id, e.target.value)}
                disabled={disabled}
                required
                aria-invalid={!fileItem.fileName.trim()}
                className="h-11 text-base"
              />
            </Field>
          </li>
        ))}
      </ol>
    </div>
  );
}
