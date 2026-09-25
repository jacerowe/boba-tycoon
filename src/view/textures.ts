// Procedural canvas textures: face atlases, particle sprites, ground tiles, signs.
import * as THREE from 'three';
import { palette, fonts } from '../config/style';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, opts: { repeat?: boolean; nearest?: boolean } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (opts.nearest) t.magFilter = THREE.NearestFilter;
  return t;
}

// ---- Faces -------------------------------------------------------------------
export const FACE = { happy: 0, neutral: 1, angry: 2, furious: 3, delighted: 4, hmph: 5, sad: 6, wow: 7 } as const;
export const PLAYER_FACE = { happy: 0, focus: 1, wow: 2, strain: 3, delighted: 4, oops: 5, sweat: 6, blink: 7 } as const;
export const FACE_COLS = 4, FACE_ROWS = 2;

type FaceDraw = (g: CanvasRenderingContext2D, s: number) => void;

const INK = palette.ink;

function eye(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  g.fillStyle = INK;
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(x - rx * 0.3, y - ry * 0.38, rx * 0.36, 0, Math.PI * 2); g.fill();
}
function arcEye(g: CanvasRenderingContext2D, x: number, y: number, w: number, up: boolean) {
  g.strokeStyle = INK; g.lineWidth = w * 0.42; g.lineCap = 'round';
  g.beginPath();
  if (up) g.arc(x, y + w * 0.4, w, Math.PI * 1.15, Math.PI * 1.85);
  else g.arc(x, y - w * 0.4, w, Math.PI * 0.15, Math.PI * 0.85);
  g.stroke();
}
function blush(g: CanvasRenderingContext2D, x: number, y: number, r: number, a = 0.55) {
  g.fillStyle = `rgba(255,111,145,${a})`;
  g.beginPath(); g.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); g.fill();
}
function brow(g: CanvasRenderingContext2D, x: number, y: number, len: number, ang: number, w: number) {
  g.strokeStyle = INK; g.lineWidth = w; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len);
  g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
  g.stroke();
}
function mouth(g: CanvasRenderingContext2D, kind: 'smile' | 'flat' | 'frown' | 'open' | 'bigSmile' | 'o' | 'wavy' | 'grin', cx: number, cy: number, s: number) {
  g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = s * 0.045; g.lineCap = 'round'; g.lineJoin = 'round';
  const w = s * 0.11;
  g.beginPath();
  switch (kind) {
    case 'smile': g.arc(cx, cy - w * 0.5, w, Math.PI * 0.18, Math.PI * 0.82); g.stroke(); break;
    case 'flat': g.moveTo(cx - w * 0.7, cy); g.lineTo(cx + w * 0.7, cy); g.stroke(); break;
    case 'frown': g.arc(cx, cy + w * 0.9, w * 0.9, Math.PI * 1.2, Math.PI * 1.8); g.stroke(); break;
    case 'open':
      g.ellipse(cx, cy + w * 0.2, w * 0.9, w * 0.75, 0, Math.PI, 0, true); g.closePath(); g.fill();
      g.fillStyle = '#ff8fa8'; g.beginPath(); g.ellipse(cx, cy + w * 0.55, w * 0.5, w * 0.28, 0, 0, Math.PI * 2); g.fill();
      break;
    case 'bigSmile':
      g.moveTo(cx - w * 1.2, cy - w * 0.3); g.quadraticCurveTo(cx, cy + w * 2.0, cx + w * 1.2, cy - w * 0.3); g.closePath(); g.fill();
      g.fillStyle = '#ff8fa8'; g.beginPath(); g.ellipse(cx, cy + w * 0.6, w * 0.55, w * 0.3, 0, 0, Math.PI * 2); g.fill();
      break;
    case 'o': g.ellipse(cx, cy + w * 0.2, w * 0.45, w * 0.55, 0, 0, Math.PI * 2); g.fill(); break;
    case 'wavy':
      g.moveTo(cx - w, cy); g.quadraticCurveTo(cx - w * 0.5, cy - w * 0.5, cx, cy); g.quadraticCurveTo(cx + w * 0.5, cy + w * 0.5, cx + w, cy); g.stroke(); break;
    case 'grin':
      g.moveTo(cx - w * 1.1, cy - w * 0.2); g.quadraticCurveTo(cx, cy + w * 1.4, cx + w * 1.1, cy - w * 0.2); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.fillRect(cx - w * 0.9, cy - w * 0.15, w * 1.8, w * 0.35);
      break;
  }
}

