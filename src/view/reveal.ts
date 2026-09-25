// The Tiny Shop reveal (~7-8s, skippable after 2s): coins pour into the marker, floor tiles
// ripple out, walls rise with thunks and dust, the roof drops and the sign swings in, stations
// slide to their shop slots, then the camera pulls far back to show the street and eases in.
import * as THREE from 'three';
import { feel } from '../config/feel';
import { palette } from '../config/style';
import type { GameView } from './view';
import type { Sfx } from '../audio/sfx';
import { ease } from './juice';
import { SPRITE } from './textures';

export class Reveal {
  active = false;
  t = 0;
  private stationFrom = new Map<string, THREE.Vector3>();
  private stationTo = new Map<string, THREE.Vector3>();
  private beats = new Set<string>();
  private marker = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  onDone: (() => void) | null = null;
  onSwell: (() => void) | null = null;
  private readonly R = feel.reveal;

  constructor(private view: GameView, private sfx: Sfx) {}

  get total(): number {
    const R = this.R;
    return R.coinsPourSec + R.tilesSec + R.wallsSec + R.roofSec + R.stationsSec + R.pullBackSec + R.holdSec + R.easeInSec;
  }

  get canSkip(): boolean { return this.active && this.t >= this.R.skipAfterSec; }

  /** Call right after the sim switched stage (stations rebuilt in the sim, not yet in the view). */
  start(oldStations: Map<string, THREE.Vector3>, marker: THREE.Vector3): void {
    const v = this.view;
    this.active = true;
    this.t = 0;
    this.beats.clear();
    this.marker.copy(marker);
    this.stationFrom = oldStations;
    v.revealing = true;
    v.world.ghost.visible = false;
    v.world.bench.visible = false;
    v.world.shopProgress = { tiles: 0, walls: [0, 0, 0, 0], roof: 0, sign: 0, interior: 0 };
    v.world.shopBuilt = false;
    // New station views start at their old spots (or hidden if new).
    v.rebuildStations(false);
    this.stationTo.clear();
    for (const [id, sv] of v.stations) {
      this.stationTo.set(id, sv.root.position.clone());
      const from = oldStations.get(id);
      if (from) sv.root.position.copy(from);
      else sv.root.scale.setScalar(0.001);
    }
    v.rig.override = { target: new THREE.Vector3(0, 0, -0.5), dist: 26, pitchDeg: 56, k: 0 };
  }

  private once(key: string, fn: () => void): void {
    if (this.beats.has(key)) return;
    this.beats.add(key);
    fn();
  }

  skip(): void {
    if (!this.active) return;
    this.t = this.total;
    this.update(0);
  }

  update(dt: number): void {
    if (!this.active) return;
    this.t += dt;
    const v = this.view;
    const R = this.R;
    const w = v.world;
    const o = v.rig.override!;
    let t = this.t;
    // 1) Coins pour into the construction marker.
    const t1 = R.coinsPourSec;
    o.k = Math.min(1, t / 0.8);
    if (t < t1) {
      if (Math.random() < dt * 40) v.coins.pay(this.marker.clone().setY(0.4), v.player.root.position, Math.random, () => this.sfx.coin());
      return;
    }
    t -= t1;
    // 2) Floor tiles ripple outward from the cart.
    this.once('tiles', () => this.sfx.sparkle());
    w.shopProgress.tiles = Math.min(1, t / R.tilesSec);
    if (t < R.tilesSec) { w.applyShop(); return; }
    t -= R.tilesSec;
    // 3) Walls rise one by one, each with a thunk and dust.
    const per = R.wallsSec / 4;
    for (let i = 0; i < 4; i++) {
      const k = (t - i * per) / (per * 0.9);
      w.shopProgress.walls[i] = Math.max(0, Math.min(1, k));
      if (k > 0) this.once('wall' + i, () => {
        this.sfx.thunk();
        v.rig.trauma.add(0.18);
        const b = [[0, -7.4], [-7, -0.5], [7, -0.5], [0, 6.4]][i];
        v.particles.burst(18, { x: b[0], y: 0.3, z: b[1], life: 0.9, size: 0.5, sizeEnd: 1.0, color: palette.dust, sprite: SPRITE.puff, drag: 2.5 }, { speed: [2, 5], up: [0.3, 1.2], rand: Math.random });
      });
    }
    if (t < R.wallsSec) { w.applyShop(); return; }
    t -= R.wallsSec;
    // 4) Roof drops, bounces and settles; the sign swings into place.
    w.shopProgress.roof = Math.min(1, t / (R.roofSec * 0.7));
    w.shopProgress.sign = Math.min(1, Math.max(0, (t - R.roofSec * 0.3) / (R.roofSec * 0.7)));
    if (w.shopProgress.roof >= 0.7) this.once('roof', () => { this.sfx.thunk(); v.rig.trauma.add(0.3); });
    if (t < R.roofSec) { w.applyShop(); return; }
    t -= R.roofSec;
    // 5) Stations slide into their shop slots; counter, queue rope and seats appear.
    this.once('stations', () => this.sfx.fanfare());
    const ks = Math.min(1, t / R.stationsSec);
    const e = ease.outBack(ks);
    for (const [id, sv] of v.stations) {
      const to = this.stationTo.get(id)!;
      const from = this.stationFrom.get(id);
      if (from) sv.root.position.lerpVectors(from, to, e);
      else sv.root.scale.setScalar(Math.max(0.001, e));
    }
    w.shopProgress.interior = ks;
    if (t < R.stationsSec) { w.applyShop(); return; }
    t -= R.stationsSec;
    // 6) Pull far back and up to reveal the street: empty lots, pedestrians, FOR SALE.
    this.once('pull', () => { this.onSwell?.(); w.wiggleForSale(); });
    const kp = ease.inOutQuad(Math.min(1, t / R.pullBackSec));
    this.lookTarget.set(0, 0, -0.5).lerp(new THREE.Vector3(0, 0, -9), kp);
    o.target.copy(this.lookTarget);
    o.dist = 26 + (58 - 26) * kp;
    o.pitchDeg = 56 + (62 - 56) * kp;
    if (t < R.pullBackSec + R.holdSec) { w.applyShop(); return; }
    t -= R.pullBackSec + R.holdSec;
    // 7) Ease in to the new, wider shop zoom.
    o.k = 1 - ease.inOutQuad(Math.min(1, t / R.easeInSec));
    if (t < R.easeInSec) { w.applyShop(); return; }
    this.finish();
  }

  private finish(): void {
    const v = this.view;
    this.active = false;
    v.rig.override = null;
    v.revealing = false;
    v.world.setShopBuilt(true);
    for (const [id, sv] of v.stations) {
      const to = this.stationTo.get(id);
      if (to) sv.root.position.copy(to);
      sv.root.scale.setScalar(1);
    }
    this.onDone?.();
  }
}
