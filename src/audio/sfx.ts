// Every sound in the game, synthesized. Feedback words: grab, POUR, SCOOP, SHAKE, CHUNK, GO.
import type { AudioEngine } from './engine';
import { feel } from '../config/feel';

// C major pentatonic ladder for coins (climbs when coins land in quick succession).
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];

export class Sfx {
  private coinStep = 0;
  private lastCoin = 0;
  private lastPop = 0;

  constructor(private a: AudioEngine) {}

  private t(): number { return this.a.now; }

  tap(): void { this.a.tone({ type: 'triangle', freq: this.a.vary(880), freqEnd: 1200, dur: 0.06, gain: 0.12 }); }

  grab(): void {
    this.a.tone({ type: 'sine', freq: this.a.vary(520), freqEnd: 980, dur: 0.1, gain: 0.25 });
    this.a.noise({ dur: 0.05, gain: 0.06, filter: { type: 'highpass', freq: 3000 } });
  }

  pour(dur: number): void {
    const d = Math.max(0.25, dur);
    this.a.noise({ dur: d, gain: 0.16, attack: 0.04, filter: { type: 'bandpass', freq: 700, freqEnd: 1700, q: 1.4 } });
    for (let i = 0; i < 5; i++) this.a.tone({ type: 'sine', freq: this.a.vary(300 + i * 60, 0.15), freqEnd: 500 + i * 90, dur: 0.06, gain: 0.07, when: this.t() + i * (d / 6) });
  }

  swirl(dur: number): void {
    this.a.noise({ dur: Math.max(0.3, dur), gain: 0.12, attack: 0.05, filter: { type: 'bandpass', freq: 400, freqEnd: 1400, q: 3 } });
    this.a.tone({ type: 'sine', freq: this.a.vary(330), freqEnd: 660, dur: 0.3, gain: 0.08, vibrato: { rate: 14, depth: 30 } });
  }

  plop(i: number, high = false): void {
    const base = high ? 900 : 420;
    this.a.tone({ type: 'sine', freq: this.a.vary(base + i * 25, 0.1), freqEnd: base * 0.45, dur: 0.07, gain: 0.16, when: this.t() + i * 0.03 });
  }

  scoop(high = false): void { for (let i = 0; i < 4; i++) this.plop(i, high); }

  clink(): void {
    for (let i = 0; i < 3; i++) {
      const w = this.t() + i * 0.06;
      this.a.tone({ type: 'triangle', freq: this.a.vary(2400 + i * 300), dur: 0.08, gain: 0.08, when: w });
      this.a.tone({ type: 'sine', freq: this.a.vary(3600 + i * 400), dur: 0.05, gain: 0.05, when: w });
    }
  }

  jiggle(): void { this.a.tone({ type: 'sine', freq: this.a.vary(500), freqEnd: 700, dur: 0.3, gain: 0.14, vibrato: { rate: 18, depth: 60 } }); }

  bonk(): void {
    this.a.tone({ type: 'sine', freq: this.a.vary(240), freqEnd: 150, dur: 0.14, gain: 0.16 });
    this.a.tone({ type: 'triangle', freq: this.a.vary(180), freqEnd: 120, dur: 0.1, gain: 0.08, when: this.t() + 0.06 });
  }

  shakeStart(): void { this.a.noise({ dur: 0.25, gain: 0.14, filter: { type: 'bandpass', freq: 500, freqEnd: 2500, q: 1 } }); }

  /** A rattle on each reversal; pitch climbs as you near PERFECT (0..1). */
  rattle(progress: number): void {
    const f = 900 + progress * 1600;
    this.a.noise({ dur: 0.06, gain: 0.13, filter: { type: 'bandpass', freq: this.a.vary(f, 0.08), q: 6 } });
    this.a.tone({ type: 'square', freq: this.a.vary(f / 4, 0.05), dur: 0.04, gain: 0.035, filter: { type: 'lowpass', freq: 1800 } });
  }