const customerFaces: FaceDraw[] = [
  // happy
  (g, s) => { eye(g, s * 0.35, s * 0.45, s * 0.07, s * 0.1); eye(g, s * 0.65, s * 0.45, s * 0.07, s * 0.1); blush(g, s * 0.22, s * 0.6, s * 0.07); blush(g, s * 0.78, s * 0.6, s * 0.07); mouth(g, 'smile', s * 0.5, s * 0.66, s); },
  // neutral
  (g, s) => { eye(g, s * 0.35, s * 0.45, s * 0.065, s * 0.09); eye(g, s * 0.65, s * 0.45, s * 0.065, s * 0.09); mouth(g, 'flat', s * 0.5, s * 0.68, s); },
  // angry
  (g, s) => { eye(g, s * 0.35, s * 0.48, s * 0.065, s * 0.08); eye(g, s * 0.65, s * 0.48, s * 0.065, s * 0.08); brow(g, s * 0.34, s * 0.32, s * 0.08, 0.45, s * 0.04); brow(g, s * 0.66, s * 0.32, s * 0.08, -0.45, s * 0.04); mouth(g, 'frown', s * 0.5, s * 0.7, s); },
  // furious
  (g, s) => {
    g.fillStyle = 'rgba(255,90,95,0.35)'; g.beginPath(); g.ellipse(s * 0.5, s * 0.55, s * 0.4, s * 0.3, 0, 0, Math.PI * 2); g.fill();
    brow(g, s * 0.34, s * 0.34, s * 0.1, 0.6, s * 0.05); brow(g, s * 0.66, s * 0.34, s * 0.1, -0.6, s * 0.05);
    eye(g, s * 0.36, s * 0.49, s * 0.055, s * 0.06); eye(g, s * 0.64, s * 0.49, s * 0.055, s * 0.06);
    mouth(g, 'wavy', s * 0.5, s * 0.7, s);
  },
  // delighted
  (g, s) => { arcEye(g, s * 0.35, s * 0.46, s * 0.07, true); arcEye(g, s * 0.65, s * 0.46, s * 0.07, true); blush(g, s * 0.2, s * 0.6, s * 0.09, 0.75); blush(g, s * 0.8, s * 0.6, s * 0.09, 0.75); mouth(g, 'bigSmile', s * 0.5, s * 0.63, s); },
  // hmph
  (g, s) => {
    brow(g, s * 0.35, s * 0.46, s * 0.08, 0.15, s * 0.045); brow(g, s * 0.65, s * 0.46, s * 0.08, -0.15, s * 0.045);
    blush(g, s * 0.78, s * 0.62, s * 0.1, 0.6);
    mouth(g, 'o', s * 0.44, s * 0.68, s);
  },
  // sad
  (g, s) => { eye(g, s * 0.35, s * 0.47, s * 0.06, s * 0.085); eye(g, s * 0.65, s * 0.47, s * 0.06, s * 0.085); brow(g, s * 0.34, s * 0.33, s * 0.07, -0.35, s * 0.035); brow(g, s * 0.66, s * 0.33, s * 0.07, 0.35, s * 0.035); mouth(g, 'frown', s * 0.5, s * 0.72, s); },
  // wow
  (g, s) => { eye(g, s * 0.34, s * 0.44, s * 0.085, s * 0.12); eye(g, s * 0.66, s * 0.44, s * 0.085, s * 0.12); blush(g, s * 0.2, s * 0.6, s * 0.07); blush(g, s * 0.8, s * 0.6, s * 0.07); mouth(g, 'o', s * 0.5, s * 0.68, s); },
];

