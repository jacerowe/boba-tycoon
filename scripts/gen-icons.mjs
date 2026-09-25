// Generates the web-manifest icon PNGs from code (no external art).
// A chunky boba cup drawn with signed-distance shapes, encoded with node:zlib.
// Run: npm run icons  (output is committed to public/)
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const C = {
  bg: hex('#ffd9b8'), bg2: hex('#ffb38a'), outline: hex('#4a2545'), cup: hex('#fff4ea'),
  tea: hex('#d9a36e'), teaDark: hex('#c47f45'), pearl: hex('#3a2418'), straw: hex('#ff6f91'),
  lid: hex('#ffe9f0'), shine: hex('#ffffff'),
};

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// SDF helpers in unit space (0..1)
const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
function sdRoundBox(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
// Tapered cup: wider at top.
function sdCup(x, y) {
  const top = 0.34, bottom = 0.86;
  const t = Math.min(1, Math.max(0, (y - top) / (bottom - top)));
  const hw = 0.25 - 0.05 * t;
  return sdRoundBox(x, y, 0.5, (top + bottom) / 2, hw, (bottom - top) / 2, 0.07);
}
function sdStraw(x, y) {
  // rotated rounded rect
  const a = -0.2, cx = 0.56, cy = 0.24;
  const dx = x - cx, dy = y - cy;
  const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
  return sdRoundBox(rx, ry, 0, 0, 0.045, 0.19, 0.04);
}
const pearls = [[0.4, 0.78], [0.5, 0.8], [0.6, 0.78], [0.45, 0.72], [0.56, 0.71], [0.36, 0.7], [0.64, 0.7], [0.5, 0.66]];

function shade(x, y, outlineW) {
  // background: rounded square gradient
  let col = [...C.bg];
  const g = y;
  col = col.map((c, i) => c + (C.bg2[i] - c) * g * 0.8);
  const layers = [];
  const straw = sdStraw(x, y), cup = sdCup(x, y), lid = sdRoundBox(x, y, 0.5, 0.35, 0.27, 0.035, 0.03);
  layers.push([straw, C.straw]);
  layers.push([cup, (() => {
    if (y < 0.44) return C.cup;
    // liquid
    let c = y > 0.62 ? C.teaDark : C.tea;
    for (const [px, py] of pearls) if (sdCircle(x, y, px, py, 0.042) < 0) c = C.pearl;
    if (sdRoundBox(x, y, 0.36, 0.55, 0.025, 0.08, 0.02) < 0) c = C.shine;
    return c;
  })()]);
  layers.push([lid, C.lid]);
  for (const [d, c] of layers) {
    if (d < 0) col = c;
    else if (d < outlineW) col = C.outline;
  }
  // re-apply outline on top of union edges
  const u = Math.min(straw, cup, lid);
  if (u > 0 && u < outlineW) col = C.outline;
  return col;
}

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const ss = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const x = (px + (sx + 0.5) / ss) / size, y = (py + (sy + 0.5) / ss) / size;
        const c = shade(x, y, 0.028);
        r += c[0]; g += c[1]; b += c[2];
      }
      const i = (py * size + px) * 4, n = ss * ss;
      buf[i] = r / n; buf[i + 1] = g / n; buf[i + 2] = b / n; buf[i + 3] = 255;
    }
  }
  return png(size, size, buf);
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), render(size));
  console.log(`wrote public/icon-${size}.png`);
}
