// Live shake tracking: collects pointer samples, detects reversals as they happen (for
// rattle/droplet feedback), and resolves a tier with the pure classifier when the window ends.
import { feel } from '../config/feel';
import type { Quality } from '../data/types';
import { classifyShake, detectReversals, dominantAxis, type ShakeParams, type ShakeSample } from '../sim/shake';

export interface ShakeLive {
  reversals: number;
  /** 0..1 toward PERFECT. */
  progress: number;
  /** -1..1 current throw along the dominant axis (for the shaker's spring). */
  throwX: number;
  throwY: number;
  /** Seconds left in the window (or grace). */
  remaining: number;
  started: boolean;
}

export function shakeParams(generous: boolean): ShakeParams {
  const s = feel.shake;
  return {
    minTravelPx: s.minTravelPx,
    targetRate: s.targetRate,
    tempoTolerance: generous ? s.generousTolerance : s.tempoTolerance,
    perfectOnTempoFraction: s.perfectOnTempoFraction,
    greatAt: generous ? s.generousGreatAt : s.greatAt,
    perfectAt: generous ? s.generousPerfectAt : s.perfectAt,
    windowSec: s.windowSec,
  };
}

export class ShakeTracker {
  active = false;
  private generous = false;
  private samples: ShakeSample[] = [];
  private beganAt = 0;
  private firstRev = -1;
  private lastCount = 0;
  private cx = 0;
  private cy = 0;
  readonly live: ShakeLive = { reversals: 0, progress: 0, throwX: 0, throwY: 0, remaining: 0, started: false };
  onReversal: ((count: number, progress: number) => void) | null = null;
  onDone: ((q: Quality, reversals: number) => void) | null = null;
  private keyX = 0;
  private lastKey = 0;

  begin(generous: boolean, now: number): void {
    this.active = true;
    this.generous = generous;
    this.samples = [];
    this.beganAt = now;
    this.firstRev = -1;
    this.lastCount = 0;
    this.cx = this.cy = 0;
    this.keyX = 0;
    this.lastKey = 0;
    Object.assign(this.live, { reversals: 0, progress: 0, throwX: 0, throwY: 0, remaining: feel.shake.idleGraceSec, started: false });
  }

  cancel(): void { this.active = false; }

  add(t: number, x: number, y: number): void {
    if (!this.active) return;
    const last = this.samples[this.samples.length - 1];
    if (last && last.t === t && last.x === x && last.y === y) return;
    if (!this.samples.length) { this.cx = x; this.cy = y; }
    this.samples.push({ t, x, y });
    if (this.samples.length > 600) this.samples.splice(0, 100);
    // Running centre for the visual throw.
    this.cx += (x - this.cx) * 0.15;
    this.cy += (y - this.cy) * 0.15;
    const span = 70;
    this.live.throwX = Math.max(-1, Math.min(1, (x - this.cx) / span));
    this.live.throwY = Math.max(-1, Math.min(1, (y - this.cy) / span));
    const p = shakeParams(this.generous);
    const revs = detectReversals(this.samples, p.minTravelPx, dominantAxis(this.samples));
    if (revs.length && this.firstRev < 0) { this.firstRev = revs[0]; this.live.started = true; }
    const inWindow = this.firstRev < 0 ? 0 : revs.filter((r) => r - this.firstRev <= p.windowSec * 1000).length;
    if (inWindow > this.lastCount) {
      this.lastCount = inWindow;
      this.live.reversals = inWindow;
      this.live.progress = Math.min(1, inWindow / p.perfectAt);
      this.onReversal?.(inWindow, this.live.progress);
    }
  }

  /** Keyboard shaking: alternating ←/→ (or A/D) presses count as reversals. */
  key(dir: -1 | 1, t: number): void {
    if (!this.active) return;
    if (dir === this.lastKey) return;
    this.lastKey = dir;
    const steps = 4;
    const from = this.keyX;
    this.keyX = dir * feel.shake.keyTravelPx;
    for (let i = 1; i <= steps; i++) this.add(t + i * 4, from + ((this.keyX - from) * i) / steps, 0);
  }

  update(now: number): void {
    if (!this.active) return;
    const p = shakeParams(this.generous);
    let end: number;
    if (this.firstRev < 0) end = this.beganAt + feel.shake.idleGraceSec * 1000;
    else end = this.firstRev + p.windowSec * 1000;
    this.live.remaining = Math.max(0, (end - now) / 1000);
    // Relax the throw toward centre when the pointer is still.
    this.live.throwX *= 0.92;
    this.live.throwY *= 0.92;
    if (now >= end) {
      this.active = false;
      const score = classifyShake(this.samples, p);
      this.onDone?.(score.quality, score.reversals);
    }
  }
}
