export class DecayTimer {
  private timeout: number | null = null;
  private startAt: number | null = null;
  private cb: (() => void) | null = null;
  durationMs = 30_000;

  start(onDecay: () => void): void {
    this.stop();
    this.cb = onDecay;
    this.startAt = performance.now();
    this.timeout = window.setTimeout(() => {
      this.cb?.();
    }, this.durationMs);
  }

  poke(): void {
    if (this.startAt === null || !this.cb) return;
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = window.setTimeout(() => this.cb?.(), this.durationMs);
  }

  stop(): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
    this.startAt = null;
  }

  remaining(): number {
    if (this.startAt === null) return this.durationMs;
    const elapsed = performance.now() - this.startAt;
    return Math.max(0, this.durationMs - elapsed);
  }
}
