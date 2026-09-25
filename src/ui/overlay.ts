// The DOM overlay: HUD, combo meter, banners, floating words, order bubbles, the ticket,
// route pips, pad price tags, station tags, callouts, the shake UI, and edge frames.
// UI animations run on real time (hit-stop never freezes the UI).
import { feel } from '../config/feel';
import { palette } from '../config/style';
import { iconImg, iconUrl, stepIcon } from './icons';
import { S } from './strings';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

export function pressable(b: HTMLElement): void {
  b.addEventListener('pointerup', () => {
    b.classList.remove('release');
    void b.offsetWidth;
    b.classList.add('release');
  });
}

interface Word { el: HTMLDivElement; x: number; y: number; t: number; life: number; rot: number; rise: number; big: boolean }

export interface BubbleView { root: HTMLDivElement; img: HTMLImageElement; mood: HTMLImageElement; ring: SVGCircleElement; recipe: string; moodIdx: number; pop: number }

export class Overlay {
  readonly root: HTMLElement;
  private cashEl: HTMLSpanElement;
  private cashPill: HTMLDivElement;
  private starsEl: HTMLDivElement;
  private starFills: HTMLDivElement[] = [];
  private goalEl: HTMLDivElement;
  private goalBar: HTMLElement;
  readonly gearBtn: HTMLButtonElement;
  private comboEl: HTMLDivElement;
  private comboMult: HTMLDivElement;
  private comboTimer: HTMLElement;
  private banner: HTMLDivElement;
  private bannerBig: HTMLDivElement;
  private bannerSub: HTMLDivElement;
  private wordsLayer: HTMLDivElement;
  private bubblesLayer: HTMLDivElement;
  private tagsLayer: HTMLDivElement;
  private words: Word[] = [];
  private wordPool: HTMLDivElement[] = [];
  private rushFrame: HTMLDivElement;
  private flashFrame: HTMLDivElement;
  private dim: HTMLDivElement;
  private vignette: HTMLDivElement;
  private callout: HTMLDivElement;
  private prompt: HTMLDivElement;
  readonly ghostHand: HTMLImageElement;
  private shakeUi: HTMLDivElement;
  private shakeFill: HTMLElement;
  private shakeTier: HTMLDivElement;
  readonly shakeRing: HTMLDivElement;
  readonly ticket: HTMLDivElement;
  private ticketImg: HTMLImageElement;
  private ticketSteps: HTMLDivElement;
  private ticketKey = '';
  readonly pips: HTMLDivElement;
  private fpsEl: HTMLDivElement | null = null;
  private shownCash = 0;
  private targetCash = 0;
  private lastFlash = 0;
  private flashT = 1;
  private flashColor = '#fff';
  rushFrameOn = false;
  flicker = 0;
  private time = 0;
  private bannerTimer: number | null = null;
  private calloutTimer: number | null = null;
  reducedMotion = false;

