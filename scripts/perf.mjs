// Advisory frame-time measurement: GPU-enabled Chromium with 4x CPU throttling.
// Usage: node scripts/perf.mjs [baseUrl]   (defaults to the local preview)
// CI can't measure frame time (software WebGL); record these numbers in docs/DECISIONS.md.
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:4391/boba-tycoon/';
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);

async function measure(label, setup, seconds = 20) {
  await page.goto(`${base}?nosave=1&seed=5&autostart=1&debug=1`);
  await page.waitForFunction(() => !!window.__boba?.game?.started, undefined, { timeout: 30000 });
  const gl = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const g = c.getContext('webgl2');
    const ext = g && g.getExtension('WEBGL_debug_renderer_info');
    return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  await setup();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.waitForTimeout(3000);
  // Collect frame times in-page for `seconds`.
  const r = await page.evaluate((sec) => new Promise((resolve) => {
    const ft = [];
    let last = performance.now();
    const t0 = last;
    const tick = (now) => {
      ft.push(now - last);
      last = now;
      if (now - t0 < sec * 1000) requestAnimationFrame(tick);
      else {
        ft.sort((a, b) => a - b);
        const q = (p) => ft[Math.min(ft.length - 1, Math.floor(p * ft.length))];
        const p = window.__boba.perf();
        resolve({ frames: ft.length, fps: +(1000 / (ft.reduce((a, b) => a + b, 0) / ft.length)).toFixed(1), p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), p99: +q(0.99).toFixed(1), calls: p.calls, tris: p.triangles, customers: window.__boba.game.sim.world.customers.length });
      }
    };
    requestAnimationFrame(tick);
  }), seconds);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log(`${label}: ${JSON.stringify(r)}  [${gl}]`);
}

await measure('cart, competent bot playing', async () => {
  await page.evaluate(() => window.__boba.bot('competent'));
});
await measure('busiest: rush + 20 customers + 12-cup stack', async () => {
  await page.evaluate(() => {
    const b = window.__boba;
    b.skipTo('bottlenecks');
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const b = window.__boba;
    b.actions.command({ type: 'DebugGiveUpgrade', upgradeId: 'carryTray' });
    b.game.sim.world.player.capacity = 12;
    b.actions.command({ type: 'DebugFillStack', count: 12 });
    b.actions.command({ type: 'DebugSpawn', count: 20 });
    b.game.sim.world.events.lockUntil = 0;
    b.triggerRush();
  });
  await page.waitForTimeout(5000);
});
await measure('tiny shop, competent bot playing', async () => {
  await page.evaluate(() => window.__boba.skipTo('shop'));
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__boba.game.reveal.skip(); window.__boba.bot('competent'); });
});
await browser.close();
