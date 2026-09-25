// Recipe progress → cup look, and an animated DrinkVisual that eases between looks
// (pour fills from the bottom, milk swirls, pearls tumble in and bounce, lid slams on).
import * as THREE from 'three';
import { palette } from '../config/style';
import type { Registry } from '../data/registry';
import type { Quality } from '../data/types';
import { CUP, emptyLook, type CupLook, type ToppingInst } from './cups';
import { Rng } from '../sim/rng';
import { ease } from './juice';

const C = (hex: string) => new THREE.Color(hex);
const TEA = C(palette.tea), MILK = C(palette.milk), SYRUP = C(palette.strawberrySyrup);

function innerR(yFrac: number): number {
  return (CUP.RB + (CUP.RT - CUP.RB) * yFrac) * CUP.INNER;
}

function wallPoint(rng: Rng, yMin: number, yMax: number, size: number, inset = 0.25): { x: number; y: number; z: number } {
  const y = yMin + rng.next() * (yMax - yMin);
  const a = rng.next() * Math.PI * 2;
  const r = innerR(y / CUP.H) - size * inset;
  return { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
}

export interface LookInput {
  recipeId: string;
  /** Number of recipe steps completed (drink.next). */
  next: number;
  quality: Quality | null;
  sealed: boolean;
  seed: number;
}

/** Compute the finished look for a drink state. Deterministic per seed. */
export function computeLook(reg: Registry, d: LookInput, out: CupLook = emptyLook()): CupLook {
  const recipe = reg.recipe(d.recipeId);
  const done = recipe.steps.slice(0, d.next);
  out.fill = 0; out.bottomH = 0; out.soft = 0.03; out.foam = 0; out.swirl = 0; out.glow = 0;
  out.colTop.copy(TEA); out.colBottom.copy(TEA);
  out.toppings = [];
  out.sealed = d.sealed ? 1 : 0;
  out.straw = d.sealed ? 1 : 0;
  out.strawColor.set(palette.strawColors[recipe.straw % palette.strawColors.length]);
  out.lidColor.set(palette.lidFilm);
  let hasTea = false, hasBottom = false;
  for (let si = 0; si < done.length; si++) {
    const step = done[si];
    if (step === 'cup' || step === 'shake' || step === 'seal' || step === 'serve') continue;
    const ing = reg.ingredients.get(step);
    if (!ing) continue;
    const rng = new Rng(d.seed * 31 + si * 977);
    const v = ing.visual;
    switch (v.type) {
      case 'pour':
        hasTea = true;
        out.fill = Math.max(out.fill, v.fill);
        out.colTop.set(ing.color);
        if (!hasBottom) out.colBottom.set(ing.color).multiplyScalar(0.82);
        break;
      case 'mix':
        out.fill = Math.min(0.97, out.fill + v.fillAdd);
        out.colTop.lerp(MILK, v.mix);
        if (!hasBottom) out.colBottom.lerp(MILK, v.mix * 0.6);
        out.swirl = 1;
        break;
      case 'bottomLayer':
        hasBottom = true;
        out.bottomH = Math.max(out.bottomH, v.height);
        out.colBottom.set(ing.color);
        out.fill = Math.max(out.fill, out.fill + v.fillAdd * (hasTea ? 0.2 : 1));
        if (!hasTea) out.colTop.set(ing.color).lerp(MILK, 0.25);
        break;
      case 'spheres': {
        const n = v.count[0] + Math.floor(rng.next() * (v.count[1] - v.count[0] + 1));
        const col = C(ing.color);
        for (let i = 0; i < n; i++) {
          const low = ing.id === 'pearls';
          const p = low ? wallPoint(rng, v.size, v.size + 0.1, v.size) : wallPoint(rng, 0.1, 0.26, v.size);
          const tint = col.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.06);
          out.toppings.push({ kind: 'sphere', x: p.x, y: p.y, z: p.z, s: v.size, color: tint, rot: rng.next() * 6 });
        }
        if (v.syrup) {
          hasBottom = true;
          if (out.bottomH < v.syrup.height) { out.bottomH = v.syrup.height; out.colBottom.set(v.syrup.color); }
          else out.colBottom.lerp(SYRUP, 0.5);
        }
        break;
      }
      case 'cubes': {
        const n = v.count[0] + Math.floor(rng.next() * (v.count[1] - v.count[0] + 1));
        for (let i = 0; i < n; i++) {
          const p = wallPoint(rng, 0.14, Math.max(0.2, out.fill * CUP.H - 0.08), v.size, 0.3);
          out.toppings.push({ kind: 'cube', x: p.x, y: p.y, z: p.z, s: v.size, color: C(v.colors[i % v.colors.length]), rot: rng.next() * 6 });
        }
        break;
      }
      case 'ice': {
        out.fill = Math.min(0.97, out.fill + v.fillAdd);
        const n = v.count[0] + Math.floor(rng.next() * (v.count[1] - v.count[0] + 1));
        for (let i = 0; i < n; i++) {
          const top = Math.max(0.2, out.fill * CUP.H);
          const p = wallPoint(rng, top - 0.13, top - 0.03, 0.075, 0.45);
          out.toppings.push({ kind: 'cube', x: p.x * 0.8, y: p.y, z: p.z * 0.8, s: 0.075, color: C(palette.ice), rot: rng.next() * 6 });
        }
        break;
      }
    }
  }
  if (d.quality) {
    out.soft = 0.12;
    out.swirl *= 0.35;
    if (d.quality === 'great') out.foam = 0.13;
    if (d.quality === 'perfect') { out.foam = 0.16; out.glow = 1; }
  }
  if (d.sealed) {
    if (d.quality === 'perfect') out.lidColor.set('#ffd34f');
    else if (d.quality === 'great') out.lidColor.set('#ffe0ec');
  }
  return out;
}