const playerFaces: FaceDraw[] = [
  // happy
  (g, s) => { eye(g, s * 0.35, s * 0.46, s * 0.075, s * 0.105); eye(g, s * 0.65, s * 0.46, s * 0.075, s * 0.105); blush(g, s * 0.2, s * 0.6, s * 0.075); blush(g, s * 0.8, s * 0.6, s * 0.075); mouth(g, 'smile', s * 0.5, s * 0.66, s); },
  // focus (shaking): determined grin
  (g, s) => { eye(g, s * 0.35, s * 0.48, s * 0.07, s * 0.07); eye(g, s * 0.65, s * 0.48, s * 0.07, s * 0.07); brow(g, s * 0.34, s * 0.35, s * 0.08, 0.3, s * 0.04); brow(g, s * 0.66, s * 0.35, s * 0.08, -0.3, s * 0.04); blush(g, s * 0.2, s * 0.62, s * 0.07); blush(g, s * 0.8, s * 0.62, s * 0.07); mouth(g, 'grin', s * 0.5, s * 0.66, s); },
  // wow (perfect)
  (g, s) => {
    // star eyes
    for (const x of [0.34, 0.66]) {
      g.fillStyle = palette.uiAccent2; g.strokeStyle = INK; g.lineWidth = s * 0.02;
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? s * 0.045 : s * 0.11, a = -Math.PI / 2 + (i * Math.PI) / 5;
        g.lineTo(s * x + Math.cos(a) * r, s * 0.46 + Math.sin(a) * r);
      }
      g.closePath(); g.fill(); g.stroke();
    }
    blush(g, s * 0.18, s * 0.62, s * 0.08, 0.7); blush(g, s * 0.82, s * 0.62, s * 0.08, 0.7);
    mouth(g, 'bigSmile', s * 0.5, s * 0.64, s);
  },
  // strain
  (g, s) => { g.strokeStyle = INK; g.lineWidth = s * 0.045; g.lineCap = 'round'; for (const [x, d] of [[0.35, 1], [0.65, -1]] as const) { g.beginPath(); g.moveTo(s * (x - 0.07 * d), s * 0.4); g.lineTo(s * (x + 0.05 * d), s * 0.46); g.lineTo(s * (x - 0.07 * d), s * 0.52); g.stroke(); } mouth(g, 'wavy', s * 0.5, s * 0.68, s); },
  // delighted
  (g, s) => { arcEye(g, s * 0.35, s * 0.46, s * 0.075, true); arcEye(g, s * 0.65, s * 0.46, s * 0.075, true); blush(g, s * 0.2, s * 0.6, s * 0.09, 0.75); blush(g, s * 0.8, s * 0.6, s * 0.09, 0.75); mouth(g, 'bigSmile', s * 0.5, s * 0.63, s); },
  // oops
  (g, s) => { eye(g, s * 0.35, s * 0.46, s * 0.06, s * 0.1); eye(g, s * 0.65, s * 0.46, s * 0.06, s * 0.1); mouth(g, 'wavy', s * 0.5, s * 0.69, s); },
  // sweat
  (g, s) => { eye(g, s * 0.35, s * 0.47, s * 0.065, s * 0.09); eye(g, s * 0.65, s * 0.47, s * 0.065, s * 0.09); brow(g, s * 0.34, s * 0.34, s * 0.07, -0.3, s * 0.035); brow(g, s * 0.66, s * 0.34, s * 0.07, 0.3, s * 0.035); mouth(g, 'grin', s * 0.5, s * 0.67, s); },
  // blink
  (g, s) => { arcEye(g, s * 0.35, s * 0.47, s * 0.07, false); arcEye(g, s * 0.65, s * 0.47, s * 0.07, false); blush(g, s * 0.2, s * 0.6, s * 0.075); blush(g, s * 0.8, s * 0.6, s * 0.075); mouth(g, 'smile', s * 0.5, s * 0.66, s); },
];

function faceAtlas(draws: FaceDraw[]): THREE.CanvasTexture {
  const cell = 128;
  const [c, g] = canvas(cell * FACE_COLS, cell * FACE_ROWS);
  draws.forEach((d, i) => {
    g.save();
    g.translate((i % FACE_COLS) * cell, Math.floor(i / FACE_COLS) * cell);
    d(g, cell);
    g.restore();
  });
  const t = tex(c);
  t.generateMipmaps = true;
  return t;
}

