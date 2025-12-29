"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { MultipleFileItem } from "./types";
import { generateSuggestedName } from "../utils/name-suggestion";

interface FileNamesEditorProps {
  files: MultipleFileItem[];
  onFileNameChange: (id: string, fileName: string) => void;
  folderName: string;
  contentType: "series" | "animes";
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
        const extractFileName = (fileName: string): string => {
          const lastDotIndex = fileName.lastIndexOf(".");
          if (lastDotIndex === -1) return fileName;
          return fileName.substring(0, lastDotIndex);
        };
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

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold text-foreground">
            Definir nomes dos arquivos
          </p>
          {(contentType === "series" || contentType === "animes") && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleApplySuggestions}
              disabled={disabled}
              className="text-xs"
            >
              Aplicar sugestão de nomes
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Cada arquivo será salvo com o nome definido abaixo. Os nomes são
          pré-preenchidos automaticamente.
        </p>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {files.map((fileItem, index) => (
          <div
            key={fileItem.id}
            className="rounded-lg border border-border bg-card p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-1">
                  Arquivo {index + 1} de {files.length}
                </p>
                <p className="text-sm font-medium text-foreground truncate">
                  {fileItem.originalFileName}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {(fileItem.file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>

            <Field>
              <div className="flex items-center gap-2 mb-2">
                <FieldLabel
                  htmlFor={`file-name-${fileItem.id}`}
                  className="text-sm font-semibold"
                >
                  Nome do arquivo <span className="text-destructive">*</span>
                </FieldLabel>
                {(contentType === "series" || contentType === "animes") && (
                  <div className="group relative">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4 text-muted-foreground cursor-help"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                      <path d="M12 17h.01" />
                    </svg>
                    <div className="absolute left-0 top-6 z-10 hidden group-hover:block w-64 p-2 bg-popover border border-border rounded-md shadow-md text-xs text-popover-foreground">
                      <p className="font-semibold mb-1">Sugestão:</p>
                      <p className="text-muted-foreground">
                        {generateSuggestedName(
                          folderName,
                          fileItem.originalFileName,
                          index
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <Input
                id={`file-name-${fileItem.id}`}
                placeholder="Digite o nome do arquivo"
                value={fileItem.fileName}
                onChange={(e) => onFileNameChange(fileItem.id, e.target.value)}
                disabled={disabled}
                required
                className="text-base"
              />
            </Field>
          </div>
        ))}
      </div>
    </div>
  );
}
