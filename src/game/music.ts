import { sound } from "./audio";

/**
 * Musik latar orisinal yang ceria (sequencer Web Audio).
 * "menu" = santai & bouncy, "battle" = cepat & bersemangat.
 * Progresi C mayor: C – G – Am – F (I – V – vi – IV).
 */

type Mood = "menu" | "battle";

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

const PROGRESSION = [
  { root: 36, chord: [60, 64, 67] }, // C
  { root: 43, chord: [59, 62, 67] }, // G
  { root: 45, chord: [60, 64, 69] }, // Am
  { root: 41, chord: [60, 65, 69] }, // F
];

// Melodi riang (16 langkah × 4 birama)
const LEAD: (number | null)[][] = [
  [72, null, 76, null, 79, null, 76, 77, 79, null, 84, null, 79, null, null, null],
  [74, null, 79, null, 83, null, 79, 81, 83, null, 86, null, 83, null, 81, null],
  [81, null, 79, null, 76, null, 72, 74, 76, null, 79, null, 76, null, 72, null],
  [77, null, 76, null, 74, null, 72, null, 74, null, 76, 77, 79, null, null, null],
];

class Music {
  private mood: Mood | null = null;
  private step = 0;
  private nextTime = 0;
  private timer = 0;

  play(mood: Mood) {
    if (this.mood === mood) return;
    this.mood = mood;
    sound.onUnlock(() => this.start());
  }

  private start() {
    if (this.timer || !sound.ctx) return;
    this.nextTime = sound.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  private schedule() {
    const ctx = sound.ctx;
    if (!ctx || !this.mood) return;
    const stepTime = 60 / (this.mood === "battle" ? 128 : 100) / 4;
    while (this.nextTime < ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime, stepTime);
      this.nextTime += stepTime;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, t: number, stepTime: number) {
    const bar = Math.floor(step / 16);
    const beat = step % 16;
    const { root, chord } = PROGRESSION[bar];
    const battle = this.mood === "battle";

    // Bass memantul (oktaf bergantian)
    if (beat % 2 === 0) this.voice(midi(root + (beat % 4 === 2 ? 12 : 0)), t, stepTime * 1.6, battle ? 0.22 : 0.18, "triangle", 900);
    // Akor "chop" di ketukan lemah
    if (beat % 4 === 2) for (const n of chord) this.voice(midi(n), t, stepTime * 1.2, battle ? 0.05 : 0.045, "square", 2200);

    if (battle) {
      if (beat % 4 === 0) this.kick(t, 0.85);
      if (beat === 4 || beat === 12) this.snare(t, 0.45);
      if (beat % 2 === 1) this.hat(t, 0.1);
      const note = LEAD[bar][beat];
      if (note !== null) this.voice(midi(note), t, stepTime * 1.7, 0.07, "square", 3500);
    } else {
      if (beat === 0 || beat === 10) this.kick(t, 0.4);
      if (beat === 8) this.snare(t, 0.18);
      const note = LEAD[bar][beat];
      if (note !== null && beat % 4 === 0) this.voice(midi(note), t, stepTime * 3, 0.06, "triangle", 4000);
    }
  }

  private voice(freq: number, t: number, duration: number, volume: number, type: OscillatorType, cutoff: number) {
    const ctx = sound.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(filter).connect(gain).connect(sound.musicBus!);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  private kick(t: number, volume: number) {
    const ctx = sound.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain).connect(sound.musicBus!);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  private noise(t: number, duration: number, volume: number, type: BiquadFilterType, freq: number) {
    const ctx = sound.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = sound.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(gain).connect(sound.musicBus!);
    src.start(t, Math.random() * 0.5, duration + 0.02);
  }

  private snare(t: number, volume: number) {
    this.noise(t, 0.16, volume, "bandpass", 2000);
  }

  private hat(t: number, volume: number) {
    this.noise(t, 0.04, volume, "highpass", 8000);
  }
}

export const music = new Music();
