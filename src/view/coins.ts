// Physical coins: burst out of a happy customer, bounce, then magnetize to the player.
import * as THREE from 'three';
import { palette } from '../config/style';
import { feel } from '../config/feel';
import { toon, outline } from './materials';
import { cylinder } from './geometry';

interface Coin {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  t: number; phase: 0 | 1; mx: number; my: number; mz: number; spin: number; spinV: number;
  onLand: (() => void) | null;
  flight: number;
}

export class Coins {
  readonly mesh: THREE.InstancedMesh;
  readonly outlineMesh: THREE.InstancedMesh;
  private coins: Coin[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  /** Where coins fly to (player chest), updated by the view each frame. */
  readonly target = new THREE.Vector3();

  constructor(private max = feel.particles.coinsMax) {
    const geo = cylinder(0.11, 0.11, 0.035, 14);
    geo.rotateX(Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, toon(palette.coin), max);
    this.outlineMesh = new THREE.InstancedMesh(geo, outline(0.018), max);
    this.mesh.count = 0;
    this.outlineMesh.count = 0;
    this.mesh.frustumCulled = false;
    this.outlineMesh.frustumCulled = false;
  }

  get count(): number { return this.coins.length; }

  burst(from: THREE.Vector3, n: number, rand: () => number, onLand: (i: number) => void): void {
    for (let i = 0; i < n && this.coins.length < this.max; i++) {
      const a = rand() * Math.PI * 2, sp = 1.2 + rand() * 1.8;
      this.coins.push({
        x: from.x, y: from.y, z: from.z,
        vx: Math.cos(a) * sp, vy: 3.2 + rand() * 2.2, vz: Math.sin(a) * sp,
        t: -i * 0.025, phase: 0, mx: 0, my: 0, mz: 0, spin: rand() * 6, spinV: 8 + rand() * 10,
        onLand: () => onLand(i), flight: feel.customers.coinFlightSec * (0.8 + rand() * 0.4),
      });
    }
  }

  /** Coins that fly *from* the player into a target point (paying into a pad). */
  pay(to: THREE.Vector3, from: THREE.Vector3, rand: () => number, onLand?: () => void): void {
    if (this.coins.length >= this.max) return;
    // flight = -1 marks a fixed-target arc: start stored in v*, end in m*.
    const jitter = (rand() - 0.5) * 0.3;
    this.coins.push({
      x: from.x, y: from.y + 0.9, z: from.z, vx: from.x + jitter, vy: from.y + 0.9, vz: from.z,
      t: 0, phase: 1, mx: to.x, my: to.y + 0.05, mz: to.z, spin: 0, spinV: 14, onLand: onLand ?? null, flight: -1,
    });
  }

  update(dt: number): void {
    const mag = feel.customers.coinMagnetSec;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.t += dt;
      c.spin += c.spinV * dt;
      if (c.flight === -1) {
        // pay: arc from (vx,vy,vz) to (mx,my,mz) over 0.28s
        const k = Math.min(1, c.t / 0.28);
        c.x = c.vx + (c.mx - c.vx) * k;
        c.z = c.vz + (c.mz - c.vz) * k;
        c.y = c.vy + (c.my - c.vy) * k + Math.sin(k * Math.PI) * 0.9;
        if (k >= 1) { c.onLand?.(); this.coins.splice(i, 1); }
        continue;
      }
      if (c.t < 0) continue;
      if (c.phase === 0) {
        c.vy -= 16 * dt;
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        if (c.y < 0.06) { c.y = 0.06; c.vy = Math.abs(c.vy) * 0.42; c.vx *= 0.7; c.vz *= 0.7; }
        if (c.t >= c.flight) { c.phase = 1; c.t = 0; c.mx = c.x; c.my = c.y; c.mz = c.z; }
      } else {
        const k = Math.min(1, c.t / mag);
        const e = k * k * k;
        const tx = this.target.x, ty = this.target.y, tz = this.target.z;
        c.x = c.mx + (tx - c.mx) * e;
        c.y = c.my + (ty - c.my) * e + Math.sin(k * Math.PI) * 0.6;
        c.z = c.mz + (tz - c.mz) * e;
        if (k >= 1) { c.onLand?.(); this.coins.splice(i, 1); }
      }
    }
    const n = this.coins.length;
    for (let i = 0; i < n; i++) {
      const c = this.coins[i];
      this.e.set(0.3, c.spin, 0);
      this.q.setFromEuler(this.e);
      this.v.set(c.x, c.y, c.z);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.outlineMesh.setMatrixAt(i, this.m);
    }
    this.mesh.count = n;
    this.outlineMesh.count = n;
    if (n) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.outlineMesh.instanceMatrix.needsUpdate = true;
    }
  }
}
