// Juice toolkit: easing, tweens, damped springs, squash & stretch, trauma screen shake.
// Built first, reused everywhere.
import type * as THREE from 'three';
import { feel } from '../config/feel';

export const ease = {
  linear: (t: number) => t,
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  outExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outBack: (t: number) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};
export type EaseFn = (t: number) => number;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ---- Tweens ------------------------------------------------------------------
interface Tween {
  target: Record<string, number>;
  from: Record<string, number>;
  to: Record<string, number>;
  t: number;
  dur: number;
  ease: EaseFn;
  delay: number;
  onDone?: () => void;
  onUpdate?: (k: number) => void;
}

/** A pool of tweens advanced by one clock (world tweens pause in hit-stop, UI tweens don't). */
export class Tweener {
  private list: Tween[] = [];

  tween<T extends object>(target: T, props: Partial<Record<keyof T, number>>, dur: number, easeFn: EaseFn = ease.outQuad, opts: { delay?: number; onDone?: () => void; onUpdate?: (k: number) => void } = {}): void {
    const t = target as unknown as Record<string, number>;
    // Replace any running tween on the same props of the same target.
    this.list = this.list.filter((x) => x.target !== t || !Object.keys(props).some((k) => k in x.to));
    const from: Record<string, number> = {};
    for (const k of Object.keys(props)) from[k] = t[k];
    this.list.push({ target: t, from, to: props as Record<string, number>, t: 0, dur: Math.max(1e-4, dur), ease: easeFn, delay: opts.delay ?? 0, onDone: opts.onDone, onUpdate: opts.onUpdate });
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      if (tw.delay > 0) { tw.delay -= dt; if (tw.delay > 0) continue; }
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      const e = tw.ease(k);
      for (const key in tw.to) tw.target[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * e;
      tw.onUpdate?.(e);
      if (k >= 1) {
        this.list.splice(i, 1);
        tw.onDone?.();
      }
    }
  }

  clear(): void { this.list.length = 0; }
}

// ---- Springs -----------------------------------------------------------------
/** Critically-ish damped spring on a scalar. */
export class Spring {
  v = 0;
  constructor(public x = 0, public target = 0, public k = feel.juice.springStiffness, public c = feel.juice.springDamping) {}
  update(dt: number): number {
    // Semi-implicit Euler, sub-stepped for stability at low frame rates.
    const steps = dt > 1 / 60 ? Math.ceil(dt * 120) : 1;
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -this.k * (this.x - this.target) - this.c * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  kick(v: number): void { this.v += v; }
}

/**
 * Squash & stretch: a per-object spring on "squash" (0 = rest). Scale y by (1 - s), xz by (1 + s/2)
 * so volume roughly holds. `squash(obj)` punches it; the spring overshoots back.
 */
export class Squasher {
  private springs = new Map<object, { s: Spring; base: THREE.Vector3 | null }>();

  squash(key: object, amount = feel.juice.squashAmount, ms = feel.juice.squashMs): void {
    let e = this.springs.get(key);
    if (!e) { e = { s: new Spring(0, 0, 0, 0), base: null }; this.springs.set(key, e); }
    // Tune the spring so it settles around `ms` with a little overshoot.
    const w = (2 * Math.PI) / (ms / 1000) * 0.55;
    e.s.k = w * w;
    e.s.c = 2 * 0.35 * w;
    e.s.x = amount;
    e.s.v = 0;
  }

  /** Current squash value for a key (0 when at rest). */
  value(key: object): number {
    return this.springs.get(key)?.s.x ?? 0;
  }

  update(dt: number): void {
    for (const [k, e] of this.springs) {
      e.s.update(dt);
      if (Math.abs(e.s.x) < 1e-4 && Math.abs(e.s.v) < 1e-3) this.springs.delete(k);
    }
  }

  /** Apply to an Object3D's scale around a base scale. */
  apply(obj: THREE.Object3D, base = 1): void {
    const s = this.value(obj);
    obj.scale.set(base * (1 + s * 0.5), base * (1 - s), base * (1 + s * 0.5));
  }
}

// ---- Trauma screen shake -----------------------------------------------------
/** Smooth 1D value noise. */
function noise1(x: number, seed: number): number {
  const i = Math.floor(x), f = x - i;
  const h = (n: number) => {
    const s = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

export class Trauma {
  trauma = 0;
  private t = 0;
  scale = 1; // reduced motion multiplier

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number): void {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - feel.juice.traumaDecay * dt);
  }

  /** Offsets: x, y (world units) and roll (radians). shake = trauma². */
  sample(): { x: number; y: number; roll: number } {
    const s = this.trauma * this.trauma * this.scale;
    if (s <= 0) return { x: 0, y: 0, roll: 0 };
    const f = this.t * feel.juice.shakeNoiseHz;
    return {
      x: noise1(f, 1) * s * feel.juice.maxShakeOffset,
      y: noise1(f, 2) * s * feel.juice.maxShakeOffset,
      roll: noise1(f, 3) * s * (feel.juice.maxShakeRollDeg * Math.PI) / 180,
    };
  }
}
