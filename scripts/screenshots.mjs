// Curated screenshot set for docs/screenshots/<milestone>/<viewport>-<beat>.png
// Usage: node scripts/screenshots.mjs [baseUrl] [milestone] [scene,scene...]
//   baseUrl defaults to the local preview: http://localhost:4391/boba-tycoon/
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4391/boba-tycoon/';
const milestone = process.argv[3] ?? 'm6';
const only = process.argv[4] ? new Set(process.argv[4].split(',')) : null;
const out = `docs/screenshots/${milestone}`;
mkdirSync(out, { recursive: true });

const VIEWPORTS = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function scene(vpName, name, params, steps) {
  if (only && !only.has(name)) return;
  const ctx = await browser.newContext(VIEWPORTS[vpName]);
  const page = await ctx.newPage();
  await page.goto(`${base}?nosave=1&seed=4&autostart=1${params}`);
  await page.waitForFunction(() => !!window.__boba || !!window.__lineupReady, undefined, { timeout: 30000 });
  // The test hook needs ?debug=1; the FPS box it brings is hidden for the docs shots.
  await page.evaluate(() => window.__boba?.game.showFps(false));
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
    // Drop into slow-mo on the very tick the drink lands (polling is too slow under software
    // rendering), let the coin burst spread a little, then freeze with the coins in the air.
    await p.evaluate(() => {
      const g = window.__boba.game;
      const orig = g.onEvents.bind(g);
      g.onEvents = (evs) => {
        orig(evs);
        if (evs.some((e) => e.type === 'CustomerServed')) { g.bot = null; g.debugScale = 0.15; }
      };
      window.__boba.bot('competent');
      window.__boba.setTimeScale(2);
    });
    await until(p, () => window.__boba.game.debugScale < 1);
    await p.waitForTimeout(700);
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
    await p.evaluate(() => window.__boba.actions.moveTo({ x: 0.9, z: 1.3 })); // open floor, clear of stations
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
  // Ingredients run low: the pearl pot is nearly empty and asks for a refill.
  await scene(vp, 'low-stock', '&debug=1', async (p) => {
    await p.evaluate(() => { const b = window.__boba; b.skipTo('bottlenecks'); });
    await p.waitForTimeout(300);
    await p.evaluate(() => { const s = window.__boba.game.sim.stationState('pearls'); s.stock = 0; });
    await p.waitForTimeout(3000); // let the beat's callout card clear
  });
  // Settings: toggles, hold-to-reset and the build hash.
  await scene(vp, 'settings', '&debug=1', async (p) => {
    await p.locator('.btn-round.gear').click();
    await p.waitForTimeout(700);
  });
  // The finished shop.
  await scene(vp, 'shop', '&debug=1', async (p) => {
    await p.evaluate(() => { const b = window.__boba; b.skipTo('shop'); });
    await p.waitForTimeout(400);
    await p.evaluate(() => { const b = window.__boba; b.game.reveal.skip(); b.actions.command({ type: 'DebugSpawn', count: 6 }); b.setTimeScale(3); });
    await p.waitForTimeout(3000);
    await p.evaluate(() => window.__boba.setTimeScale(1));
    await p.waitForTimeout(3000); // let floating words and the welcome card fade
  });
}
await browser.close();
