// Curated screenshot set for docs/screenshots/<milestone>/<viewport>-<beat>.png
// Usage: node scripts/screenshots.mjs [baseUrl] [milestone]
//   baseUrl defaults to the local preview: http://localhost:4391/boba-tycoon/
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4391/boba-tycoon/';
const milestone = process.argv[3] ?? 'm6';
const out = `docs/screenshots/${milestone}`;
mkdirSync(out, { recursive: true });

const VIEWPORTS = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function scene(vpName, name, params, steps) {
  const ctx = await browser.newContext(VIEWPORTS[vpName]);
  const page = await ctx.newPage();
  await page.goto(`${base}?nosave=1&seed=4&autostart=1${params}`);
  await page.waitForFunction(() => !!window.__boba || !!window.__lineupReady, undefined, { timeout: 30000 });
  await page.waitForTimeout(1200);
  if (steps) await steps(page);
  await page.screenshot({ path: `${out}/${vpName}-${name}.png` });
  console.log('saved', `${out}/${vpName}-${name}.png`);
  await ctx.close();
}

const until = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout, polling: 'raf' });
const freeze = (page) => page.evaluate(() => { window.__boba.game.debugScale = 0; });

for (const vp of ['phone', 'desktop']) {
  await scene(vp, 'drinks', '&lineup=1', async (p) => p.waitForTimeout(1500));
  // First serve: the tutorial customer gets their drink; freeze on the coin burst.
  await scene(vp, 'first-serve', '&debug=1', async (p) => {
    await p.evaluate(() => { window.__boba.bot('competent'); window.__boba.setTimeScale(2); });
    await until(p, () => window.__boba.game.eventLog.some((e) => e.type === 'CustomerServed'));
    await p.evaluate(() => { window.__boba.bot(null); window.__boba.setTimeScale(1); });
    await p.waitForTimeout(250);
    await freeze(p);
  });
  // Shake close-up, mid-shake.
  await scene(vp, 'shake', '&debug=1', async (p) => {
    await p.evaluate(() => { window.__boba.bot('competent'); window.__boba.setTimeScale(2); });
    await until(p, () => window.__boba.game.sim.world.player.task?.kind === 'shake');
    await p.evaluate(() => { window.__boba.bot(null); window.__boba.setTimeScale(1); });
    await p.waitForTimeout(350);
  });
  // A 5+ stack.
  await scene(vp, 'stack', '&debug=1', async (p) => {
    await p.evaluate(() => { const b = window.__boba; b.skipTo('bottlenecks'); });
    await p.waitForTimeout(300);
    await p.evaluate(() => { const b = window.__boba; b.game.sim.world.customers = []; b.game.sim.world.spawnT = 1e9; b.actions.command({ type: 'DebugGiveUpgrade', upgradeId: 'carryTray' }); b.game.sim.world.player.capacity = 8; b.actions.command({ type: 'DebugFillStack', count: 7 }); });
    await p.waitForTimeout(900);
    await p.evaluate(() => window.__boba.actions.moveTo({ x: -2.3, z: 1.4 }));
    await p.waitForTimeout(450);
  });
  // A rush with a combo.
  await scene(vp, 'rush-combo', '&debug=1', async (p) => {
    await p.evaluate(() => { const b = window.__boba; b.skipTo('carryTray'); });
    await p.waitForTimeout(300);
    await p.evaluate(() => { const b = window.__boba; b.actions.command({ type: 'DebugGiveUpgrade', upgradeId: 'carryTray' }); b.skipTo('practiceRush'); b.bot('competent'); });
    await until(p, () => window.__boba.game.sim.world.combo.tier >= 2, undefined, 120000);
    await p.waitForTimeout(200);
    await freeze(p);
  });
  // The menu picker (from the menu board).
  await scene(vp, 'menu-picker', '&debug=1', async (p) => {
    await p.evaluate(() => { const b = window.__boba; b.skipTo('goal'); });
    await p.waitForTimeout(600);
    await p.evaluate(() => { const g = window.__boba.game; g.sim.world.pendingOffer = null; g.modals.close(); g.sim.emit({ type: 'MenuBoardOpened' }); });
    await p.waitForTimeout(700);
  });
  // The reveal: pulled back over the street.
  await scene(vp, 'reveal', '&debug=1', async (p) => {
    await p.evaluate(() => { const b = window.__boba; b.skipTo('goal'); b.actions.command({ type: 'DebugAddCash', amount: 600 }); });
    await p.waitForTimeout(800);
    await p.evaluate(() => window.__boba.actions.buy('tinyShop'));
    const R = await p.evaluate(() => window.__boba.game.reveal.total);
    // Advance the reveal deterministically to the pull-back hold.
    await p.evaluate((t) => { const g = window.__boba.game; g.reveal.update(t); }, R - 2.6);
    await p.waitForTimeout(300);
  });
  // The finished shop.
  await scene(vp, 'shop', '&debug=1', async (p) => {
    await p.evaluate(() => { const b = window.__boba; b.skipTo('shop'); });
    await p.waitForTimeout(400);
    await p.evaluate(() => { const b = window.__boba; b.game.reveal.skip(); b.actions.command({ type: 'DebugSpawn', count: 6 }); b.setTimeScale(3); });
    await p.waitForTimeout(3000);
    await p.evaluate(() => window.__boba.setTimeScale(1));
  });
}
await browser.close();
