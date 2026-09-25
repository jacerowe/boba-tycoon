// Headless screenshot helper for visual review and docs/screenshots.
// Usage: node scripts/shoot.mjs --url "http://localhost:5287/boba-tycoon/?..." --out shot.png
//        [--w 390 --h 844 --dpr 2] [--wait 3000] [--steps steps.mjs] [--eval "js expr"]...
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = { url: '', out: 'shot.png', w: 390, h: 844, dpr: 2, wait: 2500, steps: '', evals: [], touch: true };
for (let i = 0; i < args.length; i++) {
  const k = args[i].replace(/^--/, '');
  const v = args[i + 1];
  if (k === 'eval') { opt.evals.push(v); i++; continue; }
  if (k === 'notouch') { opt.touch = false; continue; }
  opt[k] = ['w', 'h', 'dpr', 'wait'].includes(k) ? Number(v) : v;
  i++;
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: opt.w, height: opt.h }, deviceScaleFactor: opt.dpr, hasTouch: opt.touch, isMobile: opt.touch && opt.w < opt.h });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(opt.url);
await page.waitForTimeout(opt.wait);
for (const e of opt.evals) {
  const r = await page.evaluate(e);
  if (r !== undefined) console.log('eval:', JSON.stringify(r));
}
if (opt.steps) {
  const mod = await import(pathToFileURL(resolve(opt.steps)).href);
  await mod.default(page, opt);
}
mkdirSync(dirname(resolve(opt.out)), { recursive: true });
await page.screenshot({ path: opt.out });
if (errors.length) console.log('ERRORS:', errors.join('\n'));
console.log('saved', opt.out);
await browser.close();
