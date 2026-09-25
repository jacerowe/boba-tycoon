// Tiny navigation: straight lines with detours around circular obstacles.
import type { Vec2 } from '../data/types';

export interface Circle { x: number; z: number; r: number; id?: string }

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Closest point on segment ab to p, as parameter t in [0,1]. */
function segT(a: Vec2, b: Vec2, p: Vec2): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-9) return 0;
  return Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
}

export function segmentHitsCircle(a: Vec2, b: Vec2, c: Circle): boolean {
  const t = segT(a, b, c);
  const px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
  return Math.hypot(px - c.x, pz - c.z) < c.r;
}

function inside(p: Vec2, c: Circle): boolean {
  return Math.hypot(p.x - c.x, p.z - c.z) < c.r;
}

/**
 * Plan waypoints from `from` to `to` around obstacles. Obstacles containing either
 * endpoint are ignored (you can always leave a circle you're in, or approach one you target).
 */
export function planPath(from: Vec2, to: Vec2, obstacles: readonly Circle[], maxDetours = 6): Vec2[] {
  const pts: Vec2[] = [from, to];
  const active = obstacles.filter((c) => !inside(from, c) && !inside(to, c));
  let guard = 0;
  for (let i = 0; i < pts.length - 1 && guard < maxDetours; i++) {
    const a = pts[i], b = pts[i + 1];
    // First blocking obstacle along a→b.
    let best: Circle | null = null;
    let bestT = Infinity;
    for (const c of active) {
      if (!segmentHitsCircle(a, b, c)) continue;
      const t = segT(a, b, c);
      if (t < bestT) { bestT = t; best = c; }
    }
    if (!best) continue;
    // Detour around the side nearest the segment's closest point.
    const px = a.x + (b.x - a.x) * bestT, pz = a.z + (b.z - a.z) * bestT;
    let nx = px - best.x, nz = pz - best.z;
    let nl = Math.hypot(nx, nz);
    if (nl < 1e-4) { nx = -(b.z - a.z); nz = b.x - a.x; nl = Math.hypot(nx, nz) || 1; }
    const push = best.r * 1.12 + 0.08;
    const detour = { x: best.x + (nx / nl) * push, z: best.z + (nz / nl) * push };
    // If the detour lands inside another obstacle, push it out once more.
    for (const c of active) {
      if (c === best || !inside(detour, c)) continue;
      const dx = detour.x - c.x, dz = detour.z - c.z, dl = Math.hypot(dx, dz) || 1;
      detour.x = c.x + (dx / dl) * (c.r + 0.05);
      detour.z = c.z + (dz / dl) * (c.r + 0.05);
    }
    pts.splice(i + 1, 0, detour);
    guard++;
    i--; // re-check a→detour
  }
  return pts.slice(1);
}

/** Push a point out of circles and clamp to bounds. */
export function resolveCollisions(p: Vec2, radius: number, obstacles: readonly Circle[], bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): void {
  for (let iter = 0; iter < 2; iter++) {
    for (const c of obstacles) {
      const rr = c.r + radius;
      const dx = p.x - c.x, dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < rr) {
        if (d < 1e-5) { p.x += rr; continue; }
        p.x = c.x + (dx / d) * rr;
        p.z = c.z + (dz / d) * rr;
      }
    }
  }
  p.x = Math.max(bounds.minX + radius, Math.min(bounds.maxX - radius, p.x));
  p.z = Math.max(bounds.minZ + radius, Math.min(bounds.maxZ - radius, p.z));
}
