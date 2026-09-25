// One pooled, instanced particle system: camera-facing sprites from a procedural atlas.
// Coins, sparkles, splash droplets, steam, pearls, confetti, anger puffs, dust — one draw call.
import * as THREE from 'three';
import { spriteAtlas, SPRITE_COLS, SPRITE_ROWS } from './textures';
import { feel } from '../config/feel';

export interface PSpawn {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  life: number;
  size: number;
  sizeEnd?: number;
  color: THREE.ColorRepresentation;
  alpha?: number;
  sprite: number;
  gravity?: number;
  drag?: number;
  rot?: number;
  spin?: number;
  /** Horizontal stretch (speed lines). */
  stretch?: number;
  /** Fade in over this fraction of life. */
  fadeIn?: number;
  /** Stay in screen space relative to a moving anchor (unused in V1). */
  floor?: number;
}

interface P {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  life: number; max: number; size: number; sizeEnd: number;
  r: number; g: number; b: number; a: number;
  sprite: number; gravity: number; drag: number; rot: number; spin: number; stretch: number; fadeIn: number; floor: number;
}

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iP;      // size, rotation, sprite, alpha
attribute vec3 iColor;
attribute float iStretch;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iP.y), s = sin(iP.y);
  vec2 q = position.xy * iP.x;
  q.x *= iStretch;
  mv.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  gl_Position = projectionMatrix * mv;
  float col = mod(iP.z, ${SPRITE_COLS}.0);
  float row = floor(iP.z / ${SPRITE_COLS}.0);
  vUv = vec2((uv.x + col) / ${SPRITE_COLS}.0, (uv.y + (${SPRITE_ROWS - 1}.0 - row)) / ${SPRITE_ROWS}.0);
  vCol = vec4(iColor, iP.w);
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * vCol.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol.rgb * t.rgb, a);
  #include <colorspace_fragment>
}`;

export class Particles {
  readonly mesh: THREE.Mesh;
  private pool: P[] = [];
  private alive = 0;
  private readonly max: number;
  private aPos: THREE.InstancedBufferAttribute;
  private aP: THREE.InstancedBufferAttribute;
  private aColor: THREE.InstancedBufferAttribute;
  private aStretch: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;
  private tmp = new THREE.Color();

  constructor(max = feel.particles.max) {
    this.max = max;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aP = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aStretch = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iP', this.aP);
    geo.setAttribute('iColor', this.aColor);
    geo.setAttribute('iStretch', this.aStretch);
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { map: { value: spriteAtlas() } },
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    for (let i = 0; i < max; i++) {
      this.pool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, sizeEnd: 1, r: 1, g: 1, b: 1, a: 1, sprite: 0, gravity: 0, drag: 0, rot: 0, spin: 0, stretch: 1, fadeIn: 0, floor: -99 });
    }
  }

  get count(): number { return this.alive; }

  spawn(s: PSpawn): void {
    if (this.alive >= this.max) return;
    const p = this.pool[this.alive++];
    p.x = s.x; p.y = s.y; p.z = s.z;
    p.vx = s.vx ?? 0; p.vy = s.vy ?? 0; p.vz = s.vz ?? 0;
    p.life = s.life; p.max = s.life;
    p.size = s.size; p.sizeEnd = s.sizeEnd ?? s.size;
    this.tmp.set(s.color);
    p.r = this.tmp.r; p.g = this.tmp.g; p.b = this.tmp.b;
    p.a = s.alpha ?? 1;
    p.sprite = s.sprite;
    p.gravity = s.gravity ?? 0;
    p.drag = s.drag ?? 0;
    p.rot = s.rot ?? 0;
    p.spin = s.spin ?? 0;
    p.stretch = s.stretch ?? 1;
    p.fadeIn = s.fadeIn ?? 0;
    p.floor = s.floor ?? -99;
  }

  /** Burst helper: n particles with random velocities in a cone. */
  burst(n: number, base: PSpawn, spread: { speed: [number, number]; up?: [number, number]; rand: () => number }): void {
    for (let i = 0; i < n; i++) {
      const a = spread.rand() * Math.PI * 2;
      const sp = spread.speed[0] + spread.rand() * (spread.speed[1] - spread.speed[0]);
      const up = spread.up ? spread.up[0] + spread.rand() * (spread.up[1] - spread.up[0]) : 0;
      this.spawn({ ...base, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: up, rot: spread.rand() * 6.28, spin: (spread.rand() - 0.5) * 10 });
    }
  }

  update(dt: number): void {
    const pos = this.aPos.array as Float32Array;
    const pp = this.aP.array as Float32Array;
    const col = this.aColor.array as Float32Array;
    const st = this.aStretch.array as Float32Array;
    let i = 0;
    while (i < this.alive) {
      const p = this.pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        // swap-remove
        const last = this.pool[this.alive - 1];
        this.pool[this.alive - 1] = p;
        this.pool[i] = last;
        this.alive--;
        continue;
      }
      p.vy -= p.gravity * dt;
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.floor) { p.y = p.floor; p.vy = -p.vy * 0.35; p.vx *= 0.6; p.vz *= 0.6; }
      p.rot += p.spin * dt;
      const k = 1 - p.life / p.max;
      const size = p.size + (p.sizeEnd - p.size) * k;
      let a = p.a;
      if (k > 0.7) a *= 1 - (k - 0.7) / 0.3;
      if (p.fadeIn > 0 && k < p.fadeIn) a *= k / p.fadeIn;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      pp[i * 4] = size; pp[i * 4 + 1] = p.rot; pp[i * 4 + 2] = p.sprite; pp[i * 4 + 3] = a;
      col[i * 3] = p.r; col[i * 3 + 1] = p.g; col[i * 3 + 2] = p.b;
      st[i] = p.stretch;
      i++;
    }
    this.geo.instanceCount = this.alive;
    if (this.alive) {
      this.aPos.needsUpdate = true;
      this.aP.needsUpdate = true;
      this.aColor.needsUpdate = true;
      this.aStretch.needsUpdate = true;
      this.aPos.clearUpdateRanges(); this.aPos.addUpdateRange(0, this.alive * 3);
      this.aP.clearUpdateRanges(); this.aP.addUpdateRange(0, this.alive * 4);
      this.aColor.clearUpdateRanges(); this.aColor.addUpdateRange(0, this.alive * 3);
      this.aStretch.clearUpdateRanges(); this.aStretch.addUpdateRange(0, this.alive);
    }
  }

  clear(): void { this.alive = 0; this.geo.instanceCount = 0; }
}