  constructor(root: HTMLElement) {
    this.root = root;
    const hud = el('div', 'hud', root);
    const left = el('div', 'hud-left', hud);
    this.cashPill = el('div', 'pill cash', left);
    this.cashPill.appendChild(iconImg('coin'));
    this.cashEl = el('span', 'cash-num', this.cashPill);
    this.cashEl.textContent = '0';
    this.starsEl = el('div', 'pill stars hidden', left);
    for (let i = 0; i < 5; i++) {
      const s = el('div', 'star', this.starsEl);
      s.appendChild(iconImg('starEmpty'));
      const clip = el('div', 'fillclip', s);
      clip.appendChild(iconImg('star'));
      this.starFills.push(clip);
    }
    this.goalEl = el('div', 'pill goal hidden', left);
    this.goalEl.appendChild(iconImg('shop'));
    const bar = el('div', 'bar', this.goalEl);
    this.goalBar = el('i', '', bar);
    this.gearBtn = el('button', 'btn-round gear', hud);
    this.gearBtn.setAttribute('aria-label', S.settings);
    this.gearBtn.appendChild(iconImg('gear'));
    pressable(this.gearBtn);

    this.comboEl = el('div', 'combo', root);
    this.comboMult = el('div', 'mult chunky', this.comboEl);
    this.comboMult.textContent = 'x1';
    const lbl = el('div', 'label chunky', this.comboEl);
    lbl.textContent = S.combo;
    const timer = el('div', 'timer', this.comboEl);
    this.comboTimer = el('i', '', timer);

    this.tagsLayer = el('div', '', root);
    this.bubblesLayer = el('div', '', root);
    this.pips = el('div', 'pips', root);
    this.ticket = el('div', 'ticket hidden', root);
    this.ticketImg = el('img', 'drink', this.ticket);
    this.ticketSteps = el('div', 'steps', this.ticket);
    this.wordsLayer = el('div', '', root);

    this.banner = el('div', 'banner', root);
    this.bannerBig = el('div', 'big chunky', this.banner);
    this.bannerSub = el('div', 'sub chunky', this.banner);
    this.dim = el('div', 'dim', root);
    this.rushFrame = el('div', 'rush-frame', root);
    this.flashFrame = el('div', 'flash-frame', root);
    this.vignette = el('div', 'vignette', root);
    this.callout = el('div', 'callout', root);
    this.prompt = el('div', 'prompt chunky', root);
    this.ghostHand = el('img', 'ghost-hand', root);
    this.ghostHand.src = iconUrl('hand', 128);
    this.shakeRing = el('div', 'shake-ring', root);
    this.shakeUi = el('div', 'shake-ui', root);
    const meter = el('div', 'meter', this.shakeUi);
    this.shakeFill = el('i', '', meter);
    for (const f of [feel.shake.greatAt / feel.shake.perfectAt, 1]) {
      const b = el('b', '', meter);
      b.style.left = `calc(${f * 100}% - 3px)`;
    }
    this.shakeTier = el('div', 'tier chunky', this.shakeUi);
  }

  // ---- HUD ------------------------------------------------------------------
  setCashTarget(v: number, instant = false): void {
    this.targetCash = v;
    if (instant) { this.shownCash = v; this.cashEl.textContent = String(Math.floor(v)); }
  }

  /** A coin landed: tick the counter toward the target and punch. */
  coinLanded(amount: number): void {
    this.shownCash = Math.min(this.targetCash, this.shownCash + amount);
    this.cashEl.textContent = String(Math.floor(this.shownCash));
    this.punch(this.cashPill);
  }

  punch(e: HTMLElement): void {
    e.classList.remove('punch');
    void e.offsetWidth;
    e.classList.add('punch');
  }

  setStars(rep: number, visible: boolean, pop = false): void {
    this.starsEl.classList.toggle('hidden', !visible);
    if (pop) { this.starsEl.classList.remove('pop'); void this.starsEl.offsetWidth; this.starsEl.classList.add('pop'); }
    for (let i = 0; i < 5; i++) {
      const f = Math.max(0, Math.min(1, rep - i));
      this.starFills[i].style.width = `${f * 100}%`;
    }
  }

  setGoal(visible: boolean, frac: number): void {
    this.goalEl.classList.toggle('hidden', !visible);
    this.goalBar.style.width = `${Math.min(100, frac * 100)}%`;
    this.goalEl.classList.toggle('ready', frac >= 1);
  }

  // ---- Combo ----------------------------------------------------------------
  showCombo(on: boolean): void { this.comboEl.classList.toggle('on', on); }

  setCombo(tier: number, mult: number, kind: 'up' | 'timeout' | 'broken' | 'reset' | 'refill'): void {
    this.comboMult.textContent = `x${mult}`;
    this.comboMult.style.color = palette.comboColors[Math.min(tier, palette.comboColors.length - 1)];
    this.comboMult.style.fontSize = `${44 + tier * 7}px`;
    const cls = kind === 'up' ? 'bump' : kind === 'timeout' ? 'fade' : kind === 'broken' ? 'broken' : '';
    if (cls) {
      this.comboEl.classList.remove('bump', 'fade', 'broken');
      void this.comboEl.offsetWidth;
      this.comboEl.classList.add(cls);
    }
  }

