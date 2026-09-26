// Modal cards: start screen, menu choice card, rush results, settings, menu board picker.
// Big chunky buttons, icons over text, touch targets ≥44px.
import { iconImg } from './icons';
import { S } from './strings';
import { pressable } from './overlay';
import { hapticsSupported } from './haptics';
import type { Settings } from './settings';
import type { EventResults } from '../sim/types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

function button(label: string, icon: string | null, cls = 'btn', parent?: HTMLElement): HTMLButtonElement {
  const b = el('button', cls, parent);
  if (icon) b.appendChild(iconImg(icon));
  if (label) { const s = el('span', '', b); s.textContent = label; }
  pressable(b);
  return b;
}

export class Modals {
  private current: HTMLDivElement | null = null;
  onOpenChange: ((open: boolean) => void) | null = null;

  constructor(private root: HTMLElement) {}

  get open(): boolean { return !!this.current; }

  private startFire: (() => void) | null = null;

  /** Dismiss the start screen programmatically (autostart, tests). */
  dismissStart(): void { this.startFire?.(); }

  private show(build: (card: HTMLDivElement, modal: HTMLDivElement) => void, opts: { card?: boolean } = {}): HTMLDivElement {
    this.close();
    const modal = el('div', 'modal', this.root);
    const card = opts.card === false ? modal : el('div', 'card', modal);
    build(card, modal);
    requestAnimationFrame(() => modal.classList.add('show'));
    this.current = modal;
    this.onOpenChange?.(true);
    return modal;
  }

  close(): void {
    if (!this.current) return;
    const m = this.current;
    this.current = null;
    m.classList.remove('show');
    window.setTimeout(() => m.remove(), 200);
    this.onOpenChange?.(false);
  }

  /** "Tap to start" (also unlocks audio). */
  start(onStart: () => void, hasSave: boolean): void {
    this.close();
    const s = el('div', 'start', this.root);
    const logo = el('div', 'logo chunky', s);
    const words = S.title.split(' ');
    words.forEach((w, i) => {
      const span = el('span', '', logo);
      span.textContent = w;
      span.style.animationDelay = `${i * 0.2}s`;
      if (i < words.length - 1) el('br', '', logo);
    });
    const go = el('div', 'go chunky', s);
    go.textContent = hasSave ? S.continue : S.tapToStart;
    const play = button('', 'play', 'btn-round', s);
    play.style.width = play.style.height = '76px';
    let done = false;
    const fire = (e?: Event) => {
      if (done) return;
      done = true;
      e?.preventDefault();
      this.startFire = null;
      s.style.transition = 'opacity 250ms';
      s.style.opacity = '0';
      window.setTimeout(() => s.remove(), 260);
      onStart();
    };
    this.startFire = () => fire();
    // Only a press that starts on this screen counts: lifting the finger that just held
    // Reset (the screen appears under it) must not skip straight past the title.
    let pressed = false;
    s.addEventListener('pointerdown', () => { pressed = true; });
    s.addEventListener('touchstart', () => { pressed = true; }, { passive: true });
    const release = (e: Event) => { if (pressed) fire(e); };
    s.addEventListener('pointerup', release);
    s.addEventListener('touchend', release);
    s.addEventListener('keydown', fire);
    window.addEventListener('keydown', function k(e) { if (!done && (e.key === ' ' || e.key === 'Enter')) { window.removeEventListener('keydown', k); fire(e); } });
  }

  /** New recipe offer: pays more, takes longer. */
  menuOffer(opts: { drinkUrl: string; price: number; basePrice: number; steps: number; baseSteps: number; onAnswer: (yes: boolean) => void }): void {
    this.show((card) => {
      const h = el('h2', 'chunky', card);
      h.textContent = S.newRecipe;
      const dc = el('div', 'drinkcard', card);
      const img = el('img', 'big', dc);
      img.src = opts.drinkUrl;
      const tags = el('div', 'tags', dc);
      const pay = el('div', '', tags);
      pay.appendChild(iconImg('coin'));
      const p = el('span', '', pay);
      p.textContent = `${opts.price}  ${S.paysMore}`;
      const time = el('div', '', tags);
      time.appendChild(iconImg('clock'));
      const tl = el('span', '', time);
      tl.textContent = S.takesLonger;
      const row = el('div', 'row', card);
      const no = button(S.no, 'close', 'btn secondary', row);
      const yes = button(S.yes, 'check', 'btn pulse', row);
      yes.addEventListener('click', () => { this.close(); opts.onAnswer(true); });
      no.addEventListener('click', () => { this.close(); opts.onAnswer(false); });
    });
  }

