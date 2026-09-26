import { test, expect, type Page } from '@playwright/test';
import { boot, state, stationXY, servicePoint, dist, waitFor, tapAt, worldXY, hook, errorsOf } from './util';

// M1: every input method reaches every station; queued routes visit in order; tapping a
// queued station removes it.
const RING = ['cup', 'tea', 'milk', 'pearls', 'shaker', 'sealer', 'bin', 'counter'];
const CENTER = { x: 0, z: 0.9 };

async function reach(page: Page, id: string, timeout = 15_000): Promise<void> {
  const sp = await servicePoint(page, id);
  await waitFor(page, (s) => dist(s.world.player.pos, sp) < 0.8, timeout);
}

async function pos(page: Page): Promise<{ x: number; z: number }> {
  return page.evaluate(() => { const p = (window as any).__boba.game.sim.world.player.pos; return { x: p.x, z: p.z }; });
}

/** A quiet cart: no orders, no rushes, so stations never take over the controls mid-route. */
async function quiet(page: Page): Promise<void> {
  await hook(page, 'skipTo', 'bottlenecks');
  await page.waitForTimeout(300);
  await page.evaluate(() => { const w = (window as any).__boba.game.sim.world; w.customers = []; w.spawnT = 1e9; w.events.lockUntil = 1e9; });
}

/**
 * Steer with short pulses sized to the remaining distance (hold → release → look again), so slow
 * headless frames never make the player overshoot. A player's thumb does the same thing.
 */
async function pulseTo(page: Page, target: { x: number; z: number }, radius: number, push: (dx: number, dz: number) => Promise<void>, release: () => Promise<void>, what: string): Promise<void> {
  // Real DOM input → real InputController → commands → sim, on a frozen clock we step by hand,
  // so slow headless frames can't delay a release and make the player overshoot.
  await hook(page, 'setTimeScale', 0);
  for (let i = 0; i < 80; i++) {
    const p = await pos(page);
    const dx = target.x - p.x, dz = target.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < radius) { await hook(page, 'setTimeScale', 1); return; }
    await push(dx / d, dz / d);
    await hook(page, 'tick', Math.max(2, Math.min(18, Math.round((d / 5.4) * 60 * 0.7))));
    await release();
    await hook(page, 'tick', 4);
  }
  const s = await state(page);
  throw new Error(what + ' did not reach target ' + JSON.stringify({ target, pos: s.world.player.pos, task: s.world.player.task?.kind }));
}

async function joystickTo(page: Page, target: { x: number; z: number }, radius = 0.5): Promise<void> {
  const vp = page.viewportSize()!;
  const cx = vp.width / 2, cy = vp.height * 0.72;
  await pulseTo(page, target, radius, async (ux, uz) => {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + ux * 50, cy + uz * 50, { steps: 3 });
  }, () => page.mouse.up(), 'joystick');
}

async function keysTo(page: Page, target: { x: number; z: number }, radius = 0.5): Promise<void> {
  const held: string[] = [];
  await pulseTo(page, target, radius, async (ux, uz) => {
    if (Math.abs(ux) > 0.38) held.push(ux > 0 ? 'd' : 'a');
    if (Math.abs(uz) > 0.38) held.push(uz > 0 ? 's' : 'w');
    for (const k of held) await page.keyboard.down(k);
  }, async () => { for (const k of held.splice(0)) await page.keyboard.up(k); }, 'keys');
}

test.describe('M1 input: every method reaches every station', () => {
  test.describe.configure({ timeout: 420_000 });
  test.beforeEach(async ({ page }) => {
    await boot(page);
    await hook(page, 'setTimeScale', 2);
  });

  test('tap-to-move (tap a station)', async ({ page }) => {
    for (const id of RING) {
      const p = await stationXY(page, id);
      await tapAt(page, p.x, p.y);
      await reach(page, id);
    }
    expect(errorsOf(page)).toEqual([]);
  });

  test('click-to-move (click the ground)', async ({ page }) => {
    for (const id of RING) {
      const sp = await servicePoint(page, id);
      // Aim a little inward from the service point so we click ground, not the station body.
      const tx = sp.x + (CENTER.x - sp.x) * 0.15, tz = sp.z + (CENTER.z - sp.z) * 0.15;
      const xy = await worldXY(page, tx, tz);
      await page.mouse.click(xy.x, xy.y);
      await reach(page, id);
    }
  });

  test('floating joystick', async ({ page }) => {
    await hook(page, 'setTimeScale', 1);
    await quiet(page);
    for (const id of RING) {
      await joystickTo(page, CENTER, 0.6);
      await joystickTo(page, await servicePoint(page, id), 0.55);
    }
  });

  test('WASD', async ({ page }) => {
    await hook(page, 'setTimeScale', 1);
    await quiet(page);
    for (const id of RING) {
      await keysTo(page, CENTER, 0.6);
      await keysTo(page, await servicePoint(page, id), 0.55);
    }
  });
});

test.describe('M1 route queue', () => {
  test('a queued route visits stations in order', async ({ page }) => {
    await boot(page);
    await hook(page, 'setTimeScale', 0.25);
    for (const id of ['tea', 'milk', 'pearls']) {
      const p = await stationXY(page, id);
      await tapAt(page, p.x, p.y);
      await page.waitForTimeout(40);
    }
    const s0 = await waitFor(page, (s) => s.world.player.route.length === 3, 5000);
    expect(s0.world.player.route.map((r: { id: string }) => r.id)).toEqual(['tea', 'milk', 'pearls']);
    await hook(page, 'setTimeScale', 2);
    const order: string[] = [];
    const sps = { tea: await servicePoint(page, 'tea'), milk: await servicePoint(page, 'milk'), pearls: await servicePoint(page, 'pearls') };
    const t0 = Date.now();
    while (order.length < 3 && Date.now() - t0 < 20_000) {
      const s = await state(page);
      for (const [id, sp] of Object.entries(sps)) if (!order.includes(id) && dist(s.world.player.pos, sp) < 0.8) order.push(id);
      await page.waitForTimeout(30);
    }
    expect(order).toEqual(['tea', 'milk', 'pearls']);
  });

  test('tapping a queued station again removes it', async ({ page }) => {
    await boot(page);
    await hook(page, 'setTimeScale', 0.2);
    const tea = await stationXY(page, 'tea');
    const milk = await stationXY(page, 'milk');
    await tapAt(page, tea.x, tea.y);
    await page.waitForTimeout(60);
    await tapAt(page, milk.x, milk.y);
    await waitFor(page, (s) => s.world.player.route.length === 2, 5000);
    await tapAt(page, milk.x, milk.y);
    const s = await waitFor(page, (st) => st.world.player.route.length === 1, 5000);
    expect(s.world.player.route[0].id).toBe('tea');
  });
});
