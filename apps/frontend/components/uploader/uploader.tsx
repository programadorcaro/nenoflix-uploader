"use client";

import * as React from "react";
import Image from "next/image";
import confetti from "canvas-confetti";
import { HugeiconsIcon } from "@hugeicons/react";
import { Folder01Icon, FolderAddIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { PAUSED, discardUpload, getLastSpeed, listFiles, listFolders, uploadFile } from "@/lib/upload";
import { BACKEND_URL } from "./constants";
import { DropZone } from "./drop-zone";
import { FolderCombobox } from "./folder-combobox";
import { QueueList } from "./queue-list";
import { SingleFileCard } from "./single-file-card";
import { MobileBar, SummaryPanel } from "./summary-panel";
import { TypePicker } from "./type-picker";
import type { ExistingFile, LiveStats, MediaType, Phase, QueueItem } from "./types";
import { extractFileName, formatFileSize } from "./utils/format";
import { generateSuggestedName } from "./utils/name-suggestion";
import { episodeTag, findConflicts, folderSummary, sortByEpisode } from "./utils/queue";

const SAMPLES = 90; // seconds of speed history in the chart
const emptyLive: LiveStats = { speed: 0, reconnecting: false, samples: [], elapsed: 0 };

function Section({ n, title, aside, children }: { n: number; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{n}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside && <div className="ml-auto min-w-0 text-xs text-muted-foreground">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function useServerStatus() {
  const [ok, setOk] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    const check = () =>
      fetch(`${BACKEND_URL}/health`)
        .then((r) => r.json())
        .then((h: { mediaRootOk?: boolean }) => setOk(!!h.mediaRootOk), () => setOk(false));
    check();
    const t = setInterval(check, 20_000);
    return () => clearInterval(t);
  }, []);
  return ok;
}

export function Uploader() {
  const [type, setType] = React.useState<MediaType | null>(null);
  const [folder, setFolder] = React.useState("");
  const [folders, setFolders] = React.useState<string[]>([]);
  const [foldersLoading, setFoldersLoading] = React.useState(false);
  const [existing, setExisting] = React.useState<ExistingFile[]>([]);
  const [existingLoaded, setExistingLoaded] = React.useState(false);
  const [items, setItems] = React.useState<QueueItem[]>([]);
  const [phase, setPhase] = React.useState<Phase>("compose");
  const [live, setLive] = React.useState<LiveStats>(emptyLive);
  const [lastSpeed, setLastSpeed] = React.useState<number | null>(null);
  const serverOk = useServerStatus();
  const [refreshKey, setRefreshKey] = React.useState(0);

  const itemsRef = React.useRef(items);
  React.useLayoutEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const controllerRef = React.useRef<AbortController | null>(null);
  const speedRef = React.useRef({ speed: 0, reconnecting: false });
  const clockRef = React.useRef({ base: 0, startedAt: 0 });
  const itemElapsedRef = React.useRef(new Map<string, number>());

  const isShow = type === "series" || type === "animes";
  const running = phase === "uploading";
  const busy = phase === "uploading" || phase === "paused";

  React.useEffect(() => setLastSpeed(getLastSpeed()), [phase]);
  React.useEffect(() => () => controllerRef.current?.abort(PAUSED), []);

  // Folders of the chosen library.
  React.useEffect(() => {
    if (!isShow || !type) return;
    const c = new AbortController();
    setFoldersLoading(true);
    listFolders(type, c.signal)
      .then(setFolders, () => setFolders([]))
      .finally(() => setFoldersLoading(false));
    return () => c.abort();
  }, [type, isShow, refreshKey]);

  // Files already at the destination, for conflicts and the folder summary.
  React.useEffect(() => {
    setExisting([]);
    setExistingLoaded(false);
    if (!type || (isShow && !folder)) return;
    const c = new AbortController();
    listFiles(type, isShow ? folder : "", c.signal).then(
      (f) => (setExisting(f), setExistingLoaded(true)),
      () => {}
    );
    return () => c.abort();
  }, [type, folder, isShow, refreshKey]);

  // Clock + one speed sample per second while sending.
  React.useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      const { speed, reconnecting } = speedRef.current;
      const { base, startedAt } = clockRef.current;
      setLive((l) => ({
        speed,
        reconnecting,
        elapsed: base + (performance.now() - startedAt) / 1000,
        samples: [...l.samples, reconnecting ? 0 : speed].slice(-SAMPLES),
      }));
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  React.useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  React.useEffect(() => {
    if (phase !== "done" || !items.length || items.some((it) => it.status !== "done")) return;
    const colors = ["#ff4fa3", "#ff8cc6", "#ffffff"];
    confetti({ particleCount: 90, spread: 70, origin: { x: 0.2, y: 0.7 }, colors });
    confetti({ particleCount: 90, spread: 70, origin: { x: 0.8, y: 0.7 }, colors });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const patch = (id: string, data: Partial<QueueItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...data } : it)));

  const suggestionFor = (it: QueueItem) =>
    isShow && folder && episodeTag(it.file.name) ? generateSuggestedName(folder, it.file.name) : null;

  const addFiles = (files: File[]) => {
    setItems((prev) => {
      const known = new Set(prev.map((it) => `${it.file.name}|${it.file.size}`));
      const fresh = files
        .filter((f) => !known.has(`${f.name}|${f.size}`))
        .map<QueueItem>((file) => ({
          id: crypto.randomUUID(),
          file,
          name: extractFileName(file.name),
          status: "pending",
          progress: 0,
          sentBytes: 0,
        }));
      const next = [...prev, ...fresh];
      return isShow ? sortByEpisode(next) : next;
    });
  };

  const pauseClock = () => {
    const c = clockRef.current;
    c.base += (performance.now() - c.startedAt) / 1000;
    setLive((l) => ({ ...l, elapsed: c.base, speed: 0, reconnecting: false }));
  };

  // Sends pending and paused items one at a time; the chunk pool already fills the link.
  const run = async (include: QueueItem["status"][] = ["pending", "paused"]) => {
    if (!type) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    speedRef.current = { speed: 0, reconnecting: false };
    clockRef.current.startedAt = performance.now();
    setPhase("uploading");

    const queue = itemsRef.current.filter((it) => include.includes(it.status)).map((it) => it.id);
    for (const id of queue) {
      const it = itemsRef.current.find((x) => x.id === id);
      if (!it) continue;
      const elapsedBefore = itemElapsedRef.current.get(id) ?? 0;
      patch(id, { status: "uploading", error: undefined });
      try {
        const finalPath = await uploadFile(
          it.file,
          { type, folder: isShow ? folder : "", fileName: it.name.trim() },
          {
            signal: controller.signal,
            onFinalizing: () => patch(id, { status: "completing" }),
            onProgress: (p) => {
              speedRef.current = { speed: p.uploadSpeed, reconnecting: p.reconnecting };
              itemElapsedRef.current.set(id, elapsedBefore + p.timeElapsed);
              patch(id, { progress: p.percentage, sentBytes: p.sentBytes });
            },
          }
        );
        patch(id, {
          status: "done",
          progress: 100,
          sentBytes: it.file.size,
          finalPath,
          elapsed: itemElapsedRef.current.get(id),
        });
      } catch (err) {
        if (controller.signal.aborted) {
          pauseClock();
          if (controller.signal.reason === PAUSED) {
            patch(id, { status: "paused" });
            setPhase("paused");
          } else {
            markCancelled();
            setPhase("done");
          }
          return;
        }
        patch(id, { status: "error", error: err instanceof Error ? err.message : "Falha no envio" });
      }
    }
    pauseClock();
    setPhase("done");
    setRefreshKey((k) => k + 1);
  };

  const markCancelled = () =>
    setItems((prev) =>
      prev.map((it) =>
        it.status === "done" || it.status === "error"
          ? it
          : { ...it, status: "error", error: "Cancelado", progress: 0, sentBytes: 0 }
      )
    );

  const start = () => {
    clockRef.current = { base: 0, startedAt: 0 };
    itemElapsedRef.current.clear();
    setLive(emptyLive);
    void run();
  };

  const cancel = () => {
    if (phase === "uploading") return controllerRef.current?.abort();
    // Paused: nothing is running, so drop the server sessions here.
    for (const it of itemsRef.current) {
      if (it.status === "paused" && type) discardUpload(it.file, { type, folder: isShow ? folder : "", fileName: it.name.trim() });
    }
    markCancelled();
    setPhase("done");
  };

  const retryFailed = () => {
    setItems((prev) =>
      prev.map((it) => (it.status === "error" ? { ...it, status: "pending", error: undefined, progress: 0, sentBytes: 0 } : it))
    );
    void run(["error"]);
  };

  const reset = () => {
    setItems([]);
    setLive(emptyLive);
    setPhase("compose");
  };

  const chooseType = (t: MediaType) => {
    if (t === type) return;
    setType(t);
    setFolder("");
    setFolders([]);
  };

  const conflicts = React.useMemo(
    () => (phase === "compose" ? findConflicts(items, existing) : new Map<string, string>()),
    [items, existing, phase]
  );

  const blockedReason = !serverOk && serverOk !== null
    ? "Servidor offline"
    : !type
      ? "Escolha o tipo de conteúdo"
      : isShow && !folder
        ? `Escolha a pasta ${type === "series" ? "da série" : "do anime"}`
        : !items.length
          ? "Adicione arquivos"
          : conflicts.size
            ? `${conflicts.size} ${conflicts.size === 1 ? "nome em conflito" : "nomes em conflito"}`
            : null;

  const summary = folderSummary(existing);
  const folderInfo =
    !type || (isShow && !folder) ? null : !existingLoaded ? (
      "Carregando…"
    ) : isShow ? (
      summary.count ? (
        <span className="flex items-center gap-1.5">
          <HugeiconsIcon icon={Folder01Icon} className="size-3.5" />
          {summary.count} episódios{summary.lastEpisode && ` · até ${summary.lastEpisode}`} · {formatFileSize(summary.bytes)}
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-primary">
          <HugeiconsIcon icon={FolderAddIcon} className="size-3.5" />
          Pasta nova, será criada
        </span>
      )
    ) : (
      `${summary.count} filmes na biblioteca`
    );

  const panelProps = {
    phase,
    type,
    folder: isShow ? folder : "",
    items,
    conflictCount: conflicts.size,
    blockedReason,
    live,
    lastSpeed,
    onStart: start,
    onPause: () => controllerRef.current?.abort(PAUSED),
    onResume: () => void run(),
    onCancel: cancel,
    onRetryFailed: retryFailed,
    onReset: reset,
  };

  const single = items.length === 1 ? items[0] : null;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Image src="/logo-rosa.png" alt="NenoFlix" width={140} height={56} className="h-7 w-auto sm:h-8" priority />
            <span className="hidden text-sm text-muted-foreground sm:inline">Upload</span>
          </div>
          <span
            className={cn(
              "flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium",
              serverOk === false ? "border-destructive/30 text-destructive" : "border-white/10 text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "size-2 rounded-full",
                serverOk === null ? "bg-muted-foreground" : serverOk ? "bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400" : "bg-destructive"
              )}
            />
            {serverOk === false ? "Servidor offline" : "Servidor online"}
          </span>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 pt-5 pb-28 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8 lg:pt-10 lg:pb-12">
        <div className={cn("flex min-w-0 flex-col gap-7", phase !== "compose" && "order-2 lg:order-none")}>
          <div className="hidden lg:block">
            <h1 className="text-2xl font-bold tracking-tight">Enviar para o NenoFlix</h1>
            <p className="mt-1 text-sm text-muted-foreground">Filmes, séries e animes direto na biblioteca do Jellyfin.</p>
          </div>

          <Section n={1} title="Tipo de conteúdo">
            <TypePicker value={type} onChange={chooseType} disabled={phase !== "compose"} />
          </Section>

          {type && (
            <Section
              n={2}
              title={isShow ? (type === "series" ? "Série" : "Anime") : "Destino"}
              aside={folderInfo}
            >
              {isShow ? (
                <FolderCombobox
                  value={folder}
                  folders={folders}
                  loading={foldersLoading}
                  onChange={setFolder}
                  disabled={phase !== "compose"}
                />
              ) : (
                <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 font-mono text-sm text-muted-foreground">/Movies</p>
              )}
            </Section>
          )}

          <Section
            n={type ? 3 : 2}
            title={items.length > 1 ? "Fila de envio" : "Arquivo"}
            aside={items.length > 1 && phase === "compose" ? "Envia um por vez, na ordem dos episódios" : undefined}
          >
            {phase === "compose" && <DropZone onFiles={addFiles} compact={items.length > 0} />}
            {single && (
              <SingleFileCard
                item={single}
                type={type ?? "movies"}
                folder={isShow ? folder : ""}
                conflict={conflicts.get(single.id)}
                suggestion={suggestionFor(single)}
                locked={phase !== "compose"}
                onRename={(name) => patch(single.id, { name })}
                onRemove={() => setItems([])}
              />
            )}
            {items.length > 1 && (
              <QueueList
                items={items}
                phase={phase}
                conflicts={conflicts}
                canSuggest={items.some((it) => suggestionFor(it))}
                onRename={(id, name) => patch(id, { name })}
                onRemove={(id) => setItems((prev) => prev.filter((it) => it.id !== id))}
                onSuggestAll={() =>
                  setItems((prev) => prev.map((it) => ({ ...it, name: suggestionFor(it) ?? it.name })))
                }
              />
            )}
          </Section>
        </div>

        <aside className={cn("lg:sticky lg:top-24 lg:self-start", phase !== "compose" && "order-1 lg:order-none")}>
          <SummaryPanel {...panelProps} />
        </aside>
      </main>

      <MobileBar {...panelProps} />
    </div>
  );
}
