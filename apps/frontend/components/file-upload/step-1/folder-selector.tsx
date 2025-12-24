"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FolderSelectorProps {
  subFolderName: string;
  selectedExistingFolder: string;
  existingFolders: string[];
  isLoadingFolders: boolean;
  onSubFolderNameChange: (value: string) => void;
  onExistingFolderChange: (value: string) => void;
  disabled?: boolean;
}

export function FolderSelector({
  subFolderName,
  selectedExistingFolder,
  existingFolders,
  isLoadingFolders,
  onSubFolderNameChange,
  onExistingFolderChange,
  disabled = false,
}: FolderSelectorProps) {
  const handleSubFolderNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSubFolderNameChange(e.target.value);
    onExistingFolderChange("");
  };

  const handleExistingFolderChange = (value: string) => {
    onExistingFolderChange(value);
    onSubFolderNameChange("");
  };

  return (
    <div className="space-y-4 pt-4 border-t">
      <Field>
        <FieldLabel htmlFor="sub-folder-name">Nome da Pasta</FieldLabel>
        <Input
          id="sub-folder-name"
          placeholder="Ex: breaking-bad, naruto"
          value={subFolderName}
          onChange={handleSubFolderNameChange}
          disabled={disabled}
        />
      </Field>
      <div className="text-sm text-muted-foreground text-center">ou</div>
      <Field>
        <FieldLabel htmlFor="existing-folder">
          Selecionar Pasta Existente
        </FieldLabel>
        <Select
          value={selectedExistingFolder}
          onValueChange={handleExistingFolderChange}
          disabled={disabled || isLoadingFolders}
        >
          <SelectTrigger id="existing-folder">
            <SelectValue
              placeholder={
                isLoadingFolders ? "Carregando..." : "Selecione uma pasta"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {existingFolders.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                Nenhuma pasta encontrada
              </div>
            ) : (
              existingFolders.map((folder) => (
                <SelectItem key={folder} value={folder}>
                  {folder}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

