/** Efek suara & bus musik, disintesis langsung lewat Web Audio (tanpa file audio). */
export class Sound {
  ctx: AudioContext | null = null;
  sfxBus: GainNode | null = null;
  musicBus: GainNode | null = null;
  noise: AudioBuffer | null = null;
  sfxOn = true;
  musicOn = true;
  private unlockListeners: (() => void)[] = [];

  constructor() {
    try {
      this.sfxOn = localStorage.getItem("brawl-sfx") !== "0";
      this.musicOn = localStorage.getItem("brawl-music") !== "0";
    } catch {
      /* penyimpanan tidak tersedia */
    }
  }

  /** Harus dipanggil dari interaksi pengguna (klik/tap) */
  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxOn ? 0.75 : 0;
      this.sfxBus.connect(limiter);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.4 : 0;
      this.musicBus.connect(limiter);
      const length = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      for (const fn of this.unlockListeners) fn();
    }
    void this.ctx.resume();
  }

  onUnlock(fn: () => void) {
    if (this.ctx) fn();
    else this.unlockListeners.push(fn);
  }

  private persist(key: string, on: boolean) {
    try {
      localStorage.setItem(key, on ? "1" : "0");
    } catch {
      /* abaikan */
    }
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
    this.persist("brawl-sfx", on);
    if (this.sfxBus && this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 0.75 : 0, this.ctx.currentTime, 0.05);
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    this.persist("brawl-music", on);
    if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.4 : 0, this.ctx.currentTime, 0.3);
  }

  private noiseBurst(duration: number, from: number, to: number, volume: number, type: BiquadFilterType = "lowpass", delay = 0) {
    if (!this.ctx || !this.sfxBus || !this.noise) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(gain).connect(this.sfxBus);
    src.start(t, Math.random() * 0.4, duration + 0.05);
  }

  private tone(from: number, to: number, duration: number, volume: number, type: OscillatorType = "sine", delay = 0) {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  whoosh(volume = 1, heavy = false) {
    this.noiseBurst(heavy ? 0.25 : 0.14, heavy ? 900 : 1800, heavy ? 3000 : 5000, 0.35 * volume, "bandpass");
  }

  hit(strength: 0 | 1 | 2, volume = 1) {
    this.noiseBurst(0.12 + strength * 0.06, 2600, 400, (0.55 + strength * 0.2) * volume);
    this.tone(180 - strength * 30, 60, 0.16 + strength * 0.06, (0.55 + strength * 0.15) * volume, "sine");
    if (strength === 2) this.tone(90, 40, 0.3, 0.6 * volume, "triangle", 0.02);
  }

  dash(volume = 1) {
    this.noiseBurst(0.22, 600, 3200, 0.3 * volume, "bandpass");
  }

  boing(volume = 1) {
    this.tone(220, 520, 0.18, 0.3 * volume, "triangle");
  }

  fall(volume = 1) {
    this.tone(900, 120, 0.9, 0.35 * volume, "sine");
  }

  splash(volume = 1) {
    this.noiseBurst(0.7, 3000, 300, 0.7 * volume);
    this.tone(120, 50, 0.4, 0.5 * volume);
  }

  ko() {
    this.tone(523, 523, 0.12, 0.3, "square");
    this.tone(659, 659, 0.12, 0.3, "square", 0.1);
    this.tone(784, 784, 0.3, 0.3, "square", 0.2);
  }

  spawn() {
    this.tone(400, 1200, 0.3, 0.22, "triangle");
  }

  fanfare() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.22, 0.25, "square", i * 0.12));
  }

  click() {
    this.tone(900, 600, 0.06, 0.15, "triangle");
  }
}

export const sound = new Sound();
