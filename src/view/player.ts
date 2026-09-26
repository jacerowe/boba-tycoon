// The player: chunky, big-headed, waddle-hops, leans into turns, plants at stations,
// and carries a wobbling spring-linked tower of cups.
import * as THREE from 'three';
import { palette } from '../config/style';
import { feel } from '../config/feel';
import { capsule, sphere, roundedBox, cylinder, outlined, MeshBuilder } from './geometry';
import { toon, outline, blobShadowMaterial } from './materials';
import { playerFaceAtlas, PLAYER_FACE, FACE_COLS, FACE_ROWS, SPRITE } from './textures';
import { Spring, lerpAngle, clamp } from './juice';
import type { Particles } from './particles';
import { CUP } from './cups';

export interface PlayerPose {
  x: number; z: number; vx: number; vz: number; facing: number;
  working: boolean;
  shaking: boolean;
  sealing: boolean;
}

function facePatch(r: number): THREE.BufferGeometry {
  const span = 1.5;
  const g = new THREE.SphereGeometry(r, 16, 12, Math.PI / 2 - span / 2, span, Math.PI * 0.28, Math.PI * 0.5);
  return g;
}

export class PlayerView {
  readonly root = new THREE.Group();
  private lean = new THREE.Group();
  private bodyG = new THREE.Group();
  private head: THREE.Group;
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private footL: THREE.Mesh;
  private footR: THREE.Mesh;
  private tray: THREE.Mesh;
  private shadow: THREE.Mesh;
  private faceTex: THREE.Texture;
  private walkPhase = 0;
  private dustAcc = 0;
  private squash = new Spring(0, 0, 380, 13);
  private leanRoll = 0;
  private leanPitch = 0;
  private prevFacing = 0;
  private prevVx = 0;
  private prevVz = 0;
  accX = 0;
  accZ = 0;
  private wasWorking = false;
  private faceOverride: number | null = null;
  private faceOverrideT = 0;
  private blinkT = 2;
  /** Shake visual offset (m) from the input tracker, in the player's local frame. */
  shakeOffset = new THREE.Vector2();
  // Stack wobble: per-segment lean spring (x, z).
  private lx: number[] = [];
  private lz: number[] = [];
  private vlx: number[] = [];
  private vlz: number[] = [];
  private stackSquash = new Spring(0, 0, 300, 12);
  readonly handMatrix = new THREE.Matrix4();
  readonly stackMatrices: THREE.Matrix4[] = [];
  trayVisible = false;
  sweat = false;
  private sweatT = 0;
  speedLines = false;
  private lineT = 0;

