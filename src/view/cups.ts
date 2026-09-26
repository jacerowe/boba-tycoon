// The drink is the star. An immediate-mode instanced cup renderer: every visible cup
// (in hand, stacked, flying to a customer, in the lineup) is drawn with ~10 draw calls total.
// Cups are a translucent glossy shell around a separate liquid mesh whose fill, layers,
// milk swirl, foam and slosh are per-instance shader attributes.
import * as THREE from 'three';
import { palette } from '../config/style';
import { toon, outline } from './materials';
import { cupProfile, lathe, sphere, roundedBox, cylinder, torus } from './geometry';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const CUP = { H: 0.58, RT: 0.205, RB: 0.165, INNER: 0.9 } as const;

export interface ToppingInst {
  kind: 'sphere' | 'cube';
  x: number; y: number; z: number;
  s: number;
  color: THREE.Color;
  rot: number;
}

export interface CupLook {
  fill: number;
  colTop: THREE.Color;
  colBottom: THREE.Color;
  bottomH: number;
  soft: number;
  foam: number;
  swirl: number;
  /** 0..1 lid seal animation. */
  sealed: number;
  /** 0..1 straw pop-in. */
  straw: number;
  strawColor: THREE.Color;
  lidColor: THREE.Color;
  /** PERFECT gold rim glow 0..1. */
  glow: number;
  tiltX: number;
  tiltZ: number;
  toppings: ToppingInst[];
}

export function emptyLook(): CupLook {
  return {
    fill: 0, colTop: new THREE.Color(palette.tea), colBottom: new THREE.Color(palette.tea), bottomH: 0, soft: 0.04, foam: 0, swirl: 0,
    sealed: 0, straw: 0, strawColor: new THREE.Color(palette.strawColors[0]), lidColor: new THREE.Color(palette.lidFilm), glow: 0,
    tiltX: 0, tiltZ: 0, toppings: [],
  };
}

const LIQUID_VERT = /* glsl */ `
attribute float iFill;
attribute vec3 iColA;
attribute vec3 iColB;
attribute vec4 iLayer;
attribute vec2 iTilt;
varying vec3 vLocal;
varying vec3 vNormalV;
varying float vFill;
varying vec3 vColA;
varying vec3 vColB;
varying vec4 vLayer;
varying vec2 vTilt;
void main() {
  vLocal = position;
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  vec4 mv = modelViewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  vNormalV = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vFill = iFill; vColA = iColA; vColB = iColB; vLayer = iLayer; vTilt = iTilt;
}`;

const LIQUID_FRAG = /* glsl */ `
uniform float uH;
uniform float uTime;
uniform vec3 uMilk;
uniform vec3 uFoam;
varying vec3 vLocal;
varying vec3 vNormalV;
varying float vFill;
varying vec3 vColA;
varying vec3 vColB;
varying vec4 vLayer;
varying vec2 vTilt;
void main() {
  float h = vLocal.y / uH;
  float surf = vFill + (vTilt.x * vLocal.x + vTilt.y * vLocal.z) * 2.2;
  if (vFill <= 0.002 || h > surf) discard;
  bool top = !gl_FrontFacing;
  vec3 col = mix(vColB, vColA, smoothstep(vLayer.x - vLayer.y, vLayer.x + vLayer.y, h));
  float ang = atan(vLocal.z, vLocal.x);
  float s = sin(ang * 3.0 - h * 15.0 + uTime * 2.6);
  col = mix(col, uMilk, vLayer.w * smoothstep(0.25, 1.0, s) * 0.5 * smoothstep(vLayer.x, vLayer.x + 0.15, h));
  float foamH = vLayer.z;
  if (foamH > 0.001) {
    float fb = smoothstep(surf - foamH - 0.02, surf - foamH + 0.02, h);
    col = mix(col, uFoam, (top ? 1.0 : fb) * 0.95);
  }
  float shade;
  if (top) {
    shade = 1.1;
    // a soft highlight on the surface
    float r = length(vLocal.xz);
    shade += 0.08 * (1.0 - smoothstep(0.0, 0.18, r));
  } else {
    vec3 n = normalize(vNormalV);
    float d = dot(n, normalize(vec3(-0.45, 0.35, 0.8)));
    shade = d > 0.15 ? 1.0 : 0.84;
    shade *= mix(0.9, 1.0, smoothstep(0.0, 0.35, h));
  }
  gl_FragColor = vec4(col * shade, 1.0);
  #include <colorspace_fragment>
}`;

