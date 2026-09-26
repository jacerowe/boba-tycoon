import { test, expect, type Page } from '@playwright/test';
import { boot, state, waitFor, act, swipe, tapAt, errorsOf } from './util';

// M2: real (synthetic-dispatch) swipes produce OK, GREAT and PERFECT; a tap seals; the wallet increments.

async function inputMode(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { __boba: { input(): { mode: string } } }).__boba.input().mode);
}

async function waitMode(page: Page, mode: string, timeout = 20_000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if ((await inputMode(page)) === mode) return;
    await page.waitForTimeout(40);
  }
  throw new Error('mode ' + mode + ' not reached');
}

/** Walk the recipe up to the shaker using the test hook (M1 covers real movement input). */
async function toShaker(page: Page): Promise<void> {
  await waitFor(page, (s) => s.world.customers.some((c: { phase: string }) => c.phase === 'queued'), 30_000);
  await act(page, 'moveTo', 'cup');
  await waitFor(page, (s) => !!s.world.player.held && s.world.player.held.next >= 1 && !s.world.player.task, 15_000);
  for (let guard = 0; guard < 8; guard++) {
    const s = await state(page);
    const held = s.world.player.held;
    const recipe = await page.evaluate((id) => (window as unknown as { __boba: { game: { reg: { recipe(i: string): { steps: string[] } } } } }).__boba.game.reg.recipe(id).steps, held.recipeId);
    const step = recipe[held.next];
    if (step === 'shake') break;
    const station = await page.evaluate((st) => (window as unknown as { __boba: { game: { sim: { stationForStep(x: string): string } } } }).__boba.game.sim.stationForStep(st), step);
    await act(page, 'moveTo', station);
    await waitFor(page, (st) => st.world.player.held && st.world.player.held.next > held.next && !st.world.player.task, 15_000);
  }
  await act(page, 'moveTo', 'shaker');
  await waitMode(page, 'shake');
}

async function sealAndServe(page: Page): Promise<number> {
  await act(page, 'moveTo', 'sealer');
  await waitMode(page, 'seal');
  const vp = page.viewportSize()!;
  await tapAt(page, vp.width / 2, vp.height / 2);
  await waitFor(page, (s) => s.world.player.stack.length >= 1 && s.world.player.stack.every((d: { sealed: boolean }) => d.sealed), 5000);
  const before = (await state(page)).world.wallets.w1.cash;
  await act(page, 'serve');
  await waitFor(page, (s) => s.world.player.stack.length === 0, 15_000);
  const after = (await state(page)).world.wallets.w1.cash;
  return after - before;
}

test('M2: swipes make OK, GREAT and PERFECT drinks; tap seals; wallet goes up', async ({ page }) => {
  test.setTimeout(240_000);
  await boot(page);
  // PERFECT: on-tempo ~5.5 reversals/s.
  await toShaker(page);
  await page.waitForTimeout(150);
  await swipe(page, { reversalsPerSec: 5.6, durationSec: 2.1, amplitudePx: 60 });
  let s = await waitFor(page, (st) => st.world.player.task?.kind !== 'shake', 6000);
  expect(s.world.player.held.quality).toBe('perfect');
  await page.screenshot({ path: 'docs/screenshots/m2/phone-perfect.png' });
  const earned1 = await sealAndServe(page);
  expect(earned1).toBeGreaterThan(0);

  // GREAT: a decent but slower shake (normal thresholds now).
  await act(page, 'command', { type: 'DebugSpawn', count: 2 });
  await toShaker(page);
  await page.waitForTimeout(150);
  await swipe(page, { reversalsPerSec: 3.4, durationSec: 2.3, amplitudePx: 60 });
  s = await waitFor(page, (st) => st.world.player.task?.kind !== 'shake', 6000);
  expect(s.world.player.held.quality).toBe('great');
  expect(await sealAndServe(page)).toBeGreaterThan(0);

  // OK: do nothing. The shake always resolves.
  await toShaker(page);
  s = await waitFor(page, (st) => st.world.player.task?.kind !== 'shake', 8000);
  expect(s.world.player.held.quality).toBe('ok');
  expect(await sealAndServe(page)).toBeGreaterThan(0);
  expect(errorsOf(page)).toEqual([]);
});
