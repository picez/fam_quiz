import type { Scheduler } from '../rooms/scheduler';

/** Годинник, який рухається лише через advance(); таймери спрацьовують у порядку часу. */
export class FakeScheduler implements Scheduler {
  private time = 1_000_000;
  private sequence = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();

  now(): number {
    return this.time;
  }

  setTimeout(fn: () => void, ms: number): unknown {
    this.sequence += 1;
    this.timers.set(this.sequence, { at: this.time + Math.max(0, ms), fn });
    return this.sequence;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (due === undefined) break;
      this.timers.delete(due[0]);
      this.time = due[1].at;
      due[1].fn();
    }
    this.time = target;
  }
}