let _cust: THREE.CanvasTexture | null = null, _player: THREE.CanvasTexture | null = null;
export function customerFaceAtlas(): THREE.CanvasTexture { return (_cust ??= faceAtlas(customerFaces)); }
export function playerFaceAtlas(): THREE.CanvasTexture { return (_player ??= faceAtlas(playerFaces)); }

// ---- Particle sprites ------------------------------------------------------------
export const SPRITE = { circle: 0, sparkle: 1, drop: 2, puff: 3, confetti: 4, heart: 5, anger: 6, storm: 7, sweat: 8, streak: 9, ring: 10, star: 11, note: 12, coin: 13, bubble: 14, square: 15 } as const;
export const SPRITE_COLS = 4, SPRITE_ROWS = 4;

let _sprites: THREE.CanvasTexture | null = null;
export function spriteAtlas(): THREE.CanvasTexture {
  if (_sprites) return _sprites;
  const cell = 64;
  const [c, g] = canvas(cell * SPRITE_COLS, cell * SPRITE_ROWS);
  const at = (i: number, f: (g: CanvasRenderingContext2D, s: number) => void) => {
    g.save();
    g.translate((i % SPRITE_COLS) * cell, Math.floor(i / SPRITE_COLS) * cell);
    f(g, cell);
    g.restore();
  };
  const W = '#ffffff';
  at(SPRITE.circle, (g, s) => { g.fillStyle = W; g.beginPath(); g.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2); g.fill(); });
  at(SPRITE.sparkle, (g, s) => {
    g.fillStyle = W; g.beginPath();
    for (let i = 0; i < 8; i++) { const r = i % 2 ? s * 0.1 : s * 0.46, a = (i * Math.PI) / 4; g.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r); }
    g.closePath(); g.fill();
  });
  at(SPRITE.drop, (g, s) => { g.fillStyle = W; g.beginPath(); g.moveTo(s / 2, s * 0.08); g.quadraticCurveTo(s * 0.85, s * 0.6, s / 2, s * 0.9); g.quadraticCurveTo(s * 0.15, s * 0.6, s / 2, s * 0.08); g.fill(); });
  at(SPRITE.puff, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s * 0.48);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.6, 'rgba(255,255,255,0.7)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  });
  at(SPRITE.confetti, (g, s) => { g.fillStyle = W; g.fillRect(s * 0.3, s * 0.15, s * 0.4, s * 0.7); });
  at(SPRITE.heart, (g, s) => {
    g.fillStyle = W; g.beginPath(); g.moveTo(s / 2, s * 0.85);
    g.bezierCurveTo(s * 0.05, s * 0.5, s * 0.15, s * 0.1, s / 2, s * 0.32);
    g.bezierCurveTo(s * 0.85, s * 0.1, s * 0.95, s * 0.5, s / 2, s * 0.85); g.fill();
  });
  at(SPRITE.anger, (g, s) => {
    g.strokeStyle = W; g.lineWidth = s * 0.12; g.lineCap = 'round';
    for (const [a, b, c2, d] of [[0.3, 0.15, 0.42, 0.38], [0.7, 0.15, 0.58, 0.38], [0.3, 0.85, 0.42, 0.62], [0.7, 0.85, 0.58, 0.62]]) {
      g.beginPath(); g.moveTo(s * a, s * b); g.quadraticCurveTo(s * 0.5, s * 0.5, s * c2, s * d); g.stroke();
    }
  });
  at(SPRITE.storm, (g, s) => {
    g.fillStyle = W;
    for (const [x, y, r] of [[0.3, 0.45, 0.2], [0.52, 0.35, 0.24], [0.72, 0.47, 0.19], [0.5, 0.55, 0.22]]) { g.beginPath(); g.arc(s * x, s * y, s * r, 0, Math.PI * 2); g.fill(); }
  });
  at(SPRITE.sweat, (g, s) => { g.fillStyle = W; g.beginPath(); g.moveTo(s * 0.5, s * 0.1); g.quadraticCurveTo(s * 0.9, s * 0.7, s * 0.5, s * 0.9); g.quadraticCurveTo(s * 0.1, s * 0.7, s * 0.5, s * 0.1); g.fill(); g.fillStyle = 'rgba(0,0,0,0)'; });
  at(SPRITE.streak, (g, s) => {
    const grd = g.createLinearGradient(0, 0, s, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, s * 0.42, s, s * 0.16);
  });
  at(SPRITE.ring, (g, s) => { g.strokeStyle = W; g.lineWidth = s * 0.08; g.beginPath(); g.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2); g.stroke(); });
  at(SPRITE.star, (g, s) => {
    g.fillStyle = W; g.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.2 : s * 0.46, a = -Math.PI / 2 + (i * Math.PI) / 5; g.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r); }
    g.closePath(); g.fill();
  });
  at(SPRITE.note, (g, s) => { g.fillStyle = W; g.beginPath(); g.ellipse(s * 0.38, s * 0.72, s * 0.16, s * 0.12, -0.4, 0, Math.PI * 2); g.fill(); g.fillRect(s * 0.48, s * 0.15, s * 0.07, s * 0.58); g.fillRect(s * 0.48, s * 0.15, s * 0.28, s * 0.1); });
  at(SPRITE.coin, (g, s) => { g.fillStyle = W; g.beginPath(); g.ellipse(s / 2, s / 2, s * 0.3, s * 0.42, 0, 0, Math.PI * 2); g.fill(); });
  at(SPRITE.bubble, (g, s) => { g.strokeStyle = W; g.lineWidth = s * 0.06; g.beginPath(); g.arc(s / 2, s / 2, s * 0.38, 0, Math.PI * 2); g.stroke(); g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(s * 0.38, s * 0.38, s * 0.08, 0, Math.PI * 2); g.fill(); });
  at(SPRITE.square, (g, s) => { g.fillStyle = W; g.fillRect(s * 0.18, s * 0.18, s * 0.64, s * 0.64); });
  _sprites = tex(c);
  return _sprites;
}

