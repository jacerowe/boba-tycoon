// Hidden dev panel: ~ key or a three-finger tap. Sliders, trigger rush, add cash, skip to beat,
// FPS/draw-call overlay, bots, time scale, reset.
import type { Game } from '../game';
import { balance } from '../config/balance';
import { feel } from '../config/feel';
import { getPath, setPath } from '../config/overrides';
import { BEATS } from '../data/beats';

const KNOBS: { label: string; obj: 'balance' | 'feel'; path: string; min: number; max: number; step: number }[] = [
  { label: 'Rush speed', obj: 'balance', path: 'rush.speedMult', min: 1, max: 2.5, step: 0.05 },
  { label: 'Rush spawn', obj: 'balance', path: 'rush.spawnMult', min: 1, max: 5, step: 0.1 },
  { label: 'Patience cart (s)', obj: 'balance', path: 'patience.baseSec.cart', min: 10, max: 90, step: 1 },
  { label: 'Traffic cart /min', obj: 'balance', path: 'traffic.perMinute.cart', min: 1, max: 15, step: 0.2 },
  { label: 'Shop price', obj: 'balance', path: 'upgrades.tinyShop.cost', min: 50, max: 1000, step: 5 },
  { label: 'Move speed', obj: 'feel', path: 'move.speed', min: 2, max: 10, step: 0.1 },
  { label: 'Shake window (s)', obj: 'feel', path: 'shake.windowSec', min: 0.8, max: 3, step: 0.05 },
  { label: 'Shake PERFECT at', obj: 'feel', path: 'shake.perfectAt', min: 4, max: 14, step: 1 },
  { label: 'Camera pitch', obj: 'feel', path: 'camera.pitchDeg', min: 35, max: 80, step: 1 },
  { label: 'Combo timer (s)', obj: 'balance', path: 'combo.timerSec', min: 3, max: 15, step: 0.5 },
];

export function installDevPanel(game: Game, root: HTMLElement): { toggle(): void } {
  const panel = document.createElement('div');
  panel.className = 'dev';
  root.appendChild(panel);
  const h = (t: string) => { const e = document.createElement('h4'); e.textContent = t; panel.appendChild(e); };
  const btn = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', fn);
    panel.appendChild(b);
    return b;
  };
  h('Actions');
  btn('Trigger rush', () => game.send({ type: 'TriggerEvent', eventId: 'rush' }));
  btn('+$100', () => game.send({ type: 'DebugAddCash', amount: 100 }));
  btn('+$1000', () => game.send({ type: 'DebugAddCash', amount: 1000 }));
  btn('Spawn 5', () => game.send({ type: 'DebugSpawn', count: 5 }));
  btn('Stack 12', () => { game.send({ type: 'DebugGiveUpgrade', upgradeId: 'carryTray' }); game.send({ type: 'DebugFillStack', count: 12 }); });
  btn('Rep 5★', () => game.send({ type: 'DebugSetRep', value: 5 }));
  let fps = false;
  btn('FPS overlay', () => { fps = !fps; game.showFps(fps); });
  btn('Bot on', () => game.startBot('competent'));
  btn('Bot off', () => game.startBot(null));
  btn('Reset save', () => game.resetSave());
  h('Time scale');
  for (const s of [0.25, 1, 2, 4, 8]) btn(`${s}x`, () => { game.debugScale = s; });
  h('Skip to beat');
  const sel = document.createElement('select');
  for (const b of BEATS) { const o = document.createElement('option'); o.value = b.id; o.textContent = b.id; sel.appendChild(o); }
  panel.appendChild(sel);
  btn('Go', () => { if (!game.started) game.begin(); game.send({ type: 'DebugSkipTo', beat: sel.value }); });
  h('Knobs');
  for (const k of KNOBS) {
    const obj = (k.obj === 'balance' ? balance : feel) as unknown as Record<string, unknown>;
    const lab = document.createElement('label');
    const val = Number(getPath(obj, k.path));
    const title = document.createElement('span');
    title.textContent = `${k.label}: ${val}`;
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(k.min); inp.max = String(k.max); inp.step = String(k.step); inp.value = String(val);
    inp.addEventListener('input', () => {
      const v = Number(inp.value);
      setPath(obj, k.path, v);
      title.textContent = `${k.label}: ${v}`;
    });
    lab.append(title, inp);
    panel.appendChild(lab);
  }
  const info = document.createElement('div');
  info.style.marginTop = '6px';
  panel.appendChild(info);
  setInterval(() => {
    if (!panel.classList.contains('on')) return;
    const s = game.sim;
    info.textContent = `t=${s.world.time.toFixed(0)}s beat=${s.world.director.beat} cash=${s.cash.toFixed(0)} rep=${s.shop.reputation.toFixed(2)} cust=${s.world.customers.length}`;
  }, 500);
  return { toggle: () => panel.classList.toggle('on') };
}
