// Input emits commands only. Four methods: floating joystick, tap-to-move (tap stations to
// queue a route), WASD, click-to-move. Modes: normal / shake / seal / disabled.
import { feel } from '../config/feel';
import type { Command } from '../sim/commands';
import { ShakeTracker } from './shakeTracker';

export type InputMode = 'normal' | 'shake' | 'seal' | 'disabled';

export interface Picker {
  pickStation(x: number, y: number): string | null;
  pickPad(x: number, y: number): { id: string; x: number; z: number } | null;
  pickGround(x: number, y: number): { x: number; z: number } | null;
  pickForSale(x: number, y: number): boolean;
}

export interface InputHooks {
  onTapGround?: (sx: number, sy: number) => void;
  onTapStation?: (id: string) => void;
  onForSale?: () => void;
  onDevToggle?: () => void;
  onAnyInput?: () => void;
  onSealTap?: (sx: number, sy: number) => void;
}

export class InputController {
  mode: InputMode = 'disabled';
  readonly shake = new ShakeTracker();
  private pointerId: number | null = null;
  private start = { x: 0, y: 0, t: 0 };
  private joy = false;
  private joyBase = { x: 0, y: 0 };
  private lastVec = { x: 0, z: 0 };
  private keys = new Set<string>();
  private keyVec = { x: 0, z: 0 };
  private joyEl: HTMLDivElement;
  private knobEl: HTMLDivElement;
  private touches = new Set<number>();
  /** Tests can disable real pointer handling. */
  enabled = true;

