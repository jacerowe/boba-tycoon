// Advisory frame-time measurement on a real GPU (CI only has software WebGL, so this is manual).
// For each scene: main-thread busy ms/frame unthrottled (the steadier number), then frame
// times with 4x CPU throttling (a mid-range-phone proxy). Each scene runs `runs` times and the
// best run is kept, because background load on a dev machine only ever makes numbers worse.
// Usage: node scripts/perf.mjs [baseUrl] [runs]   Record the results in docs/DECISIONS.md.
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:4391/boba-tycoon/';
const runs = +(process.argv[3] ?? 3);
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });

const SCENES = {
  'cart, bot playing': async () => {},
  'busiest: rush + 20 customers + 12-cup stack': async (page) => {
    await page.evaluate(() => window.__boba.skipTo('bottlenecks'));
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
  },
  'tiny shop, bot playing': async (page) => {
    await page.evaluate(() => window.__boba.skipTo('shop'));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__boba.game.reveal.skip());
  },
};

const frameStats = (page, sec) => page.evaluate((s) => new Promise((resolve) => {
  const ft = [];
  let last = performance.now();
  const t0 = last;
  const tick = (now) => {
    ft.push(now - last);
    last = now;
    if (now - t0 < s * 1000) return requestAnimationFrame(tick);
    ft.sort((a, b) => a - b);
    const q = (p) => +ft[Math.min(ft.length - 1, Math.floor(p * ft.length))].toFixed(1);
    const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
    const r = window.__boba.game.view.renderer.info.render;
    resolve({ fps: +(1000 / avg).toFixed(1), p50: q(0.5), p95: q(0.95), p99: q(0.99), calls: r.calls, tris: r.triangles });
  };
  requestAnimationFrame(tick);
}), sec);

async function once(name, setup) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto(`${base}?nosave=1&seed=5&autostart=1&debug=1`);
  await page.waitForFunction(() => !!window.__boba?.game?.started, undefined, { timeout: 30000 });
  await setup(page);
  await page.evaluate(() => { window.__boba.game.showFps(false); window.__boba.bot('competent'); });
  await page.waitForTimeout(3000);
  // Unthrottled: main-thread busy time per frame from a CPU profile.
  const plain = await frameStats(page, 2);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  await page.waitForTimeout(4000);
  const { profile } = await cdp.send('Profiler.stop');
  const byId = new Map(profile.nodes.map((n) => [n.id, n.callFrame.functionName]));
  let idle = 0, total = 0;
  profile.samples.forEach((id, i) => { const d = profile.timeDeltas[i] ?? 0; total += d; if (byId.get(id) === '(idle)') idle += d; });
  const busyMs = +(((total - idle) / total) * (1000 / plain.fps)).toFixed(2);
  // 4x CPU throttle.
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.waitForTimeout(2000);
  const slow = await frameStats(page, 15);
  const gpu = await page.evaluate(() => {
    const g = document.querySelector('canvas').getContext('webgl2');
    const e = g.getExtension('WEBGL_debug_renderer_info');
    return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  await ctx.close();
  return { busyMs, plainFps: plain.fps, slow, gpu };
}

for (const [name, setup] of Object.entries(SCENES)) {
  let best = null;
  for (let i = 0; i < runs; i++) {
    const r = await once(name, setup);
    if (!best || r.slow.p95 < best.slow.p95) best = { ...r, busyMs: Math.min(r.busyMs, best?.busyMs ?? Infinity) };
    else best.busyMs = Math.min(best.busyMs, r.busyMs);
  }
  const s = best.slow;
  console.log(`${name}\n  unthrottled: main thread ${best.busyMs} ms/frame at ${best.plainFps} fps\n  4x CPU:      ${s.fps} fps, p50 ${s.p50} / p95 ${s.p95} / p99 ${s.p99} ms, ${s.calls} calls, ${(s.tris / 1000).toFixed(1)}k tris\n  GPU: ${best.gpu}`);
}
await browser.close();