const SHELL_VERT = /* glsl */ `
attribute float iGlow;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying float vGlow;
varying float vY;
void main() {
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  vec4 mv = modelViewMatrix * wp;
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
  vNormalV = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vGlow = iGlow;
  vY = position.y;
}`;

const SHELL_FRAG = /* glsl */ `
uniform vec3 uGold;
uniform float uTime;
uniform float uH;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying float vGlow;
varying float vY;
void main() {
  vec3 n = normalize(vNormalV);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(-vViewPos);
  float fres = pow(1.0 - abs(dot(n, v)), 2.2);
  float stripe = smoothstep(0.9, 0.985, dot(n, normalize(vec3(-0.6, 0.2, 0.78))));
  float stripe2 = smoothstep(0.96, 0.995, dot(n, normalize(vec3(0.55, 0.1, 0.83))));
  float pulse = 0.75 + 0.25 * sin(uTime * 5.0 + vY * 18.0);
  vec3 col = mix(vec3(1.0), uGold, clamp(vGlow * (0.35 + fres) * pulse, 0.0, 1.0));
  float a = 0.05 + fres * 0.42 + stripe * 0.6 + stripe2 * 0.3 + vGlow * 0.25 * fres;
  if (!gl_FrontFacing) a *= 0.45;
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));
  #include <colorspace_fragment>
}`;

function buildLiquidGeo(): THREE.BufferGeometry {
  const pts = cupProfile(CUP.RB * CUP.INNER, CUP.RT * CUP.INNER, CUP.H * 0.97, 0.045, 6);
  pts[0].y = 0.012;
  for (const p of pts) p.y = Math.max(p.y, 0.012);
  return lathe(pts, 22);
}

function buildShellGeo(): THREE.BufferGeometry {
  return lathe(cupProfile(CUP.RB, CUP.RT, CUP.H, 0.05, 6), 24);
}

export class CupRenderer {
  readonly group = new THREE.Group();
  private liquid: THREE.InstancedMesh;
  private shell: THREE.InstancedMesh;
  private hull: THREE.InstancedMesh;
  private rim: THREE.InstancedMesh;
  private lid: THREE.InstancedMesh;
  private straw: THREE.InstancedMesh;
  private strawHull: THREE.InstancedMesh;
  private foamCap: THREE.InstancedMesh;
  private spheres: THREE.InstancedMesh;
  private cubes: THREE.InstancedMesh;
  private aFill: THREE.InstancedBufferAttribute;
  private aColA: THREE.InstancedBufferAttribute;
  private aColB: THREE.InstancedBufferAttribute;
  private aLayer: THREE.InstancedBufferAttribute;
  private aTilt: THREE.InstancedBufferAttribute;
  private aGlow: THREE.InstancedBufferAttribute;
  private n = 0;
  private nStraw = 0;
  private nLid = 0;
  private nFoam = 0;
  private nSph = 0;
  private nCube = 0;
  private liquidMat: THREE.ShaderMaterial;
  private shellMat: THREE.ShaderMaterial;
  private m = new THREE.Matrix4();
  private m2 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private e = new THREE.Euler();

