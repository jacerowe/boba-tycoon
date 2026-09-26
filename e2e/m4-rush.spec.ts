import { test, expect } from '@playwright/test';
import { boot, state, waitFor, hook, errorsOf } from './util';

// M4: the practice Drink Rush plays warning → GO GO GO → combos → results card → claim.
test('practice rush: warning, slam, combo, results card, claim', async ({ page }) => {
  test.setTimeout(240_000);
  await boot(page);
  await hook(page, 'skipTo', 'carryTray');
  await page.waitForTimeout(300);
  await page.evaluate(() => (window as any).__boba.actions.command({ type: 'DebugGiveUpgrade', upgradeId: 'carryTray' }));
  await hook(page, 'skipTo', 'practiceRush');
  // Warning: banner + flicker, no speed-up yet.
  // Freeze the clock the moment the warning starts so a slow machine can't slide into the active phase first.
  await page.waitForFunction(() => {
    const b = (window as any).__boba;
    if (b.game.sim.world.events.active?.phase !== 'warning') return false;
    b.setTimeScale(0);
    return true;
  }, undefined, { timeout: 20_000, polling: 'raf' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/screenshots/m4/phone-rush-warning.png' });
  let s = await state(page);
  expect(s.world.events.active?.phase).toBe('warning');
  expect(s.world.mods.worldSpeed).toBe(1);
  await hook(page, 'setTimeScale', 1);
  // Let the bot play the rush.
  await hook(page, 'bot', 'competent');
  await page.waitForFunction(() => (window as any).__boba.game.sim.world.events.active?.phase === 'active', undefined, { timeout: 20_000, polling: 'raf' });
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'docs/screenshots/m4/phone-rush-go.png' });
  await page.waitForFunction(() => (window as any).__boba.game.sim.world.mods.worldSpeed > 1.3, undefined, { timeout: 10_000, polling: 'raf' });
  await page.waitForFunction(() => (window as any).__boba.game.sim.world.combo.tier >= 2, undefined, { timeout: 90_000, polling: 'raf' });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'docs/screenshots/m4/phone-rush-combo.png' });
  // Stop the bot so the results card stays up for us to see and claim by hand.
  await hook(page, 'bot', null);
  await hook(page, 'setTimeScale', 3);
  await page.waitForFunction(() => !!(window as any).__boba.game.sim.world.events.awaitingClaim, undefined, { timeout: 90_000, polling: 'raf' });
  await hook(page, 'setTimeScale', 1);
  const claim = page.locator('.modal .btn', { hasText: 'Claim' });
  await expect(claim).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'docs/screenshots/m4/phone-rush-results.png' });
  const results = (await state(page)).world.events.awaitingClaim;
  expect(results.bestMult).toBeGreaterThanOrEqual(3);
  const cash0 = (await state(page)).world.wallets.w1.cash;
  await claim.click({ force: true }); // it pulses forever, so it's never 'stable'
  s = await waitFor(page, (st) => !st.world.events.awaitingClaim, 10_000);
  expect(s.world.wallets.w1.cash).toBeGreaterThan(cash0);
  await waitFor(page, (st) => st.world.director.beat === 'bottlenecks', 10_000);
  expect(errorsOf(page)).toEqual([]);
});