  shakeResult(tier: 'ok' | 'great' | 'perfect'): void {
    const t = this.t();
    if (tier === 'ok') {
      this.a.tone({ type: 'triangle', freq: 660, dur: 0.18, gain: 0.14 });
    } else if (tier === 'great') {
      this.a.tone({ type: 'triangle', freq: 784, dur: 0.14, gain: 0.16 });
      this.a.tone({ type: 'triangle', freq: 1046.5, dur: 0.22, gain: 0.16, when: t + 0.09 });
    } else {
      // PERFECT sting: sparkly arpeggio + shimmer
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) => this.a.tone({ type: 'triangle', freq: f, dur: 0.22, gain: 0.15, when: t + i * 0.055 }));
      this.a.tone({ type: 'sine', freq: 2637, dur: 0.5, gain: 0.07, when: t + 0.22, vibrato: { rate: 9, depth: 25 } });
      this.a.noise({ dur: 0.4, gain: 0.05, when: t + 0.1, filter: { type: 'highpass', freq: 6000 } });
    }
  }

  /** CHUNK! */
  seal(): void {
    const t = this.t();
    this.a.tone({ type: 'sine', freq: 150, freqEnd: 45, dur: 0.22, gain: 0.45 });
    this.a.noise({ dur: 0.08, gain: 0.25, filter: { type: 'lowpass', freq: 1800 } });
    this.a.tone({ type: 'square', freq: this.a.vary(330), freqEnd: 250, dur: 0.07, gain: 0.08, filter: { type: 'bandpass', freq: 1200, q: 4 }, when: t + 0.01 });
    this.a.tone({ type: 'triangle', freq: 1568, dur: 0.12, gain: 0.06, when: t + 0.16 });
  }

  serve(): void {
    const t = this.t();
    this.a.noise({ dur: 0.18, gain: 0.1, filter: { type: 'bandpass', freq: 1200, freqEnd: 3000, q: 1.2 } });
    this.a.tone({ type: 'triangle', freq: this.a.vary(880, 0.02), dur: 0.1, gain: 0.14, when: t + 0.05 });
    this.a.tone({ type: 'triangle', freq: this.a.vary(1318.5, 0.02), dur: 0.16, gain: 0.14, when: t + 0.12 });
  }

  coin(): void {
    const now = performance.now();
    if (now - this.lastCoin < feel.audio.coinLadderMs) this.coinStep = Math.min(PENTA.length - 1, this.coinStep + 1);
    else this.coinStep = 0;
    this.lastCoin = now;
    const f = PENTA[this.coinStep];
    this.a.tone({ type: 'sine', freq: f, dur: 0.09, gain: 0.1 });
    this.a.tone({ type: 'triangle', freq: f * 2, dur: 0.06, gain: 0.04 });
  }

  padTick(k: number): void {
    const now = performance.now();
    if (now - this.lastPop < 55) return;
    this.lastPop = now;
    this.a.tone({ type: 'sine', freq: 500 + k * 700, dur: 0.05, gain: 0.07 });
  }

  patience(mood: number): void {
    const f = [0, 520, 420, 330][mood] || 400;
    this.a.tone({ type: 'triangle', freq: this.a.vary(f), freqEnd: f * 0.85, dur: 0.1, gain: 0.09 });
    if (mood === 3) this.a.noise({ dur: 0.25, gain: 0.06, filter: { type: 'highpass', freq: 2500, freqEnd: 5000 } });
  }

  walkout(): void {
    const t = this.t();
    // "hmph!"
    this.a.tone({ type: 'sawtooth', freq: 290, freqEnd: 170, dur: 0.22, gain: 0.12, filter: { type: 'bandpass', freq: 900, q: 2 } });
    for (let i = 0; i < 4; i++) this.a.tone({ type: 'sine', freq: 90, freqEnd: 50, dur: 0.08, gain: 0.2, when: t + 0.35 + i * 0.16 });
  }

  comboUp(tier: number): void {
    const t = this.t();
    const base = 523.25 * Math.pow(2, (tier * 3) / 12);
    [1, 1.25, 1.5, 2].forEach((m, i) => this.a.tone({ type: 'square', freq: base * m, dur: 0.12, gain: 0.07, when: t + i * 0.05, filter: { type: 'lowpass', freq: 3500 } }));
    this.a.tone({ type: 'triangle', freq: base * 2, dur: 0.35, gain: 0.1, when: t + 0.2 });
  }

  comboTimeout(): void { this.a.tone({ type: 'sine', freq: 520, freqEnd: 390, dur: 0.18, gain: 0.08 }); }

  comboBroken(): void {
    const t = this.t();
    this.a.noise({ dur: 0.1, gain: 0.18, filter: { type: 'highpass', freq: 1500 } });
    this.a.tone({ type: 'sine', freq: 420, freqEnd: 120, dur: 0.45, gain: 0.2, vibrato: { rate: 16, depth: 40 }, when: t + 0.05 });
  }

  rushWarning(sec: number): void {
    this.a.noise({ dur: sec, gain: 0.14, attack: sec * 0.6, filter: { type: 'lowpass', freq: 90, freqEnd: 220, q: 2 } });
    const t = this.t();
    for (let i = 0; i < 3; i++) {
      this.a.tone({ type: 'triangle', freq: 784, dur: 0.18, gain: 0.1, when: t + 0.8 + i * 1 });
      this.a.tone({ type: 'triangle', freq: 622, dur: 0.22, gain: 0.1, when: t + 1.05 + i * 1 });
    }
  }

  countdown(n: number): void { this.a.tone({ type: 'square', freq: n > 0 ? 660 : 1320, dur: 0.12, gain: 0.08, filter: { type: 'lowpass', freq: 3000 } }); }

  rushStart(): void {
    const t = this.t();
    this.a.tone({ type: 'sine', freq: 110, freqEnd: 40, dur: 0.4, gain: 0.5 });
    this.a.noise({ dur: 0.6, gain: 0.2, filter: { type: 'highpass', freq: 3000, freqEnd: 8000 } });
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => this.a.tone({ type: 'sawtooth', freq: f, dur: 0.4, gain: 0.05, filter: { type: 'lowpass', freq: 2600 }, when: t + 0.02 }));
  }

  rushEnd(): void { this.a.tone({ type: 'triangle', freq: 880, freqEnd: 220, dur: 0.6, gain: 0.12 }); }

  fanfare(): void {
    const t = this.t();
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.a.tone({ type: 'triangle', freq: f, dur: 0.16, gain: 0.13, when: t + i * 0.07 }));
    [523.25, 659.25, 783.99].forEach((f) => this.a.tone({ type: 'square', freq: f, dur: 0.5, gain: 0.04, filter: { type: 'lowpass', freq: 2000 }, when: t + 0.38 }));
  }

  thunk(): void {
    this.a.tone({ type: 'sine', freq: 120, freqEnd: 55, dur: 0.18, gain: 0.35 });
    this.a.noise({ dur: 0.25, gain: 0.1, filter: { type: 'lowpass', freq: 600 } });
  }

  refill(): void {
    for (let i = 0; i < 8; i++) this.a.tone({ type: 'sine', freq: this.a.vary(260 + (i % 3) * 40, 0.15), freqEnd: 140, dur: 0.05, gain: 0.08, when: this.t() + i * 0.08 });
  }

  bubble(): void { this.a.tone({ type: 'sine', freq: this.a.vary(300, 0.3), freqEnd: 600, dur: 0.06, gain: 0.04 }); }

  cheer(): void {
    for (let i = 0; i < 5; i++) this.a.tone({ type: 'sawtooth', freq: this.a.vary(600 + i * 90, 0.1), freqEnd: 900 + i * 60, dur: 0.25, gain: 0.025, filter: { type: 'bandpass', freq: 1400, q: 2 }, when: this.t() + i * 0.03 });
  }

  pop(): void { this.a.tone({ type: 'sine', freq: this.a.vary(700), freqEnd: 1400, dur: 0.07, gain: 0.14 }); }

  sparkle(): void {
    const t = this.t();
    [1568, 2093, 2637].forEach((f, i) => this.a.tone({ type: 'sine', freq: f, dur: 0.12, gain: 0.06, when: t + i * 0.06 }));
  }
}
