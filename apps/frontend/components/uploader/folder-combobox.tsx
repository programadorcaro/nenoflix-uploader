"use client";

import * as React from "react";
import { Popover } from "radix-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Folder01Icon, FolderAddIcon, Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

interface FolderComboboxProps {
  value: string;
  folders: string[];
  loading: boolean;
  onChange: (folder: string) => void;
  disabled?: boolean;
}

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// Same characters the server strips from folder names.
// eslint-disable-next-line no-control-regex -- mirrors the server cleanName
const cleanFolder = (s: string) => s.replace(/[<>:"/\\|?*.\x00-\x1F]/g, "").trim();

/** One field to search an existing folder or create a new one. */
export function FolderCombobox({ value, folders, loading, onChange, disabled }: FolderComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);

  const q = normalize(query);
  const matches = q ? folders.filter((f) => normalize(f).includes(q)) : folders;
  const typed = cleanFolder(query);
  const canCreate = typed !== "" && !folders.some((f) => normalize(f) === normalize(typed));
  // Existing folders first, so Enter on a partial name picks the match instead of creating a near-duplicate.
  const options = [...matches.map((name) => ({ create: false, name })), ...(canCreate ? [{ create: true, name: typed }] : [])];
  const isNew = value !== "" && !folders.includes(value);

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") setActive((i) => Math.min(options.length - 1, i + 1));
    else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
    else if (e.key === "Enter" && options[active]) pick(options[active].name);
    else return;
    e.preventDefault();
  };

  return (
    <Popover.Root open={open} onOpenChange={(o) => (setOpen(o), setActive(0))}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "flex h-12 w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-left transition-colors",
            "hover:border-primary/40 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:border-primary/60"
          )}
        >
          <HugeiconsIcon
            icon={isNew ? FolderAddIcon : Folder01Icon}
            className={cn("size-5 shrink-0", value ? "text-primary" : "text-muted-foreground")}
          />
          <span className={cn("min-w-0 flex-1 truncate text-base sm:text-sm", !value && "text-muted-foreground")}>
            {value || (loading ? "Carregando pastas…" : "Buscar ou criar pasta")}
          </span>
          {isNew && (
            <span className="shrink-0 rounded-md bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">nova</span>
          )}
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-50 w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-xl border border-white/10 bg-popover/95 shadow-2xl shadow-black/40 backdrop-blur-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-center gap-2 border-b border-white/10 px-3">
            <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => (setQuery(e.target.value), setActive(0))}
              onKeyDown={onKeyDown}
              placeholder="Nome da série ou anime"
              className="h-11 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
            />
          </div>
          <ul role="listbox" className="max-h-72 overflow-y-auto p-1">
            {options.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {loading ? "Carregando…" : "Nenhuma pasta. Digite um nome para criar."}
              </li>
            )}
            {options.map((o, i) => (
              <li key={(o.create ? "+" : "") + o.name} role="option" aria-selected={value === o.name}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o.name)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm",
                    i === active ? "bg-primary/15 text-foreground" : "text-foreground/90"
                  )}
                >
                  <HugeiconsIcon
                    icon={o.create ? FolderAddIcon : Folder01Icon}
                    className={cn("size-4 shrink-0", o.create ? "text-primary" : "text-muted-foreground")}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {o.create ? (
                      <>
                        Criar pasta <span className="font-semibold text-primary">“{o.name}”</span>
                      </>
                    ) : (
                      o.name
                    )}
                  </span>
                  {value === o.name && <HugeiconsIcon icon={Tick02Icon} className="size-4 shrink-0 text-primary" />}
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
