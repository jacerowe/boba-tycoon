import type { StageDef, StationSlot, Vec2 } from './types';

const v = (x: number, z: number): Vec2 => ({ x, z });

/** A station slot whose service point sits `reach` metres from the body toward `toward`. */
function slot(id: string, def: string, pos: Vec2, toward: Vec2, reach = 0.78, requires?: StationSlot['requires']): StationSlot {
  const dx = toward.x - pos.x, dz = toward.z - pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const service = { x: +(pos.x + (dx / len) * reach).toFixed(3), z: +(pos.z + (dz / len) * reach).toFixed(3) };
  const rot = Math.atan2(dx, dz);
  return requires ? { id, def, pos, service, rot, requires } : { id, def, pos, service, rot };
}

/** Place a station on an ellipse around the work area. Angle in degrees: -90 = top (street side). */
function ring(center: Vec2, rx: number, rz: number, deg: number): Vec2 {
  const a = (deg * Math.PI) / 180;
  return v(+(center.x + rx * Math.cos(a)).toFixed(3), +(center.z + rz * Math.sin(a)).toFixed(3));
}

// ---------------------------------------------------------------------------
// Stage 1: Boba Cart. A tiny ring of stations on the sidewalk; you walk the loop
// cup → tea → milk → pearls → shaker → sealer → counter.
// ---------------------------------------------------------------------------
const cartCenter = v(0, 0.75);
const cart: StageDef = {
  id: 'cart',
  name: 'Boba Cart',
  order: 1,
  bounds: { minX: -4.4, maxX: 4.4, minZ: -1.7, maxZ: 5.1 },
  focus: v(0, 0.2),
  stations: [
    slot('counter', 'counter', v(0, -2.2), v(0, 0), 0.9),
    slot('cup', 'cup', v(-2.35, -1.5), cartCenter),
    slot('tea', 'tea', v(-3.1, 0.4), cartCenter),
    slot('milk', 'milk', v(-2.45, 2.3), cartCenter),
    slot('pearls', 'pearls', v(-0.85, 3.0), cartCenter),
    slot('popping', 'popping', v(0.9, 3.0), cartCenter, 0.78, { ingredient: 'popping' }),
    slot('shaker', 'shaker', v(2.45, 2.3), cartCenter),
    slot('sealer', 'sealer', v(3.1, 0.4), cartCenter),
    slot('bin', 'bin', v(2.35, -1.5), cartCenter, 0.72),
    slot('menu', 'menuBoard', v(-4.25, 1.45), v(0, 1.45), 0.6, { beat: 'secondTopping' }),
  ],
  queueSpots: [v(0, -3.7), v(-0.95, -4.05), v(-1.9, -4.4), v(-2.85, -4.75), v(-3.8, -5.1), v(-4.75, -5.45), v(-5.7, -5.8)],
  benchSpots: [1, 2, 3],
  sipSeats: [],
  spawnPoints: [v(-16, -7.7), v(16, -7.7)],
  entry: v(-4.4, -7.0),
  padSlots: [v(-2.55, 4.3), v(2.55, 4.3), v(-3.8, -0.7), v(3.8, -0.7)],
  goalPadSlot: v(0, 4.55),
  crowdSpots: [v(-6.6, -7.4), v(-5.6, -7.8), v(-7.6, -7.9), v(-4.8, -7.5), v(-7.1, -8.7), v(-6.1, -8.8), v(-8.4, -7.4)],
  comboTable: 'cart',
  next: 'tinyShop',
  buildHook: 'none',
};

// ---------------------------------------------------------------------------
// Stage 2: Tiny Boba Shop. Walls, a door, a long counter, a queue rope and seats.
// Stations slide into a bigger ring; ice arrives, and room for a second tea machine.
// ---------------------------------------------------------------------------
const sc = v(0, 2.0);
const R = (deg: number) => ring(sc, 4.4, 3.2, deg);
const tinyShop: StageDef = {
  id: 'tinyShop',
  name: 'Tiny Boba Shop',
  order: 2,
  bounds: { minX: -6.4, maxX: 6.4, minZ: -1.75, maxZ: 5.95 },
  focus: v(0, -1.2),
  stations: [
    slot('counter', 'shopCounter', v(0, -2.35), v(0, 0), 0.8),
    slot('cup', 'cup', R(-128), sc),
    slot('tea', 'tea', R(-158), sc),
    slot('tea2', 'tea', R(174), sc, 0.78, { upgrade: 'secondTea' }),
    slot('taro', 'taro', R(148), sc, 0.78, { ingredient: 'taro' }),
    slot('ice', 'ice', R(124), sc),
    slot('milk', 'milk', R(104), sc),
    slot('pearls', 'pearls', R(84), sc),
    slot('popping', 'popping', R(63), sc, 0.78, { ingredient: 'popping' }),
    slot('jelly', 'jelly', R(40), sc, 0.78, { ingredient: 'jelly' }),
    slot('shaker', 'shaker', R(14), sc),
    slot('sealer', 'sealer', R(-16), sc),
    slot('bin', 'bin', R(-52), sc, 0.72),
    slot('menu', 'menuBoard', v(-5.9, -1.0), v(0, -1.0), 0.6),
  ],
  queueSpots: [v(0, -3.25), v(-1.0, -3.45), v(-2.0, -3.65), v(-3.0, -3.85), v(-4.0, -4.05), v(-5.0, -4.3), v(-5.5, -5.2), v(-5.5, -6.1)],
  benchSpots: [2, 3, 4, 5],
  sipSeats: [v(2.3, -4.25), v(3.5, -4.25), v(4.7, -4.25), v(2.3, -5.95), v(3.5, -5.95), v(4.7, -5.95)],
  spawnPoints: [v(-19, -9.3), v(19, -9.3)],
  entry: v(0, -7.9),
  padSlots: [v(-5.8, 0.4), v(5.8, 0.4), v(-5.75, 2.9), v(5.75, 2.9), v(-5.2, 5.25), v(5.2, 5.25)],
  goalPadSlot: v(0, 6.5),
  crowdSpots: [v(-1.5, -8.7), v(1.5, -8.7), v(0, -9.4), v(-2.6, -9.1), v(2.6, -9.1), v(-1.1, -10.0), v(1.1, -10.0)],
  comboTable: 'tinyShop',
  buildHook: 'revealTinyShop',
};

export const STAGES: StageDef[] = [cart, tinyShop];
