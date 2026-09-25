// Mini renders of the actual drink (same cup renderer), used in order bubbles, the ticket
// and menu cards. Rendered once per recipe/tier into an offscreen target and cached as images.
import * as THREE from 'three';
import type { Registry } from '../data/registry';
import type { Quality } from '../data/types';
import { CupRenderer, emptyLook } from './cups';
import { computeLook } from './drinkLook';

export class DrinkIcons {
  private scene = new THREE.Scene();
  private cam: THREE.PerspectiveCamera;
  private cups = new CupRenderer(2, 64);
  private rt: THREE.WebGLRenderTarget;
  private cache = new Map<string, string>();
  private readonly w = 112;
  private readonly h = 128;
  private buf: Uint8Array;
  private canvas = document.createElement('canvas');
  private m = new THREE.Matrix4();

  constructor(private renderer: THREE.WebGLRenderer, private reg: Registry) {
    this.cam = new THREE.PerspectiveCamera(26, this.w / this.h, 0.1, 20);
    this.cam.position.set(0, 1.25, 2.05);
    this.cam.lookAt(0, 0.33, 0);
    this.scene.add(new THREE.HemisphereLight(0xfff4e6, 0xf3b98f, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-2, 4, 3);
    this.scene.add(sun);
    this.scene.add(this.cups.group);
    this.rt = new THREE.WebGLRenderTarget(this.w * 2, this.h * 2, { samples: 4 });
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.buf = new Uint8Array(this.w * 2 * this.h * 2 * 4);
    this.canvas.width = this.w;
    this.canvas.height = this.h;
  }

  /** Data URL of a drink render. `stepsDone` defaults to the finished (sealed) drink. */
  get(recipeId: string, quality: Quality | null = null, sealed = true): string {
    const key = `${recipeId}|${quality}|${sealed}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const recipe = this.reg.recipe(recipeId);
    const look = computeLook(this.reg, { recipeId, next: sealed ? recipe.steps.length - 1 : recipe.steps.indexOf('shake'), quality, sealed, seed: 4242 }, emptyLook());
    this.cups.begin(1.3);
    this.m.makeRotationY(-0.35);
    this.cups.draw(this.m, look);
    this.cups.end();
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, this.cam);
    const W = this.w * 2, H = this.h * 2;
    r.readRenderTargetPixels(this.rt, 0, 0, W, H, this.buf);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevClear, prevAlpha);
    // Downsample 2x and flip Y into the canvas.
    const g = this.canvas.getContext('2d')!;
    const img = g.createImageData(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        let rr = 0, gg = 0, bb = 0, aa = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const sy = H - 1 - (y * 2 + dy), sx = x * 2 + dx;
          const i = (sy * W + sx) * 4;
          const a = this.buf[i + 3];
          rr += this.buf[i] * a; gg += this.buf[i + 1] * a; bb += this.buf[i + 2] * a; aa += a;
        }
        const o = (y * this.w + x) * 4;
        if (aa > 0) {
          img.data[o] = rr / aa; img.data[o + 1] = gg / aa; img.data[o + 2] = bb / aa;
        }
        img.data[o + 3] = aa / 4;
      }
    }
    g.putImageData(img, 0, 0);
    const url = this.canvas.toDataURL('image/png');
    this.cache.set(key, url);
    return url;
  }

  dispose(): void { this.rt.dispose(); }
}
