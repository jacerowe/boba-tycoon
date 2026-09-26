// ?lineup=1 — a hero shot of 10 drinks (for docs/screenshots/drinks.png and visual review).
import * as THREE from 'three';
import { palette, applyCssPalette } from '../config/style';
import { defaultRegistry } from '../data/registry';
import type { Quality } from '../data/types';
import { CupRenderer, CUP } from './cups';
import { DrinkVisual } from './drinkLook';
import { Particles } from './particles';
import { SPRITE } from './textures';
import { MeshBuilder, roundedBox } from './geometry';

const LINEUP: { recipe: string; q: Quality | null; sealed: boolean }[] = [
  { recipe: 'pearlTea', q: 'ok', sealed: true },
  { recipe: 'pearlMilkTea', q: 'great', sealed: true },
  { recipe: 'berryPopMilkTea', q: 'perfect', sealed: true },
  { recipe: 'icedJellyTea', q: 'great', sealed: true },
  { recipe: 'taroPearlMilk', q: 'perfect', sealed: true },
  { recipe: 'rainbowTaroSlush', q: 'great', sealed: true },
  { recipe: 'pearlTea', q: 'perfect', sealed: true },
  { recipe: 'berryPopMilkTea', q: null, sealed: false },
  { recipe: 'taroPearlMilk', q: 'ok', sealed: true },
  { recipe: 'icedJellyTea', q: 'perfect', sealed: true },
];

export function runLineup(container: HTMLElement): void {
  applyCssPalette(document.documentElement);
  const reg = defaultRegistry();
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ffe4cc');
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(palette.hemiSky, palette.hemiGround, 2.1));
  const sun = new THREE.DirectionalLight(palette.sun, 2.3);
  sun.position.set(-4, 8, 6);
  scene.add(sun);
  // A cute counter to stand them on: wide for landscape, deep for portrait.
  const counter = (w: number, d: number) => {
    const b = new MeshBuilder();
    b.add(roundedBox(w, 0.3, d, 0.1), palette.cartWood, [0, -0.15, 0.2]);
    b.add(roundedBox(w + 0.2, 0.08, d + 0.2, 0.04), palette.cartTrim, [0, 0.02, 0.2]);
    b.add(roundedBox(w, 1.4, 0.2, 0.08), palette.cartBody, [0, -0.9, 0.2 + d / 2 + 0.05]);
    const mesh = b.mesh(0.03);
    scene.add(mesh);
    return mesh;
  };
  const wide = counter(9.5, 3.2);
  const deep = counter(5.4, 5.6);
  const cups = new CupRenderer(16, 400);
  scene.add(cups.group);
  const particles = new Particles(400);
  scene.add(particles.mesh);
  const visuals = LINEUP.map((d, i) => new DrinkVisual(reg, { recipeId: d.recipe, next: d.sealed ? reg.recipe(d.recipe).steps.length - 1 : reg.recipe(d.recipe).steps.indexOf('shake') + 1, quality: d.q, sealed: d.sealed, seed: 100 + i * 37 }));
  // Landscape: two rows of five. Portrait: four short rows (2-3-3-2) so every drink fits the width.
  const layout = (rows: number[], dx: number, dz: number, stagger: number) => {
    const out: THREE.Vector3[] = [];
    rows.forEach((n, r) => {
      for (let c = 0; c < n; c++) out.push(new THREE.Vector3((c - (n - 1) / 2) * dx + (r % 2 ? stagger : -stagger), 0.09, 0.2 + (r - (rows.length - 1) / 2) * dz));
    });
    return out;
  };
  const wideSlots = layout([5, 5], 1.6, 1.4, 0.4);
  const deepSlots = layout([2, 3, 3, 2], 1.5, 1.25, 0.2);
  let slots = wideSlots;
  const m = new THREE.Matrix4();
  const s = new THREE.Vector3(2.2, 2.2, 2.2);
  const q = new THREE.Quaternion();
  let t = 0;
  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    cam.aspect = w / h;
    const portrait = w < h;
    slots = portrait ? deepSlots : wideSlots;
    wide.visible = !portrait;
    deep.visible = portrait;
    cam.position.set(0, portrait ? 8.6 : 5.9, portrait ? 11.8 : 11.2);
    cam.lookAt(0, portrait ? 0.4 : 0.62, 0.25);
    cam.fov = portrait ? 40 : 32;
    cam.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();
  let last = performance.now();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    cups.begin(t);
    visuals.forEach((v, i) => {
      v.update(dt);
      q.setFromEuler(new THREE.Euler(0, -0.3 + Math.sin(t * 0.8 + i) * 0.06, 0));
      m.compose(slots[i], q, s);
      cups.draw(m, v.look);
      if (LINEUP[i].q === 'perfect' && Math.random() < dt * 14) {
        const a = t * 4 + i * 2;
        const p = slots[i];
        particles.spawn({ x: p.x + Math.cos(a) * 0.55, y: p.y + CUP.H * 2.2 * 0.8, z: p.z + Math.sin(a) * 0.55, vy: 0.35, life: 0.7, size: 0.2, sizeEnd: 0.04, color: palette.sparkle, sprite: SPRITE.sparkle, spin: 5 });
      }
    });
    cups.end();
    particles.update(dt);
    renderer.render(scene, cam);
  };
  requestAnimationFrame(loop);
  (window as unknown as { __lineupReady: boolean }).__lineupReady = true;
}