  setComboTimer(frac: number): void { this.comboTimer.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`; }

  // ---- Banners, callouts, prompts ------------------------------------------
  showBanner(big: string, sub = '', ms = 1400): void {
    this.bannerBig.textContent = big;
    this.bannerSub.textContent = sub;
    this.banner.classList.remove('show', 'hide');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => { this.banner.classList.remove('show'); this.banner.classList.add('hide'); }, ms);
  }

  showCallout(icons: string[], text: string, ms = 2600): void {
    this.callout.innerHTML = '';
    icons.forEach((n, i) => {
      if (n === '→') { const s = el('span', '', this.callout); s.textContent = '→'; return; }
      this.callout.appendChild(iconImg(n));
      void i;
    });
    if (text) { const s = el('span', '', this.callout); s.textContent = text; }
    this.callout.classList.remove('show', 'hide');
    void this.callout.offsetWidth;
    this.callout.classList.add('show');
    if (this.calloutTimer) clearTimeout(this.calloutTimer);
    this.calloutTimer = window.setTimeout(() => { this.callout.classList.remove('show'); this.callout.classList.add('hide'); }, ms);
  }

  setPrompt(text: string | null): void {
    if (text) this.prompt.textContent = text;
    this.prompt.classList.toggle('on', !!text);
  }

  // ---- Frames (photosensitivity-capped) -------------------------------------
  /** Edge flash, capped in brightness and rate (never faster than feel.flash.maxHz). */
  edgeFlash(color: string): void {
    const now = performance.now();
    if (now - this.lastFlash < 1000 / feel.flash.maxHz) return;
    this.lastFlash = now;
    this.flashT = 0;
    this.flashColor = color;
    this.flashFrame.style.boxShadow = `inset 0 0 90px 30px ${color}`;
  }

  setVignette(on: boolean): void { this.vignette.classList.toggle('on', on); }

  // ---- Shake UI -------------------------------------------------------------
  showShake(on: boolean): void {
    this.shakeUi.classList.toggle('on', on);
    this.shakeRing.classList.toggle('on', on);
    if (on) { this.shakeFill.style.width = '0%'; this.shakeTier.textContent = ''; }
  }

  setShakeProgress(p: number, reversals: number): void {
    this.shakeFill.style.width = `${Math.min(100, p * 100)}%`;
    const tier = reversals >= feel.shake.perfectAt ? S.perfect : reversals >= feel.shake.greatAt ? S.great : '';
    this.shakeTier.textContent = tier;
  }

  // ---- Floating words -------------------------------------------------------
  word(text: string, x: number, y: number, cls = '', life = feel.juice.wordLifeMs): void {
    let e = this.wordPool.pop();
    if (!e) e = el('div', '');
    e.className = 'word chunky ' + cls;
    e.textContent = text;
    this.wordsLayer.appendChild(e);
    const rot = (Math.random() * 2 - 1) * feel.juice.wordRotDeg;
    this.words.push({ el: e, x, y, t: 0, life, rot, rise: feel.juice.wordRisePx * (cls.includes('big') ? 1.3 : 1), big: cls.includes('big') });
    if (this.words.length > 24) this.killWord(0);
  }

  private killWord(i: number): void {
    const w = this.words[i];
    w.el.remove();
    this.wordPool.push(w.el);
    this.words.splice(i, 1);
  }

  // ---- Bubbles ---------------------------------------------------------------
  makeBubble(): BubbleView {
    const root = el('div', 'bubble', this.bubblesLayer);
    const bg = el('div', 'bg', root);
    void bg;
    const img = el('img', 'drink', root);
    img.alt = '';
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'ring');
    svg.setAttribute('viewBox', '0 0 68 66');
    const ring = document.createElementNS(svgNS, 'circle');
    ring.setAttribute('cx', '63');
    ring.setAttribute('cy', '5');
    ring.setAttribute('r', '15');
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke-width', '5');
    ring.setAttribute('stroke-linecap', 'round');
    ring.setAttribute('transform', 'rotate(-90 63 5)');
    svg.appendChild(ring);
    root.appendChild(svg);
    const mood = el('img', 'mood', root);
    mood.alt = '';
    return { root, img, mood, ring, recipe: '', moodIdx: -1, pop: 0 };
  }

  removeBubble(b: BubbleView): void { b.root.remove(); }

  makeTag(cls = 'stag'): HTMLDivElement { return el('div', cls, this.tagsLayer); }

  // ---- Ticket ----------------------------------------------------------------
  setTicket(visible: boolean, drinkUrl: string, steps: string[], doneCount: number): void {
    this.ticket.classList.toggle('hidden', !visible);
    if (!visible) return;
    const key = drinkUrl.length + '|' + steps.join(',') + '|' + doneCount;
    if (key === this.ticketKey) return;
    const stepsChanged = !this.ticketKey.includes(steps.join(','));
    this.ticketKey = key;
    this.ticketImg.src = drinkUrl;
    if (stepsChanged || this.ticketSteps.children.length !== steps.length) {
      this.ticketSteps.innerHTML = '';
      for (const s of steps) this.ticketSteps.appendChild(iconImg(stepIcon(s), '', 64));
    }
    Array.from(this.ticketSteps.children).forEach((c, i) => {
      c.classList.toggle('done', i < doneCount);
      c.classList.toggle('now', i === doneCount);
    });
  }

  place(e: HTMLElement, x: number, y: number, scale = 1): void {
    e.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
  }

  tapRipple(x: number, y: number): void {
    const r = el('div', 'tap-ripple', this.root);
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    window.setTimeout(() => r.remove(), 420);
  }

  enableFps(): HTMLDivElement {
    if (!this.fpsEl) this.fpsEl = el('div', 'fps', this.root);
    return this.fpsEl;
  }

  // ---- Per frame (real time) ------------------------------------------------
  update(dt: number): void {
    this.time += dt;
    // Money counter: coins drive it, but never lag far behind the truth.
    if (this.shownCash < this.targetCash) {
      const lag = this.targetCash - this.shownCash;
      if (lag > 0) this.shownCash = Math.min(this.targetCash, this.shownCash + Math.max(lag * dt * 1.2, 0));
      this.cashEl.textContent = String(Math.floor(this.shownCash));
    } else if (this.shownCash > this.targetCash) {
      this.shownCash = this.targetCash;
      this.cashEl.textContent = String(Math.floor(this.shownCash));
    }
    // Words: 0 → 1.25 → 1.0 over ~180ms with rotation, then drift up and fade.
    const pop = feel.juice.wordPopMs / 1000;
    for (let i = this.words.length - 1; i >= 0; i--) {
      const w = this.words[i];
      w.t += dt;
      const life = w.life / 1000;
      if (w.t >= life) { this.killWord(i); continue; }
      let s: number;
      if (w.t < pop * 0.6) s = (w.t / (pop * 0.6)) * 1.25;
      else if (w.t < pop) s = 1.25 - ((w.t - pop * 0.6) / (pop * 0.4)) * 0.25;
      else s = 1;
      const k = Math.max(0, (w.t - pop) / (life - pop));
      const y = w.y - w.rise * k;
      const a = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      w.el.style.transform = `translate3d(${w.x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${w.rot.toFixed(1)}deg) scale(${s.toFixed(3)})`;
      w.el.style.opacity = a.toFixed(3);
    }
    // Edge flash (capped alpha).
    const M = this.reducedMotion ? feel.juice.reducedMotionScale : 1;
    if (this.flashT < 1) {
      this.flashT = Math.min(1, this.flashT + dt / (feel.flash.tierUpFlashMs / 1000));
      const a = Math.sin(this.flashT * Math.PI) * feel.flash.edgeFlashMaxAlpha * M;
      this.flashFrame.style.opacity = a.toFixed(3);
    } else this.flashFrame.style.opacity = '0';
    // Rush border: slow pulse (≤ maxHz), capped alpha.
    if (this.rushFrameOn) {
      const hz = Math.min(feel.flash.rushPulseHz, feel.flash.maxHz);
      const a = (0.6 + 0.4 * Math.sin(this.time * Math.PI * 2 * hz)) * feel.flash.rushBorderAlpha * (this.reducedMotion ? 0.5 : 1);
      this.rushFrame.style.opacity = a.toFixed(3);
    } else this.rushFrame.style.opacity = '0';
    // Rush warning: gentle low-contrast flicker (sine dip, ≤ maxHz).
    if (this.flicker > 0) {
      const hz = Math.min(feel.flash.warningFlickerHz, feel.flash.maxHz);
      const d = (0.5 + 0.5 * Math.sin(this.time * Math.PI * 2 * hz)) * feel.flash.warningFlickerDepth * this.flicker * M;
      this.dim.style.opacity = d.toFixed(3);
    } else this.dim.style.opacity = '0';
    void this.flashColor;
  }
}
