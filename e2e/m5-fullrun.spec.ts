import { test, expect } from '@playwright/test';
import { boot, hook, errorsOf } from './util';
import { writeFileSync, mkdirSync } from 'node:fs';

const BEAT_ORDER = ['firstOrder', 'impatient', 'scriptedWalkout', 'carryTray', 'practiceRush', 'bottlenecks', 'secondTopping', 'goal', 'reveal', 'shop'];

// M5: a fresh save reaches the Tiny Shop (rendered, raised timeScale, Chromium phone),
// hitting every beat in order. Also records a filmstrip contact sheet for review.
test('fresh save → Tiny Shop, every beat in order', async ({ page }) => {
  test.setTimeout(900_000);
  await boot(page);
  await hook(page, 'bot', 'competent');
  await hook(page, 'setTimeScale', 8);
  const frames: string[] = [];
  const t0 = Date.now();
  let lastShot = 0;
  for (;;) {
    const s = await page.evaluate(() => {
      const w = (window as any).__boba.game.sim.world;
      return { beat: w.director.beat, time: w.time, revealing: w.revealing };
    });
    if (s.beat === 'shop') break;
    expect(Date.now() - t0).toBeLessThan(840_000);
    if (Date.now() - lastShot > 2000) {
      lastShot = Date.now();
      const buf = await page.screenshot({ type: 'jpeg', quality: 55, scale: 'css' });
      frames.push(buf.toString('base64'));
    }
    await page.waitForTimeout(250);
  }
  const evs = await hook<{ type: string; beat?: string; t: number }[]>(page, 'events');
  const beats = evs.filter((e) => e.type === 'BeatChanged').map((e) => e.beat);
  expect(beats).toEqual(BEAT_ORDER);
  const shopAt = evs.find((e) => e.type === 'StageChanged')!.t;
  console.log(`rendered run reached the Tiny Shop at ${(shopAt / 60).toFixed(2)} game-minutes; ${frames.length} filmstrip frames`);
  // Let the reveal finish on screen, then grab a frame of the shop.
  await page.waitForFunction(() => !(window as any).__boba.game.reveal.active, undefined, { timeout: 120_000 });
  await hook(page, 'bot', null);
  await hook(page, 'setTimeScale', 1);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'docs/screenshots/m5/phone-shop.png' });
  expect(errorsOf(page)).toEqual([]);

  // Contact sheet: every frame, 2s of real time apart (8x game speed).
  const html = `<html><body style="margin:0;background:#2a1830"><canvas id=c></canvas><script>
    const imgs = ${JSON.stringify(frames)};
    const cols = 8, w = 130, h = 282;
    const c = document.getElementById('c');
    c.width = cols * w; c.height = Math.ceil(imgs.length / cols) * h;
    const g = c.getContext('2d');
    let n = 0;
    imgs.forEach((b, i) => { const im = new Image(); im.onload = () => { g.drawImage(im, (i % cols) * w, Math.floor(i / cols) * h, w - 2, h - 2); if (++n === imgs.length) document.title = 'done'; }; im.src = 'data:image/jpeg;base64,' + b; });
  </script></body></html>`;
  const sheet = await page.context().newPage();
  await sheet.setContent(html);
  await sheet.waitForFunction(() => document.title === 'done', undefined, { timeout: 30_000 });
  const png = await sheet.locator('#c').screenshot();
  mkdirSync('docs/screenshots/filmstrip', { recursive: true });
  writeFileSync('docs/screenshots/filmstrip/fullrun.png', png);
});
