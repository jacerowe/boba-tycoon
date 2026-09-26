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

async function mode(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { __boba: { input(): { mode: string } } }).__boba.input().mode);
}

async function joystickTo(page: Page, target: { x: number; z: number }, radius = 0.5): Promise<void> {
  const vp = page.viewportSize()!;
  const cx = vp.width / 2, cy = vp.height * 0.72;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const t0 = Date.now();
  try {
    while (Date.now() - t0 < 12_000) {
      // Passing the shaker/sealer mid-recipe enters shake/seal mode: lift and press again, like a player.
      if ((await mode(page)) !== 'normal') {
        await page.mouse.up();
        await page.waitForTimeout(100);
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        continue;
      }
      const s = await state(page);
      const p = s.world.player.pos;
      const dx = target.x - p.x, dz = target.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < radius) return;
      const k = Math.min(1, d / 1.2);
      await page.mouse.move(cx + (dx / d) * 52 * Math.max(0.4, k), cy + (dz / d) * 52 * Math.max(0.4, k), { steps: 2 });
      await page.waitForTimeout(40);
    }
    const s = await state(page);
    throw new Error('joystick did not reach target ' + JSON.stringify({ target, pos: s.world.player.pos, task: s.world.player.task?.kind, mi: s.world.player.moveInput }));
  } finally {
    await page.mouse.up();
  }
}

async function keysTo(page: Page, target: { x: number; z: number }, radius = 0.5): Promise<void> {
  const held = new Set<string>();
  const set = async (want: Set<string>) => {
    for (const k of held) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  };
  const t0 = Date.now();
  try {
    while (Date.now() - t0 < 12_000) {
      const s = await state(page);
      const p = s.world.player.pos;
      const dx = target.x - p.x, dz = target.z - p.z;
      if (Math.hypot(dx, dz) < radius) return;
      const want = new Set<string>();
      if (Math.abs(dx) > radius * 0.5) want.add(dx > 0 ? 'd' : 'a');
      if (Math.abs(dz) > radius * 0.5) want.add(dz > 0 ? 's' : 'w');
      await set(want);
      await page.waitForTimeout(30);
    }
    const s = await state(page);
    throw new Error('keys did not reach target ' + JSON.stringify({ target, pos: s.world.player.pos, task: s.world.player.task?.kind, mi: s.world.player.moveInput }));
  } finally {
    await set(new Set());
  }
}

test.describe('M1 input: every method reaches every station', () => {
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
    for (const id of RING) {
      await joystickTo(page, CENTER, 0.6);
      await joystickTo(page, await servicePoint(page, id), 0.55);
    }
  });

  test('WASD', async ({ page }) => {
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