  constructor(readonly maxCups = 64, readonly maxToppings = 900) {
    const liquidGeo = buildLiquidGeo();
    this.aFill = new THREE.InstancedBufferAttribute(new Float32Array(maxCups), 1).setUsage(THREE.DynamicDrawUsage);
    this.aColA = new THREE.InstancedBufferAttribute(new Float32Array(maxCups * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aColB = new THREE.InstancedBufferAttribute(new Float32Array(maxCups * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aLayer = new THREE.InstancedBufferAttribute(new Float32Array(maxCups * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aTilt = new THREE.InstancedBufferAttribute(new Float32Array(maxCups * 2), 2).setUsage(THREE.DynamicDrawUsage);
    liquidGeo.setAttribute('iFill', this.aFill);
    liquidGeo.setAttribute('iColA', this.aColA);
    liquidGeo.setAttribute('iColB', this.aColB);
    liquidGeo.setAttribute('iLayer', this.aLayer);
    liquidGeo.setAttribute('iTilt', this.aTilt);
    this.liquidMat = new THREE.ShaderMaterial({
      vertexShader: LIQUID_VERT, fragmentShader: LIQUID_FRAG, side: THREE.DoubleSide,
      uniforms: { uH: { value: CUP.H }, uTime: { value: 0 }, uMilk: { value: new THREE.Color(palette.milk) }, uFoam: { value: new THREE.Color(palette.foam) } },
    });
    this.liquid = new THREE.InstancedMesh(liquidGeo, this.liquidMat, maxCups);

    const shellGeo = buildShellGeo();
    this.aGlow = new THREE.InstancedBufferAttribute(new Float32Array(maxCups), 1).setUsage(THREE.DynamicDrawUsage);
    shellGeo.setAttribute('iGlow', this.aGlow);
    this.shellMat = new THREE.ShaderMaterial({
      vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG, side: THREE.DoubleSide, transparent: true, depthWrite: true,
      uniforms: { uGold: { value: new THREE.Color('#ffc93c') }, uTime: { value: 0 }, uH: { value: CUP.H } },
    });
    this.shell = new THREE.InstancedMesh(shellGeo, this.shellMat, maxCups);
    this.shell.renderOrder = 5;

    const rimGeo = torus(CUP.RT, 0.02, 6, 26);
    rimGeo.rotateX(Math.PI / 2);
    rimGeo.translate(0, CUP.H, 0);
    const hullGeo = mergeGeometries([stripAttrs(buildShellGeo()), stripAttrs(rimGeo)])!;
    this.hull = new THREE.InstancedMesh(hullGeo, outline(0.022), maxCups);
    this.hull.renderOrder = 6;
    this.rim = new THREE.InstancedMesh(rimGeo, toon(palette.cupRim), maxCups);

    // Sealed film: a thin lens-shaped disc on top.
    const lidGeo = sphere(1, 22, 8);
    lidGeo.scale(CUP.RT * 1.02, 0.045, CUP.RT * 1.02);
    lidGeo.translate(0, CUP.H, 0);
    this.lid = new THREE.InstancedMesh(lidGeo, toon('#ffffff'), maxCups);
    this.lid.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxCups * 3), 3);

    const strawGeo = cylinder(0.042, 0.042, 0.62, 12);
    strawGeo.translate(0, 0.31, 0);
    this.straw = new THREE.InstancedMesh(strawGeo, toon('#ffffff'), maxCups);
    this.straw.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxCups * 3), 3);
    this.strawHull = new THREE.InstancedMesh(strawGeo, outline(0.016), maxCups);

    const foamGeo = sphere(1, 16, 8, );
    foamGeo.scale(CUP.RT * 0.88, 0.07, CUP.RT * 0.88);
    this.foamCap = new THREE.InstancedMesh(foamGeo, toon(palette.foam), maxCups);

    this.spheres = new THREE.InstancedMesh(sphere(1, 10, 8), toon('#ffffff'), maxToppings);
    this.spheres.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxToppings * 3), 3);
    this.cubes = new THREE.InstancedMesh(roundedBox(2, 2, 2, 0.45, 2), toon('#ffffff'), maxToppings);
    this.cubes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxToppings * 3), 3);

    for (const mesh of [this.liquid, this.shell, this.hull, this.rim, this.lid, this.straw, this.strawHull, this.foamCap, this.spheres, this.cubes]) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);
    }
  }

  begin(time: number): void {
    this.n = this.nStraw = this.nLid = this.nFoam = this.nSph = this.nCube = 0;
    this.liquidMat.uniforms.uTime.value = time;
    this.shellMat.uniforms.uTime.value = time;
  }

  /** Draw one cup with world matrix `mat`. */
  draw(mat: THREE.Matrix4, look: CupLook): void {
    if (this.n >= this.maxCups) return;
    const i = this.n++;
    this.liquid.setMatrixAt(i, mat);
    this.shell.setMatrixAt(i, mat);
    this.hull.setMatrixAt(i, mat);
    this.rim.setMatrixAt(i, mat);
    (this.aFill.array as Float32Array)[i] = look.fill;
    const ca = this.aColA.array as Float32Array, cb = this.aColB.array as Float32Array;
    ca[i * 3] = look.colTop.r; ca[i * 3 + 1] = look.colTop.g; ca[i * 3 + 2] = look.colTop.b;
    cb[i * 3] = look.colBottom.r; cb[i * 3 + 1] = look.colBottom.g; cb[i * 3 + 2] = look.colBottom.b;
    const la = this.aLayer.array as Float32Array;
    la[i * 4] = look.bottomH; la[i * 4 + 1] = look.soft; la[i * 4 + 2] = look.foam; la[i * 4 + 3] = look.swirl;
    const ta = this.aTilt.array as Float32Array;
    ta[i * 2] = look.tiltX; ta[i * 2 + 1] = look.tiltZ;
    (this.aGlow.array as Float32Array)[i] = look.glow;

    if (look.sealed > 0.001) {
      const j = this.nLid++;
      this.m2.makeScale(1, Math.max(0.05, look.sealed), 1);
      this.m.multiplyMatrices(mat, this.m2);
      this.lid.setMatrixAt(j, this.m);
      this.lid.setColorAt(j, look.lidColor);
    }
    if (look.straw > 0.001) {
      const j = this.nStraw++;
      this.e.set(0.16, 0, -0.12);
      this.q.setFromEuler(this.e);
      this.v.set(0.045, CUP.H - 0.28 + 0.28 * look.straw, -0.02);
      this.sc.set(1, look.straw, 1);
      this.m2.compose(this.v, this.q, this.sc);
      this.m.multiplyMatrices(mat, this.m2);
      this.straw.setMatrixAt(j, this.m);
      this.strawHull.setMatrixAt(j, this.m);
      this.straw.setColorAt(j, look.strawColor);
    }
    if (look.foam > 0.001 && look.fill > 0.05) {
      const j = this.nFoam++;
      const y = look.fill * CUP.H;
      this.v.set(0, y, 0);
      this.q.identity();
      const r = 0.8 + 0.2 * ((y / CUP.H - 0.5) * 2);
      this.sc.set(r, Math.min(1.4, look.foam * 7), r);
      this.m2.compose(this.v, this.q, this.sc);
      this.m.multiplyMatrices(mat, this.m2);
      this.foamCap.setMatrixAt(j, this.m);
    }
    for (const t of look.toppings) {
      const mesh = t.kind === 'sphere' ? this.spheres : this.cubes;
      const j = t.kind === 'sphere' ? this.nSph : this.nCube;
      if (j >= this.maxToppings) continue;
      this.e.set(t.rot, t.rot * 1.7, t.rot * 0.6);
      this.q.setFromEuler(this.e);
      this.v.set(t.x, t.y, t.z);
      const s = t.kind === 'cube' ? t.s * 0.5 : t.s;
      this.sc.set(s, s, s);
      this.m2.compose(this.v, this.q, this.sc);
      this.m.multiplyMatrices(mat, this.m2);
      mesh.setMatrixAt(j, this.m);
      mesh.setColorAt(j, t.color);
      if (t.kind === 'sphere') this.nSph++; else this.nCube++;
    }
  }

  end(): void {
    const n = this.n;
    for (const mesh of [this.liquid, this.shell, this.hull, this.rim]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.lid.count = this.nLid;
    this.straw.count = this.nStraw;
    this.strawHull.count = this.nStraw;
    this.foamCap.count = this.nFoam;
    this.spheres.count = this.nSph;
    this.cubes.count = this.nCube;
    for (const mesh of [this.lid, this.straw, this.strawHull, this.foamCap, this.spheres, this.cubes]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    for (const a of [this.aFill, this.aColA, this.aColB, this.aLayer, this.aTilt, this.aGlow]) a.needsUpdate = true;
  }

  get drawn(): number { return this.n; }
}

function stripAttrs(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k);
  return out;
}
