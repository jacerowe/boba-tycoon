// Instanced characters (customers and pedestrians). Chunky silhouettes, big simple faces,
// varied colors, hats and heights. Immediate-mode: begin(), draw(pose) per character, end().
import * as THREE from 'three';
import { palette } from '../config/style';
import { capsule, sphere, cylinder, MeshBuilder, commitInstances } from './geometry';
import { toon, outline, blobShadowMaterial } from './materials';
import { customerFaceAtlas, FACE_COLS, FACE_ROWS } from './textures';
import { Rng } from '../sim/rng';

export interface CharLook {
  skin: THREE.Color;
  shirt: THREE.Color;
  hair: THREE.Color;
  hat: number; // 0 none, 1 cap, 2 beanie, 3 bow, 4 top hat, 5 bucket
  hatColor: THREE.Color;
  height: number;
  width: number;
}

export interface CharPose {
  x: number; y: number; z: number;
  facing: number;
  squash: number;
  roll: number;
  pitch: number;
  face: number;
  seated: boolean;
  footL: number; // foot lift (m)
  footR: number;
  armSwing: number;
  alpha?: number;
}

export function lookFromSeed(seed: number): CharLook {
  const r = new Rng(seed);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r.next() * a.length)];
  const hat = r.next() < 0.3 ? 0 : 1 + Math.floor(r.next() * 5);
  return {
    skin: new THREE.Color(pick(palette.skin)),
    shirt: new THREE.Color(pick(palette.shirts)),
    hair: new THREE.Color(pick(palette.hair)),
    hat,
    hatColor: new THREE.Color(pick(palette.hats)),
    height: 0.86 + r.next() * 0.26,
    width: 0.9 + r.next() * 0.25,
  };
}

const HEAD_Y = 0.98;
const HEAD_R = 0.31;

function hatGeo(type: number): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const W = '#ffffff', L = '#ffffff';
  switch (type) {
    case 1: // cap
      b.add(sphere(0.315, 12, 6), W, [0, 0.04, 0], [0, 0, 0], [1, 0.72, 1]);
      b.add(cylinder(0.2, 0.22, 0.03, 16), W, [0, 0.07, 0.25], [0.22, 0, 0], [1, 1, 0.9]);
      break;
    case 2: // beanie
      b.add(sphere(0.33, 12, 7), W, [0, 0.08, -0.01], [0, 0, 0], [1, 0.82, 1]);
      b.add(cylinder(0.33, 0.33, 0.1, 16), L, [0, 0.02, -0.01]);
      b.add(sphere(0.09, 10, 8), '#ffffff', [0, 0.36, -0.01]);
      break;
    case 3: // bow
      b.add(sphere(0.1, 10, 8), W, [0.2, 0.22, 0.02], [0, 0, 0.5], [1.3, 0.8, 0.6]);
      b.add(sphere(0.1, 10, 8), W, [0.36, 0.14, 0.02], [0, 0, 0.5], [1.3, 0.8, 0.6]);
      b.add(sphere(0.05, 8, 6), W, [0.28, 0.18, 0.04]);
      break;
    case 4: // top hat
      b.add(cylinder(0.36, 0.36, 0.03, 18), W, [0, 0.2, 0]);
      b.add(cylinder(0.22, 0.24, 0.36, 18), W, [0, 0.38, 0]);
      b.add(cylinder(0.245, 0.245, 0.06, 18), '#ffffff', [0, 0.25, 0]);
      break;
    case 5: // bucket
      b.add(cylinder(0.24, 0.33, 0.2, 16), W, [0, 0.2, 0]);
      b.add(cylinder(0.44, 0.44, 0.03, 18), W, [0, 0.1, 0]);
      break;
  }
  return b.build();
}

function facePatch(): THREE.BufferGeometry {
  const span = 1.45;
  return new THREE.SphereGeometry(HEAD_R + 0.004, 10, 7, Math.PI / 2 - span / 2, span, Math.PI * 0.28, Math.PI * 0.5);
}

function faceMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ map: customerFaceAtlas(), transparent: true, alphaTest: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float iFace;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vMapUv = vec2((vMapUv.x + mod(iFace, ${FACE_COLS}.0)) / ${FACE_COLS}.0, (vMapUv.y + (${FACE_ROWS - 1}.0 - floor(iFace / ${FACE_COLS}.0))) / ${FACE_ROWS}.0);`);
  };
  m.customProgramCacheKey = () => 'faceAtlas';
  return m;
}

export class CharacterRenderer {
  readonly group = new THREE.Group();
  private body: THREE.InstancedMesh;
  private bodyO: THREE.InstancedMesh;
  private head: THREE.InstancedMesh;
  private headO: THREE.InstancedMesh;
  private hair: THREE.InstancedMesh;
  private face: THREE.InstancedMesh;
  private feet: THREE.InstancedMesh;
  private arms: THREE.InstancedMesh;
  private shadow: THREE.InstancedMesh;
  private hats: THREE.InstancedMesh[] = [];
  private hatsO: THREE.InstancedMesh[] = [];
  private hatN: number[] = [];
  private aFace: THREE.InstancedBufferAttribute;
  private n = 0;
  private m = new THREE.Matrix4();
  private root = new THREE.Matrix4();
  private local = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(readonly max = 48) {
    const bodyGeo = capsule(0.27, 0.26, 4, 12);
    bodyGeo.translate(0, 0.5, 0);
    this.body = new THREE.InstancedMesh(bodyGeo, toon('#ffffff', { use: 'instColor' }), max);
    this.bodyO = new THREE.InstancedMesh(bodyGeo, outline(0.03, undefined, 'inst'), max);
    const headGeo = sphere(HEAD_R, 14, 10);
    this.head = new THREE.InstancedMesh(headGeo, toon('#ffffff', { use: 'instColor' }), max);
    this.headO = new THREE.InstancedMesh(headGeo, outline(0.03, undefined, 'inst'), max);
    const hairGeo = new THREE.SphereGeometry(HEAD_R + 0.02, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.42);
    hairGeo.rotateX(-0.35);
    this.hair = new THREE.InstancedMesh(hairGeo, toon('#ffffff', { use: 'instColor' }), max);
    const faceGeo = facePatch();
    this.aFace = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    faceGeo.setAttribute('iFace', this.aFace);
    this.face = new THREE.InstancedMesh(faceGeo, faceMaterial(), max);
    const footGeo = sphere(0.1, 8, 5);
    footGeo.scale(1, 0.6, 1.35);
    this.feet = new THREE.InstancedMesh(footGeo, toon(palette.cartWheel, { use: 'inst' }), max * 2);
    const armGeo = capsule(0.075, 0.18, 2, 6);
    this.arms = new THREE.InstancedMesh(armGeo, toon('#ffffff', { use: 'instColor' }), max * 2);
    const shGeo = new THREE.PlaneGeometry(0.95, 0.95).rotateX(-Math.PI / 2);
    this.shadow = new THREE.InstancedMesh(shGeo, blobShadowMaterial('inst'), max);
    this.shadow.renderOrder = 1;
    for (const mesh of [this.body, this.head, this.hair, this.arms]) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.count * 3), 3);
    for (let t = 1; t <= 5; t++) {
      const g = hatGeo(t);
      const hm = new THREE.InstancedMesh(g, toon('#ffffff', { vertexColors: true, use: 'instColor' }), max);
      hm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      const ho = new THREE.InstancedMesh(g, outline(0.024, undefined, 'inst'), max);
      this.hats[t] = hm;
      this.hatsO[t] = ho;
      this.group.add(hm, ho);
    }
    for (const mesh of [this.shadow, this.body, this.bodyO, this.head, this.headO, this.hair, this.face, this.feet, this.arms]) this.group.add(mesh);
    this.group.traverse((o) => { o.frustumCulled = false; if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).count = 0; });
  }

  begin(): void {
    this.n = 0;
    this.hatN = [0, 0, 0, 0, 0, 0];
  }

  private set(mesh: THREE.InstancedMesh, i: number, lx: number, ly: number, lz: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): void {
    this.e.set(rx, ry, rz);
    this.q.setFromEuler(this.e);
    this.v.set(lx, ly, lz);
    this.s.set(sx, sy, sz);
    this.local.compose(this.v, this.q, this.s);
    this.m.multiplyMatrices(this.root, this.local);
    mesh.setMatrixAt(i, this.m);
  }

  draw(p: CharPose, look: CharLook): void {
    if (this.n >= this.max) return;
    const i = this.n++;
    const h = look.height;
    const sq = p.squash;
    // Root: position, facing, lean; squash & stretch around the feet.
    this.e.set(p.pitch, p.facing, p.roll, 'YXZ');
    this.q.setFromEuler(this.e);
    this.v.set(p.x, p.y, p.z);
    this.s.set(h * look.width * (1 + sq * 0.5), h * (1 - sq), h * look.width * (1 + sq * 0.5));
    this.root.compose(this.v, this.q, this.s);
    const seatY = p.seated ? -0.22 : 0;
    this.set(this.body, i, 0, seatY, 0);
    this.set(this.bodyO, i, 0, seatY, 0);
    this.body.setColorAt(i, look.shirt);
    this.set(this.head, i, 0, HEAD_Y + seatY, 0);
    this.set(this.headO, i, 0, HEAD_Y + seatY, 0);
    this.head.setColorAt(i, look.skin);
    this.set(this.face, i, 0, HEAD_Y + seatY, 0);
    (this.aFace.array as Float32Array)[i] = p.face;
    if (look.hat === 0 || look.hat === 3) {
      this.set(this.hair, i, 0, HEAD_Y + seatY, -0.02);
    } else {
      this.set(this.hair, i, 0, -99, 0, 0, 0, 0, 0.001, 0.001, 0.001);
    }
    this.hair.setColorAt(i, look.hair);
    if (look.hat > 0) {
      const t = look.hat;
      const j = this.hatN[t]++;
      this.set(this.hats[t], j, 0, HEAD_Y + seatY + (t === 3 ? 0 : 0.04), 0);
      this.set(this.hatsO[t], j, 0, HEAD_Y + seatY + (t === 3 ? 0 : 0.04), 0);
      this.hats[t].setColorAt(j, look.hatColor);
    }
    // Feet (tucked when seated)
    const fy = p.seated ? 0.16 : 0.06;
    this.set(this.feet, i * 2, -0.13, fy + p.footL, p.seated ? 0.18 : 0.02);
    this.set(this.feet, i * 2 + 1, 0.13, fy + p.footR, p.seated ? 0.18 : 0.02);
    // Arms
    this.set(this.arms, i * 2, -0.3, 0.55 + seatY, 0.02, p.armSwing, 0, 0.25);
    this.set(this.arms, i * 2 + 1, 0.3, 0.55 + seatY, 0.02, -p.armSwing, 0, -0.25);
    this.arms.setColorAt(i * 2, look.shirt);
    this.arms.setColorAt(i * 2 + 1, look.shirt);
    // Shadow (flat, no lean)
    this.m.makeTranslation(p.x, 0.013, p.z);
    this.m.scale(this.s.set(h, 1, h));
    this.shadow.setMatrixAt(i, this.m);
  }

  end(): void {
    const n = this.n;
    for (const mesh of [this.body, this.bodyO, this.head, this.headO, this.hair, this.face, this.shadow]) commitInstances(mesh, n);
    for (const mesh of [this.feet, this.arms]) commitInstances(mesh, n * 2);
    for (let t = 1; t <= 5; t++) {
      commitInstances(this.hats[t], this.hatN[t]);
      commitInstances(this.hatsO[t], this.hatN[t]);
    }
    this.aFace.needsUpdate = true;
  }

  get drawn(): number { return this.n; }
}
