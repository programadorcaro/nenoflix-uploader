"use client";

import { cn } from "@/lib/utils";
import { formatSpeed } from "./utils/format";

/** Live speed area chart from one sample per second. */
export function SpeedSparkline({ samples, className }: { samples: number[]; className?: string }) {
  const W = 300;
  const H = 64;
  const max = Math.max(1, ...samples);
  const step = W / Math.max(1, samples.length - 1);
  const pts = samples.map((v, i) => [i * step, H - 4 - (v / max) * (H - 10)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = pts.length > 1 ? `${line} L${W},${H} L0,${H} Z` : "";
  const last = pts[pts.length - 1];

  return (
    <div className={cn("relative", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-16 w-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="currentColor" className="text-white/5" strokeDasharray="2 4" />
        ))}
        {area && <path d={area} fill="url(#spark-fill)" />}
        {pts.length > 1 && (
          <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        )}
        {last && <circle cx={last[0]} cy={last[1]} r="3" fill="var(--primary)" vectorEffect="non-scaling-stroke" />}
      </svg>
      <span className="absolute top-0 right-0 text-[10px] text-muted-foreground tabular-nums">pico {formatSpeed(max)}</span>
    </div>
  );
}

/** Circular progress with the percentage in the middle. */
export function ProgressRing({ value, paused, size = 112 }: { value: number; paused?: boolean; size?: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-white/5" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={paused ? "var(--color-amber-400)" : "var(--primary)"}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
          className="drop-shadow-[0_0_8px_var(--primary)] transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">
          {Math.floor(v)}
          <span className="text-sm text-muted-foreground">%</span>
        </span>
      </div>
    </div>
  );
}
