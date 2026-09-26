import { test, expect, type Page } from '@playwright/test';
import { hook, state, errorsOf } from './util';

// M6: save, resume, corrupt-save recovery, confirmed reset, pause on tab hide.
const KEY = 'bobaTycoon.save.v1';

async function open(page: Page, extra = ''): Promise<void> {
  await page.goto(`./?debug=1&autostart=1&seed=3${extra}`);
  await page.waitForFunction(() => !!(window as any).__boba?.game?.started, undefined, { timeout: 30_000 });
}

function persisted(s: any) {
  const shop = s.world.shops[0];
  return {
    cash: Math.floor(s.world.wallets[shop.walletId].cash),
    stars: +shop.reputation.toFixed(3),
    stage: shop.stageId,
    upgrades: [...shop.upgrades].sort(),
    menu: [...shop.menu].sort(),
    unlocks: s.world.unlocks,
    beat: s.world.director.beat,
  };
}

test('reloading after each beat restores cash, stars, stage, upgrades, menu, unlocks and progress', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await open(page);
  await page.evaluate((k) => localStorage.removeItem(k), KEY);
  await open(page);
  for (const beat of ['impatient', 'carryTray', 'bottlenecks', 'goal', 'shop']) {
    await hook(page, 'skipTo', beat);
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const b = (window as any).__boba;
      b.game.reveal.skip();
      b.actions.command({ type: 'DebugAddCash', amount: 37 });
      b.actions.command({ type: 'DebugSetRep', value: 4.25 });
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => (window as any).__boba.game.save());
    const before = persisted(await state(page));
    await open(page);
    const after = persisted(await state(page));
    expect(after, `after reload at ${beat}`).toEqual(before);
  }
  expect(errors).toEqual([]);
});

test('a corrupt save starts a new game without errors', async ({ page }) => {
  await open(page);
  await page.evaluate((k) => localStorage.setItem(k, '{"schemaVersion": 2, "worlds": oops'), KEY);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await open(page);
  const s = await state(page);
  expect(s.world.director.beat).toBe('firstOrder');
  expect(s.world.wallets.w1.cash).toBe(0);
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ schemaVersion: 2, worlds: {}, activeWorldId: 'nope', profile: {} })), KEY);
  await open(page);
  expect((await state(page)).world.director.beat).toBe('firstOrder');
  expect(errors).toEqual([]);
});

test('reset needs a hold to confirm', async ({ page }) => {
  await open(page, '&nosave=1');
  await hook(page, 'skipTo', 'bottlenecks');
  await page.evaluate(() => (window as any).__boba.actions.command({ type: 'DebugAddCash', amount: 99 }));
  await page.waitForTimeout(300);
  await page.locator('.btn-round.gear').click();
  const reset = page.locator('.modal .btn.hold');
  await expect(reset).toBeVisible();
  // A quick tap does nothing.
  await reset.click({ force: true });
  await page.waitForTimeout(300);
  expect((await state(page)).world.director.beat).toBe('bottlenecks');
  // Holding for ~1.5s resets to a fresh game.
  const box = (await reset.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1900);
  await page.mouse.up();
  await page.waitForFunction(() => (window as any).__boba.game.sim.world.director.beat === 'start', undefined, { timeout: 10_000 });
  // The title waits for a fresh tap: lifting the finger that held Reset doesn't skip it.
  await page.waitForTimeout(500);
  await expect(page.locator('.start')).toBeVisible();
  expect((await state(page)).world.director.beat).toBe('start');
  expect(errorsOf(page)).toEqual([]);
});

test('hiding the tab pauses the sim and showing it resumes', async ({ page }) => {
  await open(page, '&nosave=1');
  const tick = () => page.evaluate(() => (window as any).__boba.game.sim.state.tick as number);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const t0 = await tick();
  await page.waitForTimeout(800);
  expect(await tick()).toBe(t0);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(800);
  expect(await tick()).toBeGreaterThan(t0);
});