  constructor(private el: HTMLElement, overlay: HTMLElement, private send: (c: Command) => void, private picker: Picker, private hooks: InputHooks = {}) {
    this.joyEl = document.createElement('div');
    this.joyEl.className = 'joy';
    this.knobEl = document.createElement('div');
    this.knobEl.className = 'joy-knob';
    this.joyEl.appendChild(this.knobEl);
    overlay.appendChild(this.joyEl);
    const R = feel.ui.joystickRadius;
    this.joyEl.style.width = this.joyEl.style.height = `${R * 2}px`;

    el.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e, false));
    window.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('touchstart', (e) => {
      for (const t of Array.from(e.changedTouches)) this.touches.add(t.identifier);
      if (e.touches.length >= 3) this.hooks.onDevToggle?.();
    }, { passive: true });
    el.addEventListener('touchend', (e) => { for (const t of Array.from(e.changedTouches)) this.touches.delete(t.identifier); }, { passive: true });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keyUp(e));
    window.addEventListener('blur', () => { this.keys.clear(); this.updateKeyVec(); this.endJoystick(); });
  }

  setMode(mode: InputMode): void {
    if (mode === this.mode) return;
    if (this.mode === 'normal' && mode !== 'normal') this.endJoystick();
    this.mode = mode;
    if (mode !== 'shake') this.shake.cancel();
    // Keys pressed or released during shake/seal must not leave a stale move vector behind.
    if (mode === 'normal') this.emitVec(this.keyVec.x, this.keyVec.z, true);
  }

  beginShake(generous: boolean): void {
    this.setMode('shake');
    this.shake.begin(generous, performance.now());
  }

  private emitVec(x: number, z: number, force = false): void {
    const q = (v: number) => Math.round(v * 20) / 20;
    const nx = q(x), nz = q(z);
    if (!force && nx === this.lastVec.x && nz === this.lastVec.z) return;
    this.lastVec = { x: nx, z: nz };
    this.send({ type: 'MoveVector', x: nx, z: nz });
  }

  private down(e: PointerEvent): void {
    if (!this.enabled) return;
    this.hooks.onAnyInput?.();
    if (this.mode === 'seal') {
      e.preventDefault();
      this.send({ type: 'Seal' });
      this.hooks.onSealTap?.(e.clientX, e.clientY);
      return;
    }
    if (this.mode === 'shake') {
      this.shake.add(e.timeStamp || performance.now(), e.clientX, e.clientY);
      return;
    }
    if (this.mode !== 'normal') return;
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.start = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.joy = false;
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  private move(e: PointerEvent): void {
    if (!this.enabled) return;
    if (this.mode === 'shake') {
      // All pointer motion goes to the shake (mouse doesn't need a button held).
      const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      if (evs.length) for (const c of evs) this.shake.add(c.timeStamp || e.timeStamp, c.clientX, c.clientY);
      else this.shake.add(e.timeStamp || performance.now(), e.clientX, e.clientY);
      return;
    }
    if (this.mode !== 'normal') return;
    if (e.pointerId !== this.pointerId) return;
    const dx = e.clientX - this.start.x, dy = e.clientY - this.start.y;
    if (!this.joy && Math.hypot(dx, dy) > feel.ui.tapSlopPx) {
      this.joy = true;
      this.joyBase = { ...this.start };
      this.joyEl.classList.add('on');
      this.send({ type: 'ClearRoute' });
    }
    if (this.joy) this.updateJoystick(e.clientX, e.clientY);
  }

  private updateJoystick(x: number, y: number): void {
    const R = feel.ui.joystickRadius;
    let dx = x - this.joyBase.x, dy = y - this.joyBase.y;
    const len = Math.hypot(dx, dy);
    // Floating: the base trails the thumb if it goes past the rim.
    if (len > R) {
      this.joyBase.x = x - (dx / len) * R;
      this.joyBase.y = y - (dy / len) * R;
      dx = x - this.joyBase.x; dy = y - this.joyBase.y;
    }
    this.joyEl.style.transform = `translate(${this.joyBase.x - R}px, ${this.joyBase.y - R}px)`;
    this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    const l = Math.min(1, Math.hypot(dx, dy) / R);
    const dz = feel.ui.joystickDeadzone;
    if (l < dz) { this.emitVec(0, 0); return; }
    const k = (l - dz) / (1 - dz) / (Math.hypot(dx, dy) || 1);
    // Camera looks toward -z with no yaw: screen right = +x, screen down = +z.
    this.emitVec(dx * k, dy * k);
  }

  private endJoystick(): void {
    if (this.joy) this.emitVec(0, 0, true);
    this.joy = false;
    this.joyEl.classList.remove('on');
    this.pointerId = null;
  }

  private up(e: PointerEvent, cancelled: boolean): void {
    if (!this.enabled) return;
    if (this.mode === 'shake') return;
    if (e.pointerId !== this.pointerId) return;
    const wasJoy = this.joy;
    this.endJoystick();
    if (cancelled || wasJoy || this.mode !== 'normal') return;
    this.tap(e.clientX, e.clientY);
  }

  /** A tap: station → toggle in route; pad → walk onto it; ground → walk there. */
  tap(x: number, y: number): void {
    const st = this.picker.pickStation(x, y);
    if (st) {
      this.send({ type: 'ToggleStation', stationId: st });
      this.hooks.onTapStation?.(st);
      return;
    }
    const pad = this.picker.pickPad(x, y);
    if (pad) {
      this.send({ type: 'MoveTo', x: pad.x, z: pad.z });
      this.hooks.onTapGround?.(x, y);
      return;
    }
    if (this.picker.pickForSale(x, y)) { this.hooks.onForSale?.(); return; }
    const g = this.picker.pickGround(x, y);
    if (g) {
      this.send({ type: 'MoveTo', x: g.x, z: g.z });
      this.hooks.onTapGround?.(x, y);
    }
  }

  private keyDown(e: KeyboardEvent): void {
    if (e.key === '`' || e.key === '~') { this.hooks.onDevToggle?.(); return; }
    const k = e.key.toLowerCase();
    const moveKeys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
    if (moveKeys.includes(k) || k === ' ' || k === 'enter') e.preventDefault();
    this.hooks.onAnyInput?.();
    if (this.mode === 'shake') {
      if (!e.repeat && (k === 'a' || k === 'arrowleft')) this.shake.key(-1, performance.now());
      if (!e.repeat && (k === 'd' || k === 'arrowright')) this.shake.key(1, performance.now());
    }
    if (this.mode === 'seal' && (k === ' ' || k === 'enter')) { this.send({ type: 'Seal' }); return; }
    if (e.repeat) return;
    // Always track held movement keys (even mid-shake) so nothing is lost when the mode ends.
    if (moveKeys.includes(k)) {
      this.keys.add(k);
      this.updateKeyVec();
    }
  }

  private keyUp(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    if (this.keys.delete(k)) this.updateKeyVec();
  }

  private updateKeyVec(): void {
    let x = 0, z = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) z -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) z += 1;
    const l = Math.hypot(x, z) || 1;
    const nx = x / l, nz = z / l;
    if (nx !== this.keyVec.x || nz !== this.keyVec.z) {
      this.keyVec = { x: nx, z: nz };
      if (this.mode === 'normal' || this.mode === 'seal') this.emitVec(nx, nz, true);
    }
  }

  update(now: number): void {
    this.shake.update(now);
  }
}
