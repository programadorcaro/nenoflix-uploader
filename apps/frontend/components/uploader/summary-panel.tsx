"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  ArrowReloadHorizontalIcon,
  CheckmarkCircle02Icon,
  CloudUploadIcon,
  PauseIcon,
  PlayIcon,
  StopIcon,
  WifiOff01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { ProgressRing, SpeedSparkline } from "./charts";
import type { LiveStats, MediaType, Phase, QueueItem } from "./types";
import { formatFileSize, formatSpeed, formatTime } from "./utils/format";
import { destinationPath, finalFileName } from "./utils/queue";

export interface PanelProps {
  phase: Phase;
  type: MediaType | null;
  folder: string;
  items: QueueItem[];
  conflictCount: number;
  blockedReason: string | null;
  live: LiveStats;
  lastSpeed: number | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetryFailed: () => void;
  onReset: () => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function totals(items: QueueItem[]) {
  const total = items.reduce((n, it) => n + it.file.size, 0);
  const sent = items.reduce((n, it) => n + (it.status === "done" ? it.file.size : it.sentBytes), 0);
  return { total, sent, remaining: Math.max(0, total - sent) };
}

function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/5">
      <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className={cn("mt-0.5 truncate text-sm font-semibold tabular-nums", accent && "text-primary")}>{value}</dd>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right text-sm font-medium", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}

function PrimaryButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all",
        "hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
        className
      )}
      {...props}
    />
  );
}

function GhostButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm font-medium transition-colors hover:bg-white/[0.07]",
        className
      )}
      {...props}
    />
  );
}

/** Cancel needs a second tap so a stray click does not throw away an upload. */
function CancelButton({ onCancel }: { onCancel: () => void }) {
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <GhostButton
      onClick={() => (armed ? onCancel() : setArmed(true))}
      className={cn("flex-1", armed && "border-destructive/50 bg-destructive/15 text-destructive hover:bg-destructive/25")}
    >
      <HugeiconsIcon icon={StopIcon} className="size-4" />
      {armed ? "Confirmar" : "Cancelar"}
    </GhostButton>
  );
}

function ComposeView(p: PanelProps) {
  const { total } = totals(p.items);
  const n = p.items.length;
  const eta = p.lastSpeed ? total / p.lastSpeed : null;
  const dest = p.type ? destinationPath(p.type, p.folder, n === 1 ? finalFileName(p.items[0]!) : undefined) : "—";
  return (
    <>
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Resumo</h2>
      <dl className="mt-2 divide-y divide-white/5">
        <Row label="Destino" value={<span title={dest}>{dest}</span>} mono />
        <Row label="Arquivos" value={n ? plural(n, "arquivo", "arquivos") : "—"} />
        <Row label="Tamanho" value={n ? formatFileSize(total) : "—"} />
        <Row
          label="Tempo estimado"
          value={
            eta && n ? (
              <span title="Baseado na velocidade média do último envio deste aparelho">
                ~{formatTime(eta)} <span className="text-muted-foreground">a {formatSpeed(p.lastSpeed!)}</span>
              </span>
            ) : (
              "—"
            )
          }
        />
        {p.conflictCount > 0 && (
          <Row label="Conflitos" value={<span className="text-destructive">{p.conflictCount}</span>} />
        )}
      </dl>
      {p.blockedReason && n > 0 && (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
          <HugeiconsIcon icon={Alert02Icon} className="size-4 shrink-0" />
          {p.blockedReason}
        </p>
      )}
      <PrimaryButton className="mt-4 hidden lg:flex" disabled={!!p.blockedReason} onClick={p.onStart}>
        <HugeiconsIcon icon={CloudUploadIcon} className="size-5" />
        {n > 1 ? `Enviar ${n} arquivos` : "Enviar"}
      </PrimaryButton>
    </>
  );
}

