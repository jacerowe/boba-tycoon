// A bouncy procedural loop: bass, off-beat ukulele-ish chords, a sparse pentatonic melody.
// Rush mode crossfades in drums and a busier bass while the tempo climbs.
import type { AudioEngine } from './engine';
import { feel } from '../config/feel';

// I–vi–IV–V in C, two bars each chord pair (8 beats per chord).
const CHORDS: number[][] = [
  [261.63, 329.63, 392.0],
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
  [196.0, 246.94, 293.66],
];
const BASS = [65.41, 55.0, 43.65, 49.0];
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
// Hand-written melody motifs (indices into PENTA, -1 = rest), one per chord.
const MOTIFS = [
  [2, -1, 3, 2, 0, -1, 1, -1],
  [0, -1, 2, -1, 3, 2, -1, -1],
  [4, 3, -1, 2, 3, -1, 0, -1],
  [1, -1, 2, 3, -1, 4, 5, -1],
];

export class Music {
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0; // 8th notes
  private bpm = feel.audio.musicBpm;
  private targetBpm = feel.audio.musicBpm;
  private rush = false;
  playing = false;

  constructor(private a: AudioEngine) {}

  start(): void {
    if (this.playing || !this.a.ctx) return;
    this.playing = true;
    this.nextTime = this.a.now + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    this.playing = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  setRush(on: boolean): void {
    this.rush = on;
    this.targetBpm = on ? feel.audio.rushBpm : feel.audio.musicBpm;
    const ctx = this.a.ctx;
    if (!ctx) return;
    this.a.rushBus.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, feel.audio.crossfadeSec / 3);
  }

  private schedule(): void {
    const ctx = this.a.ctx;
    if (!ctx || ctx.state !== 'running') return;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.play(this.step, this.nextTime);
      this.bpm += (this.targetBpm - this.bpm) * 0.08;
      this.nextTime += 60 / this.bpm / 2;
      this.step = (this.step + 1) % 64;
    }
  }

  private play(step: number, when: number): void {
    const a = this.a;
    const chordIdx = Math.floor(step / 16) % 4;
    const chord = CHORDS[chordIdx];
    const beat8 = step % 16;
    const e = 60 / this.bpm / 2;
    // Bass: root on beats, bouncy octave on the "and" of 2 and 4.
    if (beat8 % 4 === 0) a.tone({ type: 'triangle', freq: BASS[chordIdx] * 2, dur: e * 1.6, gain: 0.32, when, bus: 'music', filter: { type: 'lowpass', freq: 600 } });
    if (beat8 % 8 === 6) a.tone({ type: 'triangle', freq: BASS[chordIdx] * 4, dur: e * 0.8, gain: 0.2, when, bus: 'music', filter: { type: 'lowpass', freq: 900 } });
    // Off-beat chord plucks
    if (beat8 % 2 === 1) {
      for (const f of chord) a.tone({ type: 'square', freq: f * 2, dur: e * 0.55, gain: 0.028, when, bus: 'music', filter: { type: 'lowpass', freq: 2200 }, release: e * 0.4 });
    }
    // Melody
    const motif = MOTIFS[chordIdx];
    const m = motif[beat8 % 8];
    if (m >= 0 && beat8 < 8 + (chordIdx % 2) * 8) a.tone({ type: 'triangle', freq: PENTA[m], dur: e * 1.2, gain: 0.07, when, bus: 'music', vibrato: { rate: 6, depth: 4 } });
    // Rush layer: drums + driving bass (on the rush bus, crossfaded).
    if (this.rush || a.rushBus.gain.value > 0.01) {
      if (beat8 % 4 === 0) a.tone({ type: 'sine', freq: 140, freqEnd: 45, dur: 0.14, gain: 0.5, when, bus: 'rush' });
      if (beat8 % 8 === 4) a.noise({ dur: 0.1, gain: 0.25, when, bus: 'rush', filter: { type: 'bandpass', freq: 1800, q: 0.8 } });
      a.noise({ dur: 0.03, gain: beat8 % 2 ? 0.06 : 0.1, when, bus: 'rush', filter: { type: 'highpass', freq: 7000 } });
      a.tone({ type: 'sawtooth', freq: BASS[chordIdx] * (beat8 % 2 ? 4 : 2), dur: e * 0.7, gain: 0.08, when, bus: 'rush', filter: { type: 'lowpass', freq: 800 } });
    }
  }
}