  /** Rush results with ticking numbers and a Claim button that bursts coins. */
  results(r: EventResults, onClaim: (btn: HTMLElement) => void): void {
    this.show((card) => {
      const h = el('h2', 'chunky', card);
      h.textContent = S.rushGo;
      const row = el('div', 'row', card);
      const stats: [string, number, string, string][] = [
        ['serve', r.served, S.served, ''],
        ['fire', r.bestMult, S.bestCombo, 'x'],
        ['star', r.perfects, S.perfects, ''],
        ['coin', r.cash + r.bonus, S.cash, ''],
      ];
      const nums: [HTMLElement, number, string][] = [];
      for (const [icon, v, label, prefix] of stats) {
        const s = el('div', 'stat', row);
        s.appendChild(iconImg(icon));
        const b = el('b', '', s);
        b.textContent = prefix + '0';
        const sp = el('span', '', s);
        sp.textContent = label;
        nums.push([b, v, prefix]);
      }
      const t0 = performance.now();
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0) / 900);
        const e = 1 - Math.pow(1 - k, 3);
        for (const [b, v, prefix] of nums) b.textContent = prefix + Math.round(v * e);
        if (k < 1 && this.current) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      const claim = button(`${S.claim} +${r.bonus}`, 'coin', 'btn pulse', card);
      claim.addEventListener('click', () => { onClaim(claim); this.close(); });
    });
  }

  settings(s: Settings, opts: { build: string; onChange: (s: Settings) => void; onReset: () => void }): void {
    this.show((card) => {
      const h = el('h2', 'chunky', card);
      h.textContent = S.settings;
      const list = el('div', 'settings-list', card);
      const toggle = (icon: string, label: string, key: keyof Settings) => {
        const row = el('div', 'setting', list);
        const l = el('div', 'row', row);
        l.appendChild(iconImg(icon));
        const sp = el('span', '', l);
        sp.textContent = label;
        const t = el('button', 'toggle' + (s[key] ? ' on' : ''), row);
        t.setAttribute('aria-label', label);
        el('i', '', t);
        t.addEventListener('click', () => {
          s[key] = !s[key];
          t.classList.toggle('on', s[key]);
          opts.onChange(s);
        });
      };
      toggle('music', S.music, 'music');
      toggle('sfx', S.sfx, 'sfx');
      if (hapticsSupported) toggle('haptics', S.haptics, 'haptics');
      toggle('motion', S.motion, 'reducedMotion');
      // Reset: hold to confirm.
      const reset = button(S.resetHold, 'reset', 'btn accent hold', card);
      const fill = el('div', 'fill', reset);
      let holdT: number | null = null;
      let start = 0;
      const held = () => (performance.now() - start) / 1500;
      const fire = () => { holdT = null; this.close(); opts.onReset(); };
      const step = () => {
        const k = Math.min(1, held());
        fill.style.width = `${k * 100}%`;
        if (k >= 1) { fire(); return; }
        holdT = requestAnimationFrame(step);
      };
      const stop = () => { if (holdT) cancelAnimationFrame(holdT); holdT = null; fill.style.width = '0%'; };
      reset.addEventListener('pointerdown', (e) => { e.preventDefault(); start = performance.now(); holdT = requestAnimationFrame(step); });
      // Judge the hold by the clock on release too, so a slow frame can't swallow a full hold.
      reset.addEventListener('pointerup', () => { const armed = holdT !== null && held() >= 1; stop(); if (armed) fire(); });
      reset.addEventListener('pointerleave', stop);
      reset.addEventListener('pointercancel', stop);
      const close = button(S.close, 'check', 'btn', card);
      close.addEventListener('click', () => this.close());
      const b = el('div', 'build', card);
      b.textContent = `${S.build} ${opts.build}`;
    });
  }

  menuPicker(items: { id: string; url: string; price: number; on: boolean }[], onToggle: (id: string, on: boolean) => void): void {
    this.show((card) => {
      const h = el('h2', 'chunky', card);
      h.textContent = S.menu;
      const list = el('div', 'menu-list', card);
      for (const it of items) {
        const m = el('button', 'menu-item' + (it.on ? ' on' : ''), list);
        const img = el('img', 'd', m);
        img.src = it.url;
        const pr = el('div', 'price', m);
        pr.appendChild(iconImg('coin'));
        const sp = el('span', '', pr);
        sp.textContent = String(it.price);
        const chk = iconImg('check', 'chk icon');
        m.appendChild(chk);
        m.addEventListener('click', () => {
          const on = !m.classList.contains('on');
          if (!on && list.querySelectorAll('.menu-item.on').length <= 1) return;
          m.classList.toggle('on', on);
          onToggle(it.id, on);
        });
      }
      const close = button(S.close, 'check', 'btn', card);
      close.addEventListener('click', () => this.close());
    });
  }
}

export function skipButton(root: HTMLElement, onSkip: () => void): HTMLButtonElement {
  const b = button(S.skip, null, 'btn secondary skip', root);
  b.addEventListener('click', () => { onSkip(); b.remove(); });
  return b;
}
