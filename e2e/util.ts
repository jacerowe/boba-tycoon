import type { Page } from '@playwright/test';

export async function boot(page: Page, params = ''): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  (page as unknown as { __errors: string[] }).__errors = errors;
  await page.goto(`./?debug=1&nosave=1&autostart=1&seed=3${params ? '&' + params : ''}`);
  await page.waitForFunction(() => !!(window as unknown as { __boba?: unknown }).__boba, undefined, { timeout: 30_000 });
}

export function errorsOf(page: Page): string[] {
  return (page as unknown as { __errors: string[] }).__errors ?? [];
}

type S = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function state(page: Page): Promise<S> {
  return page.evaluate(() => (window as unknown as { __boba: { getState(): unknown } }).__boba.getState());
}

export async function hook<T>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(([f, a]) => {
    const b = (window as unknown as { __boba: Record<string, (...x: unknown[]) => unknown> }).__boba;
    return b[f as string](...(a as unknown[])) as T;
  }, [fn, args] as const);
}

export async function act(page: Page, fn: string, ...args: unknown[]): Promise<void> {
  await page.evaluate(([f, a]) => {
    const b = (window as unknown as { __boba: { actions: Record<string, (...x: unknown[]) => unknown> } }).__boba;
    b.actions[f as string](...(a as unknown[]));
  }, [fn, args] as const);
}

export async function waitFor(page: Page, pred: (s: S) => boolean, timeout = 30_000): Promise<S> {
  const t0 = Date.now();
  let s: S;
  while (Date.now() - t0 < timeout) {
    s = await state(page);
    if (pred(s)) return s;
    await page.waitForTimeout(60);
  }
  throw new Error('waitFor timed out');
}

/** Screen position of a station's body (for taps). */
export async function stationXY(page: Page, id: string): Promise<{ x: number; y: number }> {
  const p = await page.evaluate((sid) => (window as unknown as { __boba: { stationScreen(i: string): { x: number; y: number } | null } }).__boba.stationScreen(sid), id);
  if (!p) throw new Error('no station ' + id);
  return p;
}

/** Screen position of a world point. */
export async function worldXY(page: Page, x: number, z: number, y = 0): Promise<{ x: number; y: number }> {
  return page.evaluate(([a, b, c]) => (window as unknown as { __boba: { project(x: number, y: number, z: number): { x: number; y: number } } }).__boba.project(a, c, b), [x, z, y] as const);
}

export function serviceOf(s: S, id: string): { x: number; z: number } {
  return s.__service?.[id];
}

export async function servicePoint(page: Page, id: string): Promise<{ x: number; z: number }> {
  return page.evaluate((sid) => {
    const g = (window as unknown as { __boba: { game: { sim: { slot(i: string): { service: { x: number; z: number } } } } } }).__boba.game;
    return g.sim.slot(sid).service;
  }, id);
}

export function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Dispatch a synthetic back-and-forth pointer trace in-page with real timing (works on
 * Chromium and WebKit, where page.touchscreen can only tap).
 */
export async function swipe(page: Page, opts: { reversalsPerSec: number; durationSec: number; amplitudePx: number; axis?: 'x' | 'y' }): Promise<void> {
  await page.evaluate((o) => new Promise<void>((resolve) => {
    const cx = innerWidth / 2, cy = innerHeight * 0.6;
    const t0 = performance.now();
    const freq = o.reversalsPerSec / 2;
    const target = document.querySelector('#app') as HTMLElement;
    target.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true }));
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      const off = Math.sin(2 * Math.PI * freq * t) * o.amplitudePx;
      const x = o.axis === 'y' ? cx : cx + off, y = o.axis === 'y' ? cy + off : cy;
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true }));
      if (t < o.durationSec) setTimeout(tick, 8);
      else {
        window.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true }));
        resolve();
      }
    };
    tick();
  }), opts);
}

/** Tap at a screen point with a synthetic pointer (down + up). */
export async function tapAt(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(([px, py]) => {
    const target = document.querySelector('#app') as HTMLElement;
    const init = { clientX: px, clientY: py, bubbles: true, pointerId: 3, pointerType: 'touch', isPrimary: true };
    target.dispatchEvent(new PointerEvent('pointerdown', init));
    window.dispatchEvent(new PointerEvent('pointerup', init));
  }, [x, y] as const);
}
