// Tiny WebAudio synth: oscillators, a noise buffer, ADSR, biquad filters, master compressor.
// No audio files. Unlocked on the first touchend/click with resume() + a silent buffer.
import { feel } from '../config/feel';

export interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  /** Seconds for the pitch glide (default: whole duration). */
  glide?: number;
  dur: number;
  attack?: number;
  release?: number;
  gain?: number;
  when?: number;
  filter?: { type: BiquadFilterType; freq: number; q?: number; freqEnd?: number };
  vibrato?: { rate: number; depth: number };
  bus?: 'sfx' | 'music' | 'rush';
  detune?: number;
  pan?: number;
}

export interface NoiseOpts {
  dur: number;
  gain?: number;
  attack?: number;
  release?: number;
  when?: number;
  filter: { type: BiquadFilterType; freq: number; q?: number; freqEnd?: number };
  bus?: 'sfx' | 'music' | 'rush';
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private comp!: DynamicsCompressorNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  rushBus!: GainNode;
  duckBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  unlocked = false;
  sfxOn = true;
  musicOn = true;
  onUnlock: (() => void) | null = null;

  /** Create/resume the context. Must be called from a user gesture. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.build();
      }
      const ctx = this.ctx;
      if (ctx.state === 'suspended') void ctx.resume();
      // Silent buffer kick (iOS).
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
      if (!this.unlocked) {
        this.unlocked = true;
        this.onUnlock?.();
      }
    } catch {
      /* audio unavailable: the game runs silent */
    }
  }

  private build(): void {
    const ctx = this.ctx!;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = feel.audio.masterGain;
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxOn ? feel.audio.sfxGain : 0;
    this.sfxBus.connect(this.comp);
    this.duckBus = ctx.createGain();
    this.duckBus.gain.value = 1;
    this.duckBus.connect(this.comp);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? feel.audio.musicGain : 0;
    this.musicBus.connect(this.duckBus);
    this.rushBus = ctx.createGain();
    this.rushBus.gain.value = 0;
    this.rushBus.connect(this.musicBus);
    const len = ctx.sampleRate * 1.5;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x7fffffff) * 2 - 1;
    }
  }

  get now(): number { return this.ctx?.currentTime ?? 0; }
  get ready(): boolean { return !!this.ctx && this.ctx.state === 'running'; }

  setSfx(on: boolean): void {
    this.sfxOn = on;
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(on ? feel.audio.sfxGain : 0, this.now, 0.05);
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? feel.audio.musicGain : 0, this.now, 0.1);
  }

  /** Duck the music (rush warning). */
  duck(amount: number, sec = 0.3): void {
    if (this.ctx) this.duckBus.gain.setTargetAtTime(amount, this.now, sec / 3);
  }

  private bus(name?: 'sfx' | 'music' | 'rush'): AudioNode {
    return name === 'music' ? this.musicBus : name === 'rush' ? this.rushBus : this.sfxBus;
  }

  /** Random pitch variance (±5%) so repeated sounds never feel canned. */
  vary(f: number, amount = feel.audio.pitchVariance): number {
    return f * (1 + (Math.random() * 2 - 1) * amount);
  }

  tone(o: ToneOpts): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if ((o.bus ?? 'sfx') === 'sfx' && !this.sfxOn) return;
    const t0 = Math.max(ctx.currentTime, o.when ?? ctx.currentTime);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t0 + (o.glide ?? o.dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const a = o.attack ?? 0.005, r = o.release ?? Math.min(0.2, o.dur * 0.6);
    const peak = o.gain ?? 0.3;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.setValueAtTime(peak, t0 + Math.max(a, o.dur - r));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node: AudioNode = osc;
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = o.vibrato.rate;
      lg.gain.value = o.vibrato.depth;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + o.dur + 0.05);
    }
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter.type;
      f.frequency.setValueAtTime(o.filter.freq, t0);
      if (o.filter.freqEnd) f.frequency.exponentialRampToValueAtTime(o.filter.freqEnd, t0 + o.dur);
      f.Q.value = o.filter.q ?? 1;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = o.pan;
      g.connect(p);
      p.connect(this.bus(o.bus));
    } else g.connect(this.bus(o.bus));
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
  }

  noise(o: NoiseOpts): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if ((o.bus ?? 'sfx') === 'sfx' && !this.sfxOn) return;
    const t0 = Math.max(ctx.currentTime, o.when ?? ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const off = Math.random() * 1.0;
    const f = ctx.createBiquadFilter();
    f.type = o.filter.type;
    f.frequency.setValueAtTime(o.filter.freq, t0);
    if (o.filter.freqEnd) f.frequency.exponentialRampToValueAtTime(o.filter.freqEnd, t0 + o.dur);
    f.Q.value = o.filter.q ?? 1;
    const g = ctx.createGain();
    const a = o.attack ?? 0.005, r = o.release ?? o.dur * 0.7;
    const peak = o.gain ?? 0.3;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.setValueAtTime(peak, t0 + Math.max(a, o.dur - r));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.bus(o.bus));
    src.start(t0, off, o.dur + 0.05);
  }

  suspend(): void { try { void this.ctx?.suspend(); } catch { /* ignore */ } }
  resume(): void { try { if (this.unlocked) void this.ctx?.resume(); } catch { /* ignore */ } }
}
