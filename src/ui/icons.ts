// Procedural icon set (canvas). Icons over text so a kid can play without reading.
// Shared by the DOM UI (data URLs) and the 3D world (canvas textures).
import { palette } from '../config/style';

type G = CanvasRenderingContext2D;
const INK = palette.ink;

function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function fillStroke(g: G, fill: string, lw: number): void {
  g.fillStyle = fill; g.fill();
  g.lineWidth = lw; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke();
}
function circle(g: G, x: number, y: number, r: number, fill: string, lw: number): void {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); fillStroke(g, fill, lw);
}
function star(g: G, x: number, y: number, r: number, fill: string, lw: number, inner = 0.45): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr2 = i % 2 ? r * inner : r, a = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
  }
  g.closePath(); fillStroke(g, fill, lw);
}
/** A little boba cup. */
function cup(g: G, s: number, liquid: string, opts: { pearls?: boolean; lid?: boolean; straw?: string; x?: number; y?: number; scale?: number } = {}): void {
  g.save();
  g.translate((opts.x ?? 0.5) * s, (opts.y ?? 0.55) * s);
  const k = opts.scale ?? 1;
  g.scale(k, k);
  const lw = s * 0.06;
  if (opts.straw) { g.save(); g.rotate(0.2); rr(g, -s * 0.05, -s * 0.52, s * 0.1, s * 0.4, s * 0.04); fillStroke(g, opts.straw, lw * 0.8); g.restore(); }
  g.beginPath();
  g.moveTo(-s * 0.24, -s * 0.28); g.lineTo(s * 0.24, -s * 0.28); g.lineTo(s * 0.18, s * 0.34); g.quadraticCurveTo(0, s * 0.4, -s * 0.18, s * 0.34); g.closePath();
  g.fillStyle = '#ffffff'; g.fill();
  g.save(); g.clip();
  g.fillStyle = liquid; g.fillRect(-s * 0.3, -s * 0.14, s * 0.6, s * 0.6);
  if (opts.pearls) { g.fillStyle = palette.pearl; for (const [px, py] of [[-0.1, 0.27], [0.02, 0.29], [0.13, 0.26], [-0.04, 0.2], [0.08, 0.19]]) { g.beginPath(); g.arc(px * s, py * s, s * 0.05, 0, Math.PI * 2); g.fill(); } }
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(-s * 0.17, -s * 0.2, s * 0.05, s * 0.4);
  g.restore();
  g.lineWidth = lw; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke();
  if (opts.lid) { rr(g, -s * 0.27, -s * 0.33, s * 0.54, s * 0.08, s * 0.03); fillStroke(g, palette.lidFilm, lw * 0.8); }
  g.restore();
}
function face(g: G, s: number, mood: number): void {
  const colors = ['#ffe07a', '#ffe9a8', '#ffb36b', '#ff6b6b'];
  circle(g, s / 2, s / 2, s * 0.42, colors[mood], s * 0.06);
  g.fillStyle = INK; g.strokeStyle = INK; g.lineCap = 'round'; g.lineWidth = s * 0.06;
  const ey = s * 0.44;
  if (mood >= 2) {
    g.beginPath(); g.moveTo(s * 0.26, s * 0.3); g.lineTo(s * 0.42, s * 0.37); g.stroke();
    g.beginPath(); g.moveTo(s * 0.74, s * 0.3); g.lineTo(s * 0.58, s * 0.37); g.stroke();
  }
  g.beginPath(); g.ellipse(s * 0.36, ey, s * 0.045, s * 0.07, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(s * 0.64, ey, s * 0.045, s * 0.07, 0, 0, Math.PI * 2); g.fill();
  g.beginPath();
  if (mood === 0) g.arc(s / 2, s * 0.55, s * 0.16, 0.2 * Math.PI, 0.8 * Math.PI);
  else if (mood === 1) { g.moveTo(s * 0.38, s * 0.66); g.lineTo(s * 0.62, s * 0.66); }
  else if (mood === 2) g.arc(s / 2, s * 0.78, s * 0.14, 1.2 * Math.PI, 1.8 * Math.PI);
  else { g.moveTo(s * 0.35, s * 0.7); g.quadraticCurveTo(s * 0.42, s * 0.62, s * 0.5, s * 0.7); g.quadraticCurveTo(s * 0.58, s * 0.78, s * 0.65, s * 0.7); }
  g.stroke();
}
function badge(g: G, s: number, text: string, color: string = palette.uiAccent): void {
  circle(g, s * 0.76, s * 0.76, s * 0.2, color, s * 0.05);
  g.fillStyle = '#fff'; g.font = `900 ${Math.round(s * 0.24)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, s * 0.76, s * 0.775);
}
function bolt(g: G, s: number, x: number, y: number, k: number, fill: string = palette.uiAccent2): void {
  g.save(); g.translate(x * s, y * s); g.scale(k, k);
  g.beginPath(); g.moveTo(s * 0.05, -s * 0.2); g.lineTo(-s * 0.1, s * 0.03); g.lineTo(0, s * 0.03); g.lineTo(-s * 0.05, s * 0.2); g.lineTo(s * 0.12, -s * 0.04); g.lineTo(s * 0.01, -s * 0.04); g.closePath();
  fillStroke(g, fill, s * 0.045);
  g.restore();
}

const DRAW: Record<string, (g: G, s: number) => void> = {
  coin: (g, s) => { circle(g, s / 2, s / 2, s * 0.4, palette.coin, s * 0.07); g.beginPath(); g.arc(s / 2, s / 2, s * 0.26, 0, Math.PI * 2); g.strokeStyle = palette.coinEdge; g.lineWidth = s * 0.06; g.stroke(); g.fillStyle = palette.coinEdge; g.font = `900 ${s * 0.36}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', s / 2, s * 0.52); },
  star: (g, s) => star(g, s / 2, s / 2 + s * 0.03, s * 0.44, palette.uiAccent2, s * 0.07),
  starEmpty: (g, s) => star(g, s / 2, s / 2 + s * 0.03, s * 0.44, '#e9d7dd', s * 0.07),
  heart: (g, s) => { g.beginPath(); g.moveTo(s / 2, s * 0.85); g.bezierCurveTo(s * 0.05, s * 0.5, s * 0.15, s * 0.1, s / 2, s * 0.32); g.bezierCurveTo(s * 0.85, s * 0.1, s * 0.95, s * 0.5, s / 2, s * 0.85); fillStroke(g, palette.heart, s * 0.07); },
  clock: (g, s) => { circle(g, s / 2, s / 2, s * 0.4, '#ffffff', s * 0.07); g.strokeStyle = INK; g.lineWidth = s * 0.07; g.lineCap = 'round'; g.beginPath(); g.moveTo(s / 2, s / 2); g.lineTo(s / 2, s * 0.28); g.moveTo(s / 2, s / 2); g.lineTo(s * 0.66, s * 0.58); g.stroke(); },
  faceHappy: (g, s) => face(g, s, 0),
  faceNeutral: (g, s) => face(g, s, 1),
  faceAngry: (g, s) => face(g, s, 2),
  faceFurious: (g, s) => face(g, s, 3),
  storm: (g, s) => {
    g.beginPath(); for (const [x, y, r] of [[0.32, 0.45, 0.17], [0.52, 0.36, 0.21], [0.7, 0.47, 0.16], [0.5, 0.52, 0.18]]) g.arc(s * x, s * y, s * r, 0, Math.PI * 2);
    g.fillStyle = palette.storm; g.fill();
    bolt(g, s, 0.52, 0.72, 0.9);
  },
  cup: (g, s) => cup(g, s, '#ffffff'),
  tea: (g, s) => cup(g, s, palette.tea),
  milk: (g, s) => {
    rr(g, s * 0.3, s * 0.25, s * 0.4, s * 0.62, s * 0.12); fillStroke(g, '#ffffff', s * 0.06);
    rr(g, s * 0.36, s * 0.12, s * 0.28, s * 0.16, s * 0.05); fillStroke(g, '#7fb6e8', s * 0.06);
    g.fillStyle = INK; g.beginPath(); g.ellipse(s * 0.45, s * 0.55, s * 0.06, s * 0.05, 0, 0, Math.PI * 2); g.fill();
  },
  pearls: (g, s) => { for (const [x, y] of [[0.35, 0.62], [0.55, 0.64], [0.45, 0.45], [0.65, 0.46], [0.28, 0.44]]) circle(g, s * x, s * y, s * 0.12, palette.pearl, s * 0.05); g.fillStyle = '#fff8'; g.beginPath(); g.arc(s * 0.42, s * 0.41, s * 0.03, 0, 7); g.fill(); },
  popping: (g, s) => { for (const [x, y] of [[0.35, 0.62], [0.58, 0.64], [0.46, 0.43], [0.68, 0.44], [0.26, 0.42]]) circle(g, s * x, s * y, s * 0.12, palette.popping, s * 0.05); g.fillStyle = '#fff9'; for (const [x, y] of [[0.32, 0.58], [0.43, 0.39]]) { g.beginPath(); g.arc(s * x, s * y, s * 0.035, 0, 7); g.fill(); } },
  ice: (g, s) => { g.save(); g.translate(s / 2, s / 2); g.rotate(0.3); rr(g, -s * 0.24, -s * 0.24, s * 0.48, s * 0.48, s * 0.1); fillStroke(g, palette.ice, s * 0.07); g.fillStyle = '#fff'; rr(g, -s * 0.14, -s * 0.16, s * 0.1, s * 0.16, s * 0.04); g.fill(); g.restore(); },
  jelly: (g, s) => { const c = palette.jelly; [[0.34, 0.6, 0], [0.62, 0.6, 1], [0.48, 0.36, 2]].forEach(([x, y, i]) => { rr(g, s * (x - 0.13), s * (y - 0.13), s * 0.26, s * 0.26, s * 0.06); fillStroke(g, c[i], s * 0.05); }); },
  taro: (g, s) => { g.beginPath(); g.ellipse(s / 2, s * 0.58, s * 0.34, s * 0.24, 0, 0, Math.PI * 2); fillStroke(g, palette.taro, s * 0.07); g.beginPath(); g.ellipse(s * 0.42, s * 0.5, s * 0.1, s * 0.06, -0.4, 0, Math.PI * 2); g.fillStyle = '#d7c1ff'; g.fill(); },
  shake: (g, s) => {
    g.save(); g.translate(s / 2, s / 2); g.rotate(-0.25);
    rr(g, -s * 0.16, -s * 0.3, s * 0.32, s * 0.6, s * 0.1); fillStroke(g, palette.metal, s * 0.07);
    rr(g, -s * 0.13, -s * 0.38, s * 0.26, s * 0.12, s * 0.05); fillStroke(g, palette.metalDark, s * 0.06);
    g.restore();
    g.strokeStyle = INK; g.lineWidth = s * 0.06; g.lineCap = 'round';
    for (const x of [0.12, 0.88]) { g.beginPath(); g.moveTo(s * x, s * 0.35); g.lineTo(s * x, s * 0.65); g.stroke(); }
  },
  seal: (g, s) => {
    rr(g, s * 0.2, s * 0.14, s * 0.6, s * 0.2, s * 0.06); fillStroke(g, palette.sealerPress, s * 0.06);
    g.fillStyle = INK; g.fillRect(s * 0.46, s * 0.34, s * 0.08, s * 0.12);
    cup(g, s, palette.milkTea, { y: 0.72, scale: 0.7, lid: true });
  },
  serve: (g, s) => { cup(g, s, palette.milkTea, { pearls: true, lid: true, straw: palette.strawColors[0], x: 0.42, y: 0.58, scale: 0.85 }); circle(g, s * 0.78, s * 0.74, s * 0.15, palette.coin, s * 0.05); },
  bin: (g, s) => { rr(g, s * 0.28, s * 0.3, s * 0.44, s * 0.55, s * 0.08); fillStroke(g, palette.binBody, s * 0.06); rr(g, s * 0.22, s * 0.2, s * 0.56, s * 0.12, s * 0.05); fillStroke(g, '#5f94c8', s * 0.06); },
  tray: (g, s) => { g.beginPath(); g.ellipse(s / 2, s * 0.74, s * 0.4, s * 0.1, 0, 0, Math.PI * 2); fillStroke(g, palette.cartTrim, s * 0.06); cup(g, s, palette.tea, { x: 0.36, y: 0.46, scale: 0.55, lid: true }); cup(g, s, palette.milkTea, { x: 0.64, y: 0.46, scale: 0.55, lid: true }); },
  carry3: (g, s) => { DRAW.tray(g, s); badge(g, s, '3'); },
  carry5: (g, s) => { DRAW.tray(g, s); badge(g, s, '5'); },
  carry8: (g, s) => { DRAW.tray(g, s); badge(g, s, '8'); },
  carry12: (g, s) => { DRAW.tray(g, s); badge(g, s, '12'); },
  fastPour: (g, s) => { cup(g, s, palette.tea, { x: 0.42, scale: 0.9 }); bolt(g, s, 0.76, 0.3, 1.1); },
  fastSeal: (g, s) => { DRAW.seal(g, s); bolt(g, s, 0.8, 0.3, 1.0); },
  bigPot: (g, s) => { rr(g, s * 0.16, s * 0.36, s * 0.68, s * 0.46, s * 0.1); fillStroke(g, '#6b4a6e', s * 0.06); for (const [x, y] of [[0.32, 0.36], [0.46, 0.3], [0.6, 0.35], [0.72, 0.3], [0.38, 0.26]]) circle(g, s * x, s * y, s * 0.08, palette.pearl, s * 0.035); badge(g, s, '+', palette.uiGood); },
  bench: (g, s) => { rr(g, s * 0.12, s * 0.46, s * 0.76, s * 0.12, s * 0.04); fillStroke(g, palette.cartWood, s * 0.06); rr(g, s * 0.12, s * 0.26, s * 0.76, s * 0.12, s * 0.04); fillStroke(g, palette.cartWood, s * 0.06); for (const x of [0.2, 0.74]) { rr(g, s * x, s * 0.56, s * 0.07, s * 0.26, s * 0.03); fillStroke(g, palette.cartWheel, s * 0.05); } },
  shop: (g, s) => {
    rr(g, s * 0.16, s * 0.38, s * 0.68, s * 0.46, s * 0.05); fillStroke(g, palette.shopWall, s * 0.06);
    g.beginPath(); g.moveTo(s * 0.1, s * 0.42); g.lineTo(s * 0.5, s * 0.14); g.lineTo(s * 0.9, s * 0.42); g.closePath(); fillStroke(g, palette.shopRoof, s * 0.06);
    rr(g, s * 0.42, s * 0.58, s * 0.16, s * 0.26, s * 0.03); fillStroke(g, palette.cartMint, s * 0.05);
    rr(g, s * 0.22, s * 0.5, s * 0.14, s * 0.12, s * 0.03); fillStroke(g, '#bfe6ff', s * 0.04);
    rr(g, s * 0.64, s * 0.5, s * 0.14, s * 0.12, s * 0.03); fillStroke(g, '#bfe6ff', s * 0.04);
  },
  tea2: (g, s) => { cup(g, s, palette.tea, { x: 0.36, scale: 0.75 }); cup(g, s, palette.tea, { x: 0.66, scale: 0.75 }); badge(g, s, '2'); },
  autoRefill: (g, s) => { DRAW.pearls(g, s); g.strokeStyle = palette.uiGood; g.lineWidth = s * 0.08; g.lineCap = 'round'; g.beginPath(); g.arc(s / 2, s / 2, s * 0.42, -0.3, Math.PI * 1.3); g.stroke(); },
  shoes: (g, s) => { g.beginPath(); g.moveTo(s * 0.16, s * 0.66); g.quadraticCurveTo(s * 0.18, s * 0.36, s * 0.38, s * 0.36); g.lineTo(s * 0.5, s * 0.5); g.quadraticCurveTo(s * 0.86, s * 0.52, s * 0.86, s * 0.7); g.lineTo(s * 0.16, s * 0.72); g.closePath(); fillStroke(g, palette.uiAccent, s * 0.06); rr(g, s * 0.14, s * 0.7, s * 0.74, s * 0.08, s * 0.03); fillStroke(g, '#ffffff', s * 0.05); bolt(g, s, 0.3, 0.26, 0.7); },
  seats: (g, s) => { for (const x of [0.3, 0.7]) { rr(g, s * (x - 0.15), s * 0.42, s * 0.3, s * 0.1, s * 0.04); fillStroke(g, palette.seat, s * 0.05); rr(g, s * (x - 0.03), s * 0.52, s * 0.06, s * 0.26, s * 0.02); fillStroke(g, palette.cartWheel, s * 0.04); } },
  queue: (g, s) => { for (const [x, c] of [[0.22, palette.shirts[0]], [0.5, palette.shirts[1]], [0.78, palette.shirts[2]]] as const) { circle(g, s * x, s * 0.38, s * 0.1, palette.skin[1], s * 0.04); rr(g, s * (x - 0.1), s * 0.5, s * 0.2, s * 0.28, s * 0.08); fillStroke(g, c, s * 0.04); } badge(g, s, '+', palette.uiGood); },
  gear: (g, s) => {
    g.save(); g.translate(s / 2, s / 2);
    g.beginPath();
    for (let i = 0; i < 16; i++) { const r = i % 2 ? s * 0.3 : s * 0.4; const a = (i * Math.PI) / 8; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); fillStroke(g, '#ffffff', s * 0.07);
    g.beginPath(); g.arc(0, 0, s * 0.12, 0, Math.PI * 2); fillStroke(g, palette.uiAccent2, s * 0.06);
    g.restore();
  },
  music: (g, s) => { g.fillStyle = INK; g.beginPath(); g.ellipse(s * 0.32, s * 0.72, s * 0.13, s * 0.1, -0.4, 0, 7); g.fill(); g.beginPath(); g.ellipse(s * 0.7, s * 0.64, s * 0.13, s * 0.1, -0.4, 0, 7); g.fill(); g.fillRect(s * 0.4, s * 0.22, s * 0.07, s * 0.5); g.fillRect(s * 0.78, s * 0.14, s * 0.07, s * 0.5); g.beginPath(); g.moveTo(s * 0.4, s * 0.22); g.lineTo(s * 0.85, s * 0.14); g.lineTo(s * 0.85, s * 0.26); g.lineTo(s * 0.4, s * 0.34); g.fill(); },
  sfx: (g, s) => { g.beginPath(); g.moveTo(s * 0.14, s * 0.4); g.lineTo(s * 0.3, s * 0.4); g.lineTo(s * 0.5, s * 0.22); g.lineTo(s * 0.5, s * 0.78); g.lineTo(s * 0.3, s * 0.6); g.lineTo(s * 0.14, s * 0.6); g.closePath(); fillStroke(g, '#ffffff', s * 0.06); g.strokeStyle = INK; g.lineWidth = s * 0.06; g.lineCap = 'round'; g.beginPath(); g.arc(s * 0.52, s / 2, s * 0.16, -0.8, 0.8); g.stroke(); g.beginPath(); g.arc(s * 0.52, s / 2, s * 0.3, -0.8, 0.8); g.stroke(); },
  haptics: (g, s) => { rr(g, s * 0.32, s * 0.16, s * 0.36, s * 0.68, s * 0.08); fillStroke(g, '#ffffff', s * 0.06); g.strokeStyle = INK; g.lineWidth = s * 0.05; g.lineCap = 'round'; for (const x of [0.18, 0.82]) { g.beginPath(); g.moveTo(s * x, s * 0.36); g.lineTo(s * (x + (x < 0.5 ? -0.05 : 0.05)), s * 0.44); g.lineTo(s * x, s * 0.52); g.lineTo(s * (x + (x < 0.5 ? -0.05 : 0.05)), s * 0.6); g.stroke(); } },
  motion: (g, s) => { circle(g, s * 0.36, s / 2, s * 0.16, palette.uiAccent, s * 0.06); g.strokeStyle = INK; g.lineWidth = s * 0.06; g.lineCap = 'round'; for (const y of [0.36, 0.5, 0.64]) { g.beginPath(); g.moveTo(s * 0.6, s * y); g.lineTo(s * 0.86, s * y); g.stroke(); } },
  reset: (g, s) => { g.strokeStyle = INK; g.lineWidth = s * 0.09; g.lineCap = 'round'; g.beginPath(); g.arc(s / 2, s * 0.54, s * 0.28, -Math.PI * 0.3, Math.PI * 1.35); g.stroke(); g.beginPath(); g.moveTo(s * 0.62, s * 0.12); g.lineTo(s * 0.7, s * 0.3); g.lineTo(s * 0.5, s * 0.33); g.closePath(); g.fillStyle = INK; g.fill(); },
  close: (g, s) => { g.strokeStyle = INK; g.lineWidth = s * 0.12; g.lineCap = 'round'; g.beginPath(); g.moveTo(s * 0.28, s * 0.28); g.lineTo(s * 0.72, s * 0.72); g.moveTo(s * 0.72, s * 0.28); g.lineTo(s * 0.28, s * 0.72); g.stroke(); },
  check: (g, s) => { g.strokeStyle = palette.uiGood; g.lineWidth = s * 0.14; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(s * 0.22, s * 0.52); g.lineTo(s * 0.42, s * 0.72); g.lineTo(s * 0.8, s * 0.3); g.stroke(); },
  play: (g, s) => { g.beginPath(); g.moveTo(s * 0.34, s * 0.22); g.lineTo(s * 0.78, s * 0.5); g.lineTo(s * 0.34, s * 0.78); g.closePath(); fillStroke(g, palette.uiGood, s * 0.07); },
  hand: (g, s) => {
    g.save(); g.translate(s * 0.5, s * 0.5); g.rotate(-0.3);
    rr(g, -s * 0.08, -s * 0.38, s * 0.16, s * 0.42, s * 0.08); fillStroke(g, '#ffffff', s * 0.06);
    rr(g, -s * 0.2, -s * 0.04, s * 0.42, s * 0.36, s * 0.14); fillStroke(g, '#ffffff', s * 0.06);
    g.restore();
  },
  menu: (g, s) => { rr(g, s * 0.2, s * 0.14, s * 0.6, s * 0.72, s * 0.08); fillStroke(g, '#4a3b4e', s * 0.06); cup(g, s, palette.milkTea, { x: 0.5, y: 0.46, scale: 0.45, lid: true }); g.fillStyle = '#fff6ea'; g.fillRect(s * 0.3, s * 0.68, s * 0.4, s * 0.05); },
  lock: (g, s) => { rr(g, s * 0.24, s * 0.44, s * 0.52, s * 0.4, s * 0.08); fillStroke(g, palette.uiAccent2, s * 0.06); g.strokeStyle = INK; g.lineWidth = s * 0.08; g.beginPath(); g.arc(s / 2, s * 0.44, s * 0.16, Math.PI, 0); g.stroke(); },
  fire: (g, s) => { g.beginPath(); g.moveTo(s / 2, s * 0.1); g.quadraticCurveTo(s * 0.9, s * 0.5, s * 0.72, s * 0.78); g.quadraticCurveTo(s / 2, s * 0.95, s * 0.28, s * 0.78); g.quadraticCurveTo(s * 0.12, s * 0.5, s * 0.36, s * 0.34); g.quadraticCurveTo(s * 0.4, s * 0.5, s * 0.46, s * 0.5); g.quadraticCurveTo(s * 0.4, s * 0.3, s / 2, s * 0.1); fillStroke(g, '#ff8a4a', s * 0.06); g.beginPath(); g.ellipse(s / 2, s * 0.7, s * 0.12, s * 0.16, 0, 0, 7); g.fillStyle = palette.uiAccent2; g.fill(); },
  trophy: (g, s) => { rr(g, s * 0.28, s * 0.16, s * 0.44, s * 0.36, s * 0.14); fillStroke(g, palette.uiAccent2, s * 0.06); rr(g, s * 0.44, s * 0.5, s * 0.12, s * 0.16, s * 0.02); fillStroke(g, palette.uiAccent2, s * 0.05); rr(g, s * 0.3, s * 0.66, s * 0.4, s * 0.12, s * 0.04); fillStroke(g, palette.cartWood, s * 0.05); },
  bolt: (g, s) => bolt(g, s, 0.5, 0.5, 1.9),
  arrowUp: (g, s) => { g.beginPath(); g.moveTo(s / 2, s * 0.14); g.lineTo(s * 0.82, s * 0.5); g.lineTo(s * 0.62, s * 0.5); g.lineTo(s * 0.62, s * 0.84); g.lineTo(s * 0.38, s * 0.84); g.lineTo(s * 0.38, s * 0.5); g.lineTo(s * 0.18, s * 0.5); g.closePath(); fillStroke(g, palette.uiAccent, s * 0.06); },
  construction: (g, s) => { rr(g, s * 0.12, s * 0.3, s * 0.76, s * 0.4, s * 0.05); fillStroke(g, palette.uiAccent2, s * 0.06); g.save(); g.beginPath(); rr(g, s * 0.12, s * 0.3, s * 0.76, s * 0.4, s * 0.05); g.clip(); g.fillStyle = INK; for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(s * (0.1 + i * 0.2), s * 0.7); g.lineTo(s * (0.22 + i * 0.2), s * 0.3); g.lineTo(s * (0.3 + i * 0.2), s * 0.3); g.lineTo(s * (0.18 + i * 0.2), s * 0.7); g.fill(); } g.restore(); },
};

export const ICON_NAMES = Object.keys(DRAW);

const canvasCache = new Map<string, HTMLCanvasElement>();
const urlCache = new Map<string, string>();

export function iconCanvas(name: string, size = 96): HTMLCanvasElement {
  const key = name + '@' + size;
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  (DRAW[name] ?? DRAW.star)(g, size);
  canvasCache.set(key, c);
  return c;
}

export function iconUrl(name: string, size = 96): string {
  const key = name + '@' + size;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const url = iconCanvas(name, size).toDataURL('image/png');
  urlCache.set(key, url);
  return url;
}

/** An <img> element for an icon. */
export function iconImg(name: string, cls = 'icon', size = 96): HTMLImageElement {
  const img = document.createElement('img');
  img.src = iconUrl(name, size);
  img.className = cls;
  img.alt = '';
  img.draggable = false;
  return img;
}

/** Icon name for a recipe step. */
export function stepIcon(step: string): string {
  return DRAW[step] ? step : 'cup';
}