  constructor(private particles: Particles) {
    const skin = palette.playerSkin;
    // Body
    const b = new MeshBuilder();
    b.add(capsule(0.3, 0.3, 8, 18), palette.playerShirt, [0, 0.55, 0]);
    b.add(roundedBox(0.44, 0.46, 0.1, 0.06), palette.playerApron, [0, 0.46, 0.26], [-0.12, 0, 0]);
    b.add(roundedBox(0.2, 0.1, 0.04, 0.03), '#ffffff', [0, 0.52, 0.32], [-0.12, 0, 0]);
    b.add(cylinder(0.31, 0.3, 0.14, 18), palette.playerPants, [0, 0.26, 0]);
    const body = b.mesh(0.032);
    this.bodyG.add(body);
    // Head
    this.head = new THREE.Group();
    this.head.position.set(0, 1.08, 0);
    const skull = outlined(sphere(0.35, 22, 16), skin, 0.032);
    this.head.add(skull);
    const hb = new MeshBuilder();
    // A little visor cap: a dome on the crown, a brim over the eyes, a boba button on top.
    const dome = new THREE.SphereGeometry(0.33, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.42);
    hb.add(dome, palette.playerCap, [0, 0.1, -0.02], [-0.25, 0, 0]);
    hb.add(cylinder(0.2, 0.21, 0.03, 18), palette.playerCap, [0, 0.24, 0.24], [0.42, 0, 0], [1, 1, 0.75]);
    hb.add(sphere(0.06, 8, 6), '#ffffff', [0, 0.42, -0.08]);
    hb.add(sphere(0.06, 10, 8), palette.cartTrim, [0.0, 0.33, 0.18], [0, 0, 0], [1, 1, 0.45]);
    const cap = hb.mesh(0.028);
    this.head.add(cap);
    // ears
    const earL = outlined(sphere(0.08, 10, 8), skin, 0.02);
    earL.position.set(-0.34, -0.02, 0);
    const earR = earL.clone();
    earR.position.x = 0.34;
    this.head.add(earL, earR);
    // face
    this.faceTex = playerFaceAtlas().clone();
    this.faceTex.needsUpdate = true;
    this.faceTex.repeat.set(1 / FACE_COLS, 1 / FACE_ROWS);
    const face = new THREE.Mesh(facePatch(0.352), new THREE.MeshBasicMaterial({ map: this.faceTex, transparent: true, alphaTest: 0.3, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.head.add(face);
    this.bodyG.add(this.head);
    // Arms (reach forward to hold cups)
    const armGeo = capsule(0.085, 0.24, 4, 10);
    this.armL = outlined(armGeo, palette.playerShirt, 0.024);
    this.armR = outlined(armGeo, palette.playerShirt, 0.024);
    this.armL.position.set(-0.33, 0.66, 0.05);
    this.armR.position.set(0.33, 0.66, 0.05);
    this.bodyG.add(this.armL, this.armR);
    // Feet
    const footGeo = sphere(0.11, 12, 8);
    footGeo.scale(1, 0.6, 1.35);
    this.footL = outlined(footGeo, palette.playerPants, 0.022);
    this.footR = outlined(footGeo, palette.playerPants, 0.022);
    this.footL.position.set(-0.14, 0.07, 0.03);
    this.footR.position.set(0.14, 0.07, 0.03);
    // Tray
    this.tray = outlined(cylinder(0.34, 0.3, 0.05, 20), palette.cartTrim, 0.022);
    this.tray.position.set(0, 0.74, 0.42);
    this.tray.visible = false;
    this.bodyG.add(this.tray);

    this.lean.add(this.bodyG, this.footL, this.footR);
    this.root.add(this.lean);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2), blobShadowMaterial());
    this.shadow.position.y = 0.012;
    this.shadow.renderOrder = 1;
    this.root.add(this.shadow);
    this.setFace(PLAYER_FACE.happy);
  }

  private setFace(i: number): void {
    const col = i % FACE_COLS, row = Math.floor(i / FACE_COLS);
    this.faceTex.offset.set(col / FACE_COLS, 1 - (row + 1) / FACE_ROWS);
  }

  flashFace(i: number, sec: number): void {
    this.faceOverride = i;
    this.faceOverrideT = sec;
  }

  plant(amount = feel.move.plantSquash): void {
    this.squash.x = amount;
    this.squash.v = 0;
  }

  bounce(amount = -0.12): void {
    this.squash.x = amount;
    this.squash.v = 0;
  }

  stackBump(): void {
    this.stackSquash.x = 0.25;
    this.stackSquash.v = 0;
  }

  update(dt: number, pose: PlayerPose, stackCount: number, rand: () => number, reducedMotion: boolean): void {
    const speed = Math.hypot(pose.vx, pose.vz);
    this.root.position.set(pose.x, 0, pose.z);
    // Facing (smooth) and turn rate for lean.
    const prev = this.prevFacing;
    this.root.rotation.y = lerpAngle(this.root.rotation.y, pose.facing, Math.min(1, dt * 20));
    let dF = pose.facing - prev;
    while (dF > Math.PI) dF -= Math.PI * 2;
    while (dF < -Math.PI) dF += Math.PI * 2;
    const turnRate = dt > 0 ? dF / dt : 0;
    this.prevFacing = pose.facing;
    // Acceleration (for the stack and slosh)
    if (dt > 0) {
      const ax = (pose.vx - this.prevVx) / dt, az = (pose.vz - this.prevVz) / dt;
      this.accX += (ax - this.accX) * Math.min(1, dt * 20);
      this.accZ += (az - this.accZ) * Math.min(1, dt * 20);
    }
    this.prevVx = pose.vx; this.prevVz = pose.vz;

    const M = feel.move;
    const rollT = clamp(-turnRate * M.leanPerTurn * Math.min(1, speed / 2), -M.leanMax, M.leanMax);
    const pitchT = clamp(speed / M.speed, 0, 1.3) * M.forwardLean;
    this.leanRoll += (rollT - this.leanRoll) * Math.min(1, dt * 12);
    this.leanPitch += (pitchT - this.leanPitch) * Math.min(1, dt * 12);
    this.lean.rotation.set(this.leanPitch, 0, this.leanRoll);

    // Waddle-hop
    let hop = 0;
    if (speed > 0.25 && !pose.working) {
      const prevPhase = this.walkPhase;
      this.walkPhase += speed * dt * M.hopPerMeter * Math.PI;
      hop = Math.abs(Math.sin(this.walkPhase)) * M.hopHeight * Math.min(1, speed / 2);
      if (Math.floor(prevPhase / Math.PI) !== Math.floor(this.walkPhase / Math.PI)) {
        this.squash.x = Math.max(this.squash.x, 0.07);
      }
      this.dustAcc += speed * dt;
      if (this.dustAcc > M.dustEvery) {
        this.dustAcc = 0;
        this.particles.spawn({ x: pose.x + (rand() - 0.5) * 0.2, y: 0.08, z: pose.z + (rand() - 0.5) * 0.2, vy: 0.4, vx: -pose.vx * 0.1, vz: -pose.vz * 0.1, life: 0.5, size: 0.2, sizeEnd: 0.42, color: palette.dust, alpha: 0.8, sprite: SPRITE.puff });
      }
    } else {
      this.walkPhase = 0;
    }
    // Plant squash when a station task begins.
    if (pose.working && !this.wasWorking) this.plant();
    this.wasWorking = pose.working;

    this.squash.update(dt);
    const sq = this.squash.x;
    // Breathing when idle
    const breathe = speed < 0.2 ? Math.sin(performance.now() / 420) * 0.012 : 0;
    this.bodyG.position.y = hop;
    this.bodyG.scale.set(1 + sq * 0.5 + breathe, 1 - sq + breathe * -1, 1 + sq * 0.5 + breathe);
    const step = Math.sin(this.walkPhase);
    this.footL.position.z = 0.03 + (speed > 0.25 ? step * 0.14 : 0);
    this.footR.position.z = 0.03 - (speed > 0.25 ? step * 0.14 : 0);
    this.footL.position.y = 0.07 + Math.max(0, step) * 0.05 * (speed > 0.25 ? 1 : 0);
    this.footR.position.y = 0.07 + Math.max(0, -step) * 0.05 * (speed > 0.25 ? 1 : 0);

    // Arms: forward when holding something, swinging when walking empty-handed.
    const holding = stackCount > 0 || pose.working;
    const armFwd = pose.shaking ? -2.3 - this.shakeOffset.y * 1.5 : holding ? -1.25 : Math.sin(this.walkPhase) * 0.5 * Math.min(1, speed / 2);
    this.armL.rotation.x = holding ? armFwd : armFwd;
    this.armR.rotation.x = holding ? armFwd : -armFwd;
    this.armL.rotation.z = holding ? -0.25 : 0.1;
    this.armR.rotation.z = holding ? 0.25 : -0.1;
    this.armL.position.z = holding ? 0.2 : 0.05;
    this.armR.position.z = holding ? 0.2 : 0.05;

    // Shadow shrinks as you hop.
    this.shadow.scale.setScalar(1 - hop * 1.5);

    // Face
    this.blinkT -= dt;
    let face: number = PLAYER_FACE.happy;
    if (pose.shaking) face = PLAYER_FACE.focus;
    else if (stackCount >= 8 && this.sweat) face = PLAYER_FACE.sweat;
    if (this.blinkT < 0) { face = PLAYER_FACE.blink; if (this.blinkT < -0.12) this.blinkT = 2 + rand() * 3; }
    if (this.faceOverride !== null) {
      face = this.faceOverride;
      this.faceOverrideT -= dt;
      if (this.faceOverrideT <= 0) this.faceOverride = null;
    }
    this.setFace(face);

    // Tray + stack wobble
    this.tray.visible = this.trayVisible && stackCount > 0;
    this.updateStack(dt, stackCount, reducedMotion);

    this.heroT += ((pose.shaking ? 1 : 0) - this.heroT) * Math.min(1, dt * (pose.shaking ? 14 : 8));
    // Shake: the whole upper body jiggles with the throw.
    if (pose.shaking) {
      this.bodyG.rotation.z = this.shakeOffset.x * 0.6;
      this.bodyG.position.x = this.shakeOffset.x * 0.25;
    } else {
      this.bodyG.rotation.z *= 0.8;
      this.bodyG.position.x *= 0.8;
    }
    // Sweat drop during big rush stacks
    if (this.sweat && stackCount >= feel.stack.sweatAt) {
      this.sweatT -= dt;
      if (this.sweatT <= 0) {
        this.sweatT = 0.5;
        const p = this.root.position;
        this.particles.spawn({ x: p.x + 0.3, y: 1.45, z: p.z + 0.1, vy: 0.2, vx: 0.3, life: 0.7, size: 0.16, color: '#7fc8ff', sprite: SPRITE.sweat, gravity: 3 });
      }
    }
    if (this.speedLines && speed > M.speedLinesMin && !reducedMotion) {
      this.lineT -= dt;
      if (this.lineT <= 0) {
        this.lineT = 0.04;
        const p = this.root.position;
        const a = Math.atan2(pose.vz, pose.vx);
        const side = (rand() - 0.5) * 1.0;
        this.particles.spawn({ x: p.x - Math.cos(a) * 0.5 - Math.sin(a) * side, y: 0.4 + rand() * 0.9, z: p.z - Math.sin(a) * 0.5 + Math.cos(a) * side, vx: -pose.vx * 0.3, vz: -pose.vz * 0.3, life: 0.25, size: 0.35, color: '#ffffff', alpha: 0.8, sprite: SPRITE.streak, stretch: 3, rot: 0 });
      }
    }
    this.root.updateMatrixWorld(true);
    this.computeCupMatrices(stackCount, pose);
  }

  private updateStack(dt: number, cups: number, reducedMotion: boolean): void {
    const n = Math.ceil(cups / feel.stack.perLayer);
    while (this.lx.length < n) { this.lx.push(0); this.lz.push(0); this.vlx.push(0); this.vlz.push(0); }
    const S = feel.stack;
    // Acceleration in the player's local frame (x right, z forward).
    const yaw = this.root.rotation.y;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const axL = c * this.accX - s * this.accZ;
    const azL = s * this.accX + c * this.accZ;
    const k = reducedMotion ? 0.4 : 1;
    for (let i = 0; i < n; i++) {
      const w = Math.pow(i + 1, 0.55);
      const tx = clamp(-axL * S.accelInfluence * w * k, -S.maxLean, S.maxLean);
      const tz = clamp(-azL * S.accelInfluence * w * k, -S.maxLean, S.maxLean);
      // Idle sway so it always looks barely stable.
      const sway = Math.sin(performance.now() / 380 + i * 0.9) * 0.012 * (i / 3) * k;
      this.vlx[i] += (-S.stiffness * (this.lx[i] - tx - sway) - S.damping * this.vlx[i]) * dt;
      this.vlz[i] += (-S.stiffness * (this.lz[i] - tz) - S.damping * this.vlz[i]) * dt;
      this.lx[i] += this.vlx[i] * dt;
      this.lz[i] += this.vlz[i] * dt;
    }
    this.stackSquash.update(dt);
  }

  kickStack(v: number): void {
    for (let i = 0; i < this.vlx.length; i++) this.vlx[i] += v * (0.5 + i * 0.2);
  }

  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpE = new THREE.Euler();
  private tmpV = new THREE.Vector3();
  private tmpS = new THREE.Vector3();

  private computeCupMatrices(n: number, pose: PlayerPose): void {
    const S = feel.stack;
    const bodyM = this.bodyG.matrixWorld;
    // Hand cup: in front of the chest, off to the side when a tray is also carried.
    const hx = n > 0 ? 0.42 : 0;
    const shake = pose.shaking ? this.shakeOffset : null;
    this.tmpE.set(shake ? shake.y * 1.2 : 0, 0, shake ? -shake.x * 1.6 : 0);
    this.tmpQ.setFromEuler(this.tmpE);
    // Shake hero moment: the cup is lifted high, toward the camera, and scaled up.
    const hero = this.heroT;
    this.tmpV.set(hx * (1 - hero) + (shake ? shake.x : 0), 0.46 + hero * 0.78 + (shake ? shake.y * 0.5 : 0), 0.42 - hero * 0.1);
    this.tmpS.setScalar(1 + hero * 0.6);
    this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS);
    this.handMatrix.multiplyMatrices(bodyM, this.tmpM);
    // The tower: two cups per layer on the tray, each layer leaning a little more.
    while (this.stackMatrices.length < n) this.stackMatrices.push(new THREE.Matrix4());
    const per = S.perLayer;
    const layers = Math.ceil(n / per);
    const k = S.cupScale;
    let x = n > 0 && this.heldVisible ? -0.1 : 0, y = this.trayVisible ? 0.77 : 0.46, z = 0.4;
    let ax = 0, az = 0;
    const sq = this.stackSquash.x;
    for (let L = 0; L < layers; L++) {
      ax = Math.max(-S.maxTotalLean, Math.min(S.maxTotalLean, ax + (this.lx[L] ?? 0)));
      az = Math.max(-S.maxTotalLean, Math.min(S.maxTotalLean, az + (this.lz[L] ?? 0)));
      this.tmpE.set(az, 0, -ax);
      this.tmpQ.setFromEuler(this.tmpE);
      const inLayer = Math.min(per, n - L * per);
      for (let j = 0; j < inLayer; j++) {
        const i = L * per + j;
        const off = inLayer > 1 ? (j - (inLayer - 1) / 2) * S.layerGap : 0;
        this.tmpV.set(off, 0, 0).applyQuaternion(this.tmpQ).add(this.tmpV2.set(x, y, z));
        this.tmpS.set(k * (1 + sq * 0.3), k * (1 - sq * 0.4), k * (1 + sq * 0.3));
        this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS);
        this.stackMatrices[i].multiplyMatrices(bodyM, this.tmpM);
      }
      // Next layer sits on top of this one along its tilted axis.
      const h = (CUP.H * k + 0.035) * (1 - sq * 0.4);
      x += Math.sin(ax) * h;
      y += Math.cos(ax) * Math.cos(az) * h;
      z += Math.sin(az) * h;
    }
  }

  private tmpV2 = new THREE.Vector3();
  heldVisible = false;
  /** 0..1: how far the held cup is lifted into the shake hero pose. */
  heroT = 0;

  /** World position of the top of the stack (for handoff arcs). */
  stackTop(i: number, out: THREE.Vector3): THREE.Vector3 {
    const m = this.stackMatrices[i];
    return m ? out.setFromMatrixPosition(m) : out.copy(this.root.position).setY(1);
  }

  chest(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.root.position.x, 0.9, this.root.position.z);
  }
}

export { outline, toon };