// ---- Ground and signs ------------------------------------------------------------
export function tileTexture(a: string, b: string, line: string, tiles = 4, px = 256): THREE.CanvasTexture {
  const [c, g] = canvas(px, px);
  const s = px / tiles;
  for (let y = 0; y < tiles; y++) for (let x = 0; x < tiles; x++) {
    g.fillStyle = (x + y) % 2 ? a : b;
    g.fillRect(x * s, y * s, s, s);
  }
  g.strokeStyle = line;
  g.lineWidth = 3;
  for (let i = 0; i <= tiles; i++) {
    g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, px); g.stroke();
    g.beginPath(); g.moveTo(0, i * s); g.lineTo(px, i * s); g.stroke();
  }
  return tex(c, { repeat: true });
}

export function signTexture(text: string, opts: { bg: string; fg: string; w?: number; h?: number; stroke?: string; font?: number } = { bg: '#fff', fg: '#000' }): THREE.CanvasTexture {
  const w = opts.w ?? 512, h = opts.h ?? 128;
  const [c, g] = canvas(w, h);
  g.fillStyle = opts.bg;
  g.fillRect(0, 0, w, h);
  g.font = `900 ${opts.font ?? Math.round(h * 0.62)}px ${fonts.family}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (opts.stroke) { g.lineWidth = h * 0.08; g.strokeStyle = opts.stroke; g.lineJoin = 'round'; g.strokeText(text, w / 2, h / 2 + h * 0.04); }
  g.fillStyle = opts.fg;
  g.fillText(text, w / 2, h / 2 + h * 0.04);
  return tex(c);
}

export function stripeTexture(a: string, b: string, stripes = 8, px = 256): THREE.CanvasTexture {
  const [c, g] = canvas(px, 8);
  const s = px / stripes;
  for (let i = 0; i < stripes; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * s, 0, s, 8); }
  return tex(c, { repeat: true });
}
