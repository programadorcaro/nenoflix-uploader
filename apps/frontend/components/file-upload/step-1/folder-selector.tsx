"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";

interface FolderSelectorProps {
  label: string;
  /** Current folder text: an existing folder or a new name. */
  value: string;
  existingFolders: string[];
  isLoadingFolders: boolean;
  onChange: (value: string, isExisting: boolean) => void;
  disabled?: boolean;
}

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** One field for both cases: type to filter existing folders or to name a new one. */
export function FolderSelector({
  label,
  value,
  existingFolders,
  isLoadingFolders,
  onChange,
  disabled = false,
}: FolderSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const query = normalize(value);
  const isExisting = existingFolders.includes(value.trim());
  const matches = React.useMemo(
    () => existingFolders.filter((f) => normalize(f).includes(query)),
    [existingFolders, query]
  );

  const pick = (folder: string) => {
    onChange(folder, true);
    setOpen(false);
  };

  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor="folder" className="text-sm font-semibold sm:text-base">
          {label}
        </FieldLabel>
        {value.trim() && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              isExisting ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"
            }`}
          >
            {isExisting ? "Pasta existente" : "Nova pasta"}
          </span>
        )}
      </div>
      <div>
        <Input
          id="folder"
          value={value}
          placeholder={isLoadingFolders ? "Carregando pastas..." : "Buscar ou criar pasta"}
          onChange={(e) => {
            onChange(e.target.value, existingFolders.includes(e.target.value.trim()));
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && matches[0] && !isExisting) {
              e.preventDefault();
              pick(matches[0]);
            }
          }}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="folder-options"
          className="h-11 text-base"
        />
        {open && !isExisting && matches.length > 0 && (
          <ul
            id="folder-options"
            role="listbox"
            className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover p-1"
          >
            {matches.map((folder) => (
              <li key={folder} role="option" aria-selected={false}>
                <button
                  type="button"
                  // mousedown fires before the input blur closes the list
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(folder);
                  }}
                  className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                >
                  <span className="truncate">{folder}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {existingFolders.length > 0
          ? `${existingFolders.length} pastas existentes. Digite para buscar ou use um nome novo.`
          : "Digite o nome da pasta."}
      </p>
    </Field>
  );
}
