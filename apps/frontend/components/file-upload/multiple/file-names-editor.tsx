"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import type { MultipleFileItem } from "./types";

interface FileNamesEditorProps {
  files: MultipleFileItem[];
  onFileNameChange: (id: string, fileName: string) => void;
  folderName: string;
  disabled?: boolean;
}

export function FileNamesEditor({
  files,
  onFileNameChange,
  folderName,
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

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <p className="text-sm font-semibold text-foreground mb-1">
          Definir nomes dos arquivos
        </p>
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
              <FieldLabel
                htmlFor={`file-name-${fileItem.id}`}
                className="text-sm font-semibold mb-2"
              >
                Nome do arquivo <span className="text-destructive">*</span>
              </FieldLabel>
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

