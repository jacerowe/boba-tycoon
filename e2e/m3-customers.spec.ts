import { test, expect, type Page } from '@playwright/test';
import { boot, state, waitFor, act, hook, errorsOf } from './util';

// M3: living customers and the stack.

async function setup(page: Page): Promise<void> {
  await boot(page);
  await hook(page, 'skipTo', 'bottlenecks');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const g = (window as any).__boba.game;
    g.sim.world.events.lockUntil = 1e9; // no random rushes during these checks
    g.sim.world.customers = [];
    g.sim.world.spawnT = 1e9;
  });
}

test('a neglected customer gets angry and walks out', async ({ page }) => {
  await setup(page);
  await act(page, 'command', { type: 'DebugSpawn', count: 1 });
  const s0 = await waitFor(page, (s) => s.world.customers.some((c: any) => c.phase === 'queued'), 20_000);
  const id = s0.world.customers.find((c: any) => c.phase === 'queued').id;
  await hook(page, 'setTimeScale', 8);
  const moods = new Set<number>([s0.world.customers.find((c: any) => c.id === id).mood]);
  // Fast-forward until angry, then watch the walkout at normal speed (checked in-page, per frame).
  await page.waitForFunction((cid) => (window as any).__boba.game.sim.world.customers.some((c: any) => c.id === cid && c.mood >= 2), id, { timeout: 60_000 });
  await hook(page, 'setTimeScale', 1);
  // Freeze the sim a beat after the walkout (in-page) so the screenshot catches the hmph + storm cloud.
  await page.evaluate(() => new Promise<void>((resolve) => {
    const g = (window as any).__boba.game;
    const check = () => {
      if (g.eventLog.some((e: any) => e.type === 'Walkout')) { setTimeout(() => { g.debugScale = 0; resolve(); }, 300); return; }
      requestAnimationFrame(check);
    };
    check();
  }));
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'docs/screenshots/m3/phone-walkout.png' });
  await hook(page, 'setTimeScale', 1);
  const evs = await hook<{ type: string; customerId?: number; mood?: number }[]>(page, 'events');
  for (const e of evs) if (e.type === 'PatienceChanged' && e.customerId === id) moods.add(e.mood!);
  expect([...moods].sort()).toEqual([0, 1, 2, 3]);
  await waitFor(page, (s) => !s.world.customers.some((c: any) => c.id === id), 30_000);
  expect(errorsOf(page)).toEqual([]);
});

for (const cups of [2, 5, 12]) {
  test(`the stack wobbles with ${cups} cups`, async ({ page }) => {
    await setup(page);
    await page.evaluate((n) => {
      const b = (window as any).__boba;
      b.actions.command({ type: 'DebugGiveUpgrade', upgradeId: 'carryTray' });
      b.game.sim.world.player.capacity = 12;
      b.actions.command({ type: 'DebugFillStack', count: n });
    }, cups);
    await waitFor(page, (s) => s.world.player.stack.length === cups, 5000);
    await page.waitForTimeout(700);
    // Sample the top cup's offset from the player while walking and stopping.
    const offsets: number[] = [];
    await act(page, 'moveTo', { x: -2.2, z: 1.3 });
    for (let i = 0; i < 16; i++) {
      offsets.push(await page.evaluate(() => {
        const v = (window as any).__boba.game.view;
        const ms = v.player.stackMatrices;
        const top = ms[Math.max(0, v.player.stackMatrices.length - 1)];
        const pos = { x: top.elements[12], z: top.elements[14] };
        const r = v.player.root.position;
        return Math.hypot(pos.x - r.x, pos.z - r.z);
      }));
      if (i === 5) await page.screenshot({ path: `docs/screenshots/m3/phone-stack${cups}.png` });
      await page.waitForTimeout(70);
    }
    const spread = Math.max(...offsets) - Math.min(...offsets);
    expect(spread).toBeGreaterThan(0.01); // it sways...
    const s = await state(page);
    expect(s.world.player.stack.length).toBe(cups); // ...but never falls
  });
}

test('20 customers + a rush + a 12-cup stack stay inside the render budget', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const b = (window as any).__boba;
    b.actions.command({ type: 'DebugGiveUpgrade', upgradeId: 'carryTray' });
    b.game.sim.world.player.capacity = 12;
    b.actions.command({ type: 'DebugFillStack', count: 12 });
    b.actions.command({ type: 'DebugSpawn', count: 20 });
    b.game.sim.world.events.lockUntil = 0;
    b.triggerRush();
    b.setTimeScale(3);
  });
  await waitFor(page, (s) => s.world.events.active?.phase === 'active', 15_000);
  await page.waitForTimeout(1500);
  const p = await hook<{ calls: number; triangles: number; textures: number }>(page, 'perf');
  const s = await state(page);
  console.log('busiest scene', JSON.stringify(p), 'customers', s.world.customers.length);
  expect(s.world.customers.length).toBeGreaterThanOrEqual(20);
  expect(p.calls).toBeLessThanOrEqual(120);
  expect(p.triangles).toBeLessThanOrEqual(150_000);
  expect(p.textures).toBeLessThanOrEqual(24);
  await page.screenshot({ path: 'docs/screenshots/m3/phone-busy.png' });
});
