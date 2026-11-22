import { monitorEventLoopDelay, type ELDHistogram } from 'node:perf_hooks';

export interface ProcessSnapshot {
  /** Частка одного ядра за останню хвилину, %; null — хвилина ще не минула. */
  cpuPercent: number | null;
  /** Затримка циклу подій за останню хвилину, мс. */
  lagMs: { p50: number; p99: number; max: number } | null;
}
export interface ProcessStats {
  snapshot(): ProcessSnapshot;
  stop(): void;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const nsToMs = (ns: number) => round1(ns / 1e6);

/** 71: раз на хвилину — частка одного ядра й затримка циклу подій за цю хвилину; «Стан» читає останній знімок. */
export function processStats(
  deps: { cpuUsage?: () => NodeJS.CpuUsage; histogram?: ELDHistogram; now?: () => number; intervalMs?: number } = {},
): ProcessStats {
  const cpuUsage = deps.cpuUsage ?? (() => process.cpuUsage());
  const now = deps.now ?? (() => Date.now());
  const histogram = deps.histogram ?? monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  let last: ProcessSnapshot = { cpuPercent: null, lagMs: null };
  let prevCpu = cpuUsage();
  let prevAt = now();

  const sample = () => {
    const cpu = cpuUsage();
    const at = now();
    const elapsedMs = at - prevAt;
    const usedMicros = cpu.user - prevCpu.user + (cpu.system - prevCpu.system);
    const cpuPercent = elapsedMs > 0 ? round1((usedMicros / (elapsedMs * 1000)) * 100) : null;
    last = { cpuPercent, lagMs: { p50: nsToMs(histogram.percentile(50)), p99: nsToMs(histogram.percentile(99)), max: nsToMs(histogram.max) } };
    histogram.reset();
    prevCpu = cpu;
    prevAt = at;
  };
  const timer = setInterval(sample, deps.intervalMs ?? 60_000);
  // Таймер не тримає процес живим.
  timer.unref?.();

  return {
    snapshot: () => last,
    stop: () => {
      clearInterval(timer);
      histogram.disable();
    },
  };
}