interface ToppingAnim { t: ToppingInst; restY: number; delay: number; age: number; vy: number; landed: boolean }

/** An animated drink: eases the rendered look toward the target look. */
export class DrinkVisual {
  readonly look: CupLook = emptyLook();
  private target: CupLook = emptyLook();
  private fillFrom = 0;
  private fillT = 1;
  private fillDur = 0.3;
  private anims: ToppingAnim[] = [];
  private known = new Set<string>();
  private sealT = 1;
  private foamT = 1;
  /** Slosh spring (tilt) driven by the holder's acceleration. */
  private tx = 0; private tz = 0; private vtx = 0; private vtz = 0;
  pourActive = 0;
  onToppingLand: ((t: ToppingInst) => void) | null = null;

  constructor(private reg: Registry, public input: LookInput) {
    computeLook(reg, input, this.target);
    this.snap();
  }

  /** Jump straight to the target look (no animation). */
  snap(): void {
    const t = this.target, l = this.look;
    l.fill = t.fill; l.colTop.copy(t.colTop); l.colBottom.copy(t.colBottom); l.bottomH = t.bottomH; l.soft = t.soft;
    l.foam = t.foam; l.swirl = t.swirl; l.sealed = t.sealed; l.straw = t.straw; l.strawColor.copy(t.strawColor);
    l.lidColor.copy(t.lidColor); l.glow = t.glow;
    l.toppings = t.toppings.map((x) => ({ ...x, color: x.color.clone() }));
    this.anims = [];
    this.known = new Set(t.toppings.map(keyOf));
    this.fillT = 1;
  }

  /** Update inputs; animate toward the new look over `dur` seconds. */
  set(input: LookInput, dur = 0.35): void {
    const prevSealed = this.input.sealed;
    const prevQ = this.input.quality;
    this.input = { ...input };
    computeLook(this.reg, input, this.target);
    this.fillFrom = this.look.fill;
    this.fillT = 0;
    this.fillDur = Math.max(0.12, dur);
    // New toppings tumble in from above with a stagger.
    let k = 0;
    for (const t of this.target.toppings) {
      const key = keyOf(t);
      if (this.known.has(key)) continue;
      this.known.add(key);
      const inst = { ...t, color: t.color.clone(), y: CUP.H + 0.25 + k * 0.03 };
      this.look.toppings.push(inst);
      this.anims.push({ t: inst, restY: t.y, delay: k * Math.min(0.045, dur / 12), age: 0, vy: -1, landed: false });
      k++;
    }
    if (input.sealed && !prevSealed) this.sealT = 0;
    if (input.quality && !prevQ) this.foamT = 0;
  }

  /** Push slosh from holder acceleration (world xz, m/s²) — call every frame. */
  slosh(ax: number, az: number, dt: number): void {
    const k = 90, c = 7;
    this.vtx += (-k * this.tx - c * this.vtx - ax * 0.012) * dt;
    this.vtz += (-k * this.tz - c * this.vtz - az * 0.012) * dt;
    this.tx += this.vtx * dt;
    this.tz += this.vtz * dt;
    const lim = 0.14;
    this.tx = Math.max(-lim, Math.min(lim, this.tx));
    this.tz = Math.max(-lim, Math.min(lim, this.tz));
  }

  kickSlosh(x: number, z: number): void { this.vtx += x; this.vtz += z; }

  update(dt: number): void {
    const l = this.look, t = this.target;
    if (this.fillT < 1) {
      this.fillT = Math.min(1, this.fillT + dt / this.fillDur);
      l.fill = this.fillFrom + (t.fill - this.fillFrom) * ease.inOutQuad(this.fillT);
    } else l.fill = t.fill;
    const k = 1 - Math.exp(-dt * 7);
    l.colTop.lerp(t.colTop, k);
    l.colBottom.lerp(t.colBottom, k);
    l.bottomH += (t.bottomH - l.bottomH) * k;
    l.soft += (t.soft - l.soft) * k;
    l.swirl += (t.swirl - l.swirl) * (1 - Math.exp(-dt * 2.5));
    l.glow += (t.glow - l.glow) * k;
    l.strawColor.copy(t.strawColor);
    l.lidColor.lerp(t.lidColor, k);
    if (this.foamT < 1) {
      this.foamT = Math.min(1, this.foamT + dt / 0.35);
      l.foam = t.foam * ease.outBack(this.foamT);
    } else l.foam = t.foam;
    if (this.sealT < 1) {
      this.sealT = Math.min(1, this.sealT + dt / 0.22);
      l.sealed = t.sealed * ease.outBack(this.sealT);
      l.straw = this.sealT > 0.5 ? ease.outElastic((this.sealT - 0.5) * 2) : 0;
    } else { l.sealed = t.sealed; l.straw = t.straw; }
    l.tiltX = this.tx; l.tiltZ = this.tz;
    // Tumbling toppings: fall, bounce, settle.
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      if (a.delay > 0) { a.delay -= dt; continue; }
      a.age += dt;
      a.vy -= 9 * dt;
      a.t.y += a.vy * dt;
      a.t.rot += dt * 6;
      if (a.t.y <= a.restY) {
        a.t.y = a.restY;
        if (!a.landed) { a.landed = true; this.onToppingLand?.(a.t); }
        if (Math.abs(a.vy) < 0.35 || a.age > 0.9) { this.anims.splice(i, 1); continue; }
        a.vy = -a.vy * 0.38;
      }
    }
  }
}

function keyOf(t: ToppingInst): string {
  return `${t.kind}:${t.x.toFixed(4)}:${t.z.toFixed(4)}`;
}
