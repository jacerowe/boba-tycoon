// Tilted top-down follow camera (never first person). Frames the stage for portrait or
// landscape, zooms out as the shop grows, pushes in for the shake hero moment.
import * as THREE from 'three';
import { feel } from '../config/feel';
import { Trauma, ease } from './juice';

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly trauma = new Trauma();
  private target = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private dist = feel.camera.distance.cart;
  private distTarget = this.dist;
  private push = 0;
  private pushTarget = 0;
  private pushPoint = new THREE.Vector3();
  private aspect = 1;
  stageId = 'cart';
  focus = new THREE.Vector3();
  /** Optional override for cinematic moments (reveal). */
  override: { target: THREE.Vector3; dist: number; pitchDeg: number; k: number } | null = null;
  pitch = feel.camera.pitchDeg;
  private look = new THREE.Vector3();

  constructor() {
    this.camera = new THREE.PerspectiveCamera(feel.camera.fov, 1, 0.3, 260);
  }

  resize(w: number, h: number): void {
    this.aspect = w / Math.max(1, h);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.distTarget = this.fitDistance(this.stageId);
  }

  /** Distance that keeps the stage's frame width visible on the narrow axis. */
  fitDistance(stageId: string): number {
    const C = feel.camera;
    const base = C.distance[stageId] ?? C.distance.cart;
    const frameW = C.frameWidth[stageId] ?? C.frameWidth.cart;
    const frameD = C.frameDepth[stageId] ?? C.frameDepth.cart;
    const vfov = (C.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.aspect);
    // Portrait: fit the width. Landscape: fit the ground depth vertically.
    const fitW = frameW / 2 / Math.tan(hfov / 2);
    const pitch = (C.pitchDeg * Math.PI) / 180;
    const fitD = (frameD * Math.sin(pitch)) / 2 / Math.tan(vfov / 2);
    return this.aspect < 1 ? Math.max(base * 0.8, fitW * C.portraitDistanceBoost) : Math.max(base * 0.8, Math.min(fitD, fitW * C.landscapeWidthCap));
  }

  setStage(stageId: string, focus: { x: number; z: number }, instant = false): void {
    this.stageId = stageId;
    this.focus.set(focus.x, 0, focus.z);
    this.distTarget = this.fitDistance(stageId);
    if (instant) {
      this.dist = this.distTarget;
      this.target.copy(this.focus);
    }
  }

  /** Shake hero moment: push in toward a point. */
  pushIn(point: THREE.Vector3): void {
    this.pushPoint.copy(point);
    this.pushTarget = 1;
  }

  pushOut(): void { this.pushTarget = 0; }

  snapTo(p: { x: number; z: number }): void {
    this.target.set(p.x, 0, p.z);
    this.vel.set(0, 0, 0);
  }

  update(dt: number, player: { x: number; z: number; vx: number; vz: number }, reducedMotion: boolean): void {
    const C = feel.camera;
    this.trauma.scale = reducedMotion ? feel.juice.reducedMotionScale : 1;
    this.trauma.update(dt);
    // Follow: blend between stage focus and player, with a little look-ahead.
    const w = C.followWeight[this.stageId] ?? 0.5;
    const fz = this.focus.z + (this.aspect >= 1 ? (C.landscapeFocusZ[this.stageId] ?? 0) : 0);
    const tx = this.focus.x + (player.x + player.vx * C.lookAhead - this.focus.x) * w;
    let tz = fz + (player.z + player.vz * C.lookAhead - fz) * w;
    // Stop following once the bottom screen edge would pass the back of the lot.
    const back = C.backLimitZ[this.stageId];
    if (back !== undefined) {
      const vfov = (C.fov * Math.PI) / 180, p = (C.pitchDeg * Math.PI) / 180;
      const below = this.dist * (Math.cos(p) - Math.sin(p) / Math.tan(p + vfov / 2));
      tz = Math.min(tz, back - below);
    }
    const k = C.followStiffness, c = C.followDamping;
    this.vel.x += (-k * (this.target.x - tx) - c * this.vel.x) * dt;
    this.vel.z += (-k * (this.target.z - tz) - c * this.vel.z) * dt;
    this.target.x += this.vel.x * dt;
    this.target.z += this.vel.z * dt;
    // Zoom easing
    this.dist += (this.distTarget - this.dist) * (1 - Math.exp((-dt * 3) / C.stageZoomSec));
    // Push-in (shake)
    const pushRate = this.pushTarget > this.push ? dt / C.pushInSec : dt / C.pushOutSec;
    this.push = this.pushTarget > this.push ? Math.min(this.pushTarget, this.push + pushRate) : Math.max(this.pushTarget, this.push - pushRate);
    const pe = ease.outCubic(this.push);

    const look = this.look.copy(this.target).lerp(this.pushPoint, pe);
    let dist = this.dist * (1 - (1 - C.shakePushIn) * pe);
    let pitchDeg = C.pitchDeg - pe * 6;
    if (this.override) {
      const o = this.override;
      look.lerp(o.target, o.k);
      dist = dist + (o.dist - dist) * o.k;
      pitchDeg = pitchDeg + (o.pitchDeg - pitchDeg) * o.k;
    }
    this.pitch = pitchDeg;
    const pitch = (pitchDeg * Math.PI) / 180;
    const cam = this.camera;
    cam.position.set(look.x, look.y + Math.sin(pitch) * dist, look.z + Math.cos(pitch) * dist);
    cam.lookAt(look);
    // Trauma shake: offset + roll.
    const s = this.trauma.sample();
    cam.position.x += s.x;
    cam.position.y += s.y;
    cam.rotateZ(s.roll);
    cam.updateMatrixWorld();
  }

  get pushAmount(): number { return this.push; }
}