function ProgressView(p: PanelProps) {
  const { total, sent, remaining } = totals(p.items);
  const paused = p.phase === "paused";
  const multi = p.items.length > 1;
  const idx = p.items.findIndex((it) => ["uploading", "completing", "paused"].includes(it.status));
  const current = p.items[idx] ?? p.items.find((it) => it.status === "pending");
  const avg = p.live.elapsed > 0 ? sent / p.live.elapsed : 0;
  const speed = paused ? 0 : p.live.speed;
  const eta = speed > 0 ? remaining / speed : null;
  const saving = current?.status === "completing";

  return (
    <>
      <div className="flex items-center gap-4">
        <ProgressRing value={total ? (sent / total) * 100 : 0} paused={paused} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {paused ? (
              <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-300">Pausado</span>
            ) : p.live.reconnecting ? (
              <span className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-300">
                <HugeiconsIcon icon={WifiOff01Icon} className="size-3.5" /> Reconectando…
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                {saving ? "Salvando no disco" : "Enviando"}
              </span>
            )}
            {multi && idx >= 0 && (
              <span className="text-xs text-muted-foreground">
                arquivo {idx + 1} de {p.items.length}
              </span>
            )}
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm font-semibold break-all" title={current?.name}>
            {current?.name}
          </p>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {formatFileSize(sent)} de {formatFileSize(total)}
          </p>
        </div>
      </div>

      <SpeedSparkline samples={p.live.samples} className="mt-5" />

      <dl className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Velocidade" value={paused ? "—" : speed ? formatSpeed(speed) : "…"} accent />
        <Stat label="Média" value={avg ? formatSpeed(avg) : "—"} />
        <Stat label={multi ? "Restante (fila)" : "Restante"} value={eta != null ? formatTime(eta) : "—"} />
        <Stat label="Decorrido" value={formatTime(p.live.elapsed)} />
        {multi && (
          <>
            <Stat
              label="Concluídos"
              value={`${p.items.filter((it) => it.status === "done").length} / ${p.items.length}`}
            />
            <Stat label="Falta enviar" value={formatFileSize(remaining)} />
          </>
        )}
      </dl>

      <div className="mt-4 flex gap-2">
        {paused ? (
          <PrimaryButton className="h-12 flex-1" onClick={p.onResume}>
            <HugeiconsIcon icon={PlayIcon} className="size-4" /> Retomar
          </PrimaryButton>
        ) : (
          <GhostButton className="flex-1" onClick={p.onPause} disabled={saving}>
            <HugeiconsIcon icon={PauseIcon} className="size-4" /> Pausar
          </GhostButton>
        )}
        <CancelButton onCancel={p.onCancel} />
      </div>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Pode fechar e voltar depois: escolha os mesmos arquivos e o envio continua de onde parou.
      </p>
    </>
  );
}

function DoneView(p: PanelProps) {
  const ok = p.items.filter((it) => it.status === "done");
  const failed = p.items.length - ok.length;
  const bytes = ok.reduce((n, it) => n + it.file.size, 0);
  const avg = p.live.elapsed > 0 ? bytes / p.live.elapsed : 0;
  const allOk = failed === 0;
  return (
    <>
      <div className="flex flex-col items-center text-center">
        <span
          className={cn(
            "flex size-16 items-center justify-center rounded-full",
            allOk ? "bg-emerald-400/15 text-emerald-400" : "bg-destructive/15 text-destructive"
          )}
        >
          <HugeiconsIcon icon={allOk ? CheckmarkCircle02Icon : Alert02Icon} className="size-8" />
        </span>
        <h2 className="mt-3 text-xl font-bold">{allOk ? "Tudo enviado!" : ok.length ? "Envio parcial" : "Envio não concluído"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {allOk
            ? `${plural(ok.length, "arquivo já está", "arquivos já estão")} no NenoFlix.`
            : `${ok.length} enviado${ok.length === 1 ? "" : "s"}, ${failed} com falha ou cancelado${failed === 1 ? "" : "s"}.`}
        </p>
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-2">
        <Stat label="Enviado" value={formatFileSize(bytes)} />
        <Stat label="Tempo" value={formatTime(p.live.elapsed)} />
        <Stat label="Média" value={avg ? formatSpeed(avg) : "—"} />
      </dl>
      <div className="mt-4 flex flex-col gap-2">
        {failed > 0 && (
          <PrimaryButton onClick={p.onRetryFailed}>
            <HugeiconsIcon icon={ArrowReloadHorizontalIcon} className="size-5" />
            Tentar {failed === 1 ? "o que faltou" : `os ${failed} que faltaram`}
          </PrimaryButton>
        )}
        <GhostButton onClick={p.onReset} className={cn(allOk && "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20")}>
          Novo envio
        </GhostButton>
      </div>
    </>
  );
}

export function SummaryPanel(p: PanelProps) {
  return (
    <section aria-label="Resumo do envio" className="panel p-4 sm:p-5">
      {p.phase === "compose" && <ComposeView {...p} />}
      {(p.phase === "uploading" || p.phase === "paused") && <ProgressView {...p} />}
      {p.phase === "done" && <DoneView {...p} />}
    </section>
  );
}

/** Phone-only bottom bar: the main action is always one tap away. */
export function MobileBar(p: PanelProps) {
  if (p.phase !== "compose" || p.items.length === 0) return null;
  const { total } = totals(p.items);
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-background/80 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{plural(p.items.length, "arquivo", "arquivos")}</p>
          <p className={cn("truncate text-xs", p.blockedReason ? "text-amber-300" : "text-muted-foreground")}>
            {p.blockedReason ?? formatFileSize(total)}
          </p>
        </div>
        <PrimaryButton className="w-auto shrink-0 px-6" disabled={!!p.blockedReason} onClick={p.onStart}>
          <HugeiconsIcon icon={CloudUploadIcon} className="size-5" />
          Enviar
        </PrimaryButton>
      </div>
    </div>
  );
}
