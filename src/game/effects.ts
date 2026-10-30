import type { VoidKind } from "../data/maps";
import { rand } from "./math";

export type ParticleKind = "smoke" | "dust" | "glow" | "star" | "drop";

/** Partikel 3D: x/y = posisi di lantai, z = ketinggian */
export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  grow: number;
  drag: number;
  gravity: number;
  /** "r,g,b" 0–255 */
  color: string;
}

export interface FloatingText {
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  size: number;
  /** Teks komik: membesar lalu mengecil */
  pop: boolean;
}

export interface Flash {
  x: number;
  y: number;
  z: number;
  intensity: number;
  color: number;
  life: number;
  maxLife: number;
}

const MAX = 900;
const WORDS = [
  ["POW!", "PAK!", "BUK!"],
  ["BAM!", "DUAK!", "WHAM!"],
  ["KAPOW!", "BOOM!", "DUESH!"],
];
const WORD_COLORS = ["#ffe066", "#ff9f43", "#ff5e5b"];

export class Effects {
  particles: Particle[] = [];
  texts: FloatingText[] = [];
  flashes: Flash[] = [];

  private add(p: Omit<Particle, "maxLife">) {
    if (this.particles.length >= MAX) this.particles.shift();
    this.particles.push({ ...p, maxLife: p.life });
  }

  hit(x: number, y: number, z: number, strength: 0 | 1 | 2, damage: number) {
    const count = [10, 16, 24][strength];
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(120, 320) * (1 + strength * 0.3);
      this.add({ kind: "star", x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(40, 260), life: rand(0.25, 0.5), size: rand(6, 11), grow: -10, drag: 4, gravity: 500, color: Math.random() < 0.5 ? "255,240,140" : "255,255,255" });
    }
    this.add({ kind: "glow", x, y, z, vx: 0, vy: 0, vz: 0, life: 0.14, size: 40 + strength * 22, grow: 220, drag: 0, gravity: 0, color: "255,250,210" });
    this.flashes.push({ x, y, z, intensity: 1 + strength, color: 0xfff1c0, life: 0.1, maxLife: 0.1 });
    const words = WORDS[strength];
    this.texts.push({ x: x + rand(-10, 10), y, z: z + 30, text: words[Math.floor(Math.random() * words.length)], color: WORD_COLORS[strength], life: 0.7, maxLife: 0.7, size: 22 + strength * 8, pop: true });
    this.texts.push({ x: x + rand(-14, 14), y, z: z + 6, text: `${damage}%`, color: "#ffffff", life: 0.8, maxLife: 0.8, size: 14, pop: false });
  }

  whoosh(x: number, y: number, facing: number) {
    for (let i = 0; i < 4; i++) {
      const a = facing + rand(-0.4, 0.4);
      this.add({ kind: "dust", x, y, z: rand(14, 30), vx: Math.cos(a) * rand(120, 220), vy: Math.sin(a) * rand(120, 220), vz: 0, life: rand(0.15, 0.25), size: rand(5, 8), grow: 20, drag: 6, gravity: 0, color: "255,255,255" });
    }
  }

  dash(x: number, y: number, facing: number) {
    for (let i = 0; i < 12; i++) {
      const a = facing + Math.PI + rand(-0.7, 0.7);
      this.add({ kind: "dust", x, y, z: 3, vx: Math.cos(a) * rand(60, 180), vy: Math.sin(a) * rand(60, 180), vz: rand(10, 60), life: rand(0.4, 0.7), size: rand(10, 16), grow: 24, drag: 3, gravity: 0, color: "230,225,215" });
    }
  }

  land(x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2);
      this.add({ kind: "dust", x, y, z: 2, vx: Math.cos(a) * rand(60, 150), vy: Math.sin(a) * rand(60, 150), vz: rand(5, 30), life: rand(0.4, 0.7), size: rand(10, 16), grow: 22, drag: 3, gravity: 0, color: "230,225,215" });
    }
  }

  /** Efek saat petarung jatuh ke "luar" arena, sesuai jenis map */
  splash(x: number, y: number, kind: VoidKind, z: number) {
    const palette: Record<VoidKind, [string, string]> = {
      water: ["120,200,255", "255,255,255"],
      icewater: ["180,230,255", "255,255,255"],
      lava: ["255,140,40", "255,220,90"],
      space: ["170,190,255", "255,255,255"],
      street: ["200,200,200", "255,220,120"],
    };
    const [c1, c2] = palette[kind];
    const hot = kind === "lava";
    for (let i = 0; i < 40; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(30, 160);
      this.add({ kind: hot || kind === "space" ? "glow" : "drop", x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(150, 420), life: rand(0.6, 1.1), size: rand(5, 11), grow: hot ? 6 : 0, drag: 1.2, gravity: 700, color: Math.random() < 0.6 ? c1 : c2 });
    }
    if (hot) {
      for (let i = 0; i < 14; i++) this.add({ kind: "smoke", x, y, z, vx: rand(-30, 30), vy: rand(-30, 30), vz: rand(40, 120), life: rand(1.2, 2), size: rand(20, 34), grow: 26, drag: 1, gravity: -10, color: "60,50,45" });
    }
    this.flashes.push({ x, y, z, intensity: 4, color: hot ? 0xff7a2a : 0xbfe6ff, life: 0.35, maxLife: 0.35 });
  }

  text(x: number, y: number, z: number, text: string, color: string, size = 26) {
    this.texts.push({ x, y, z, text, color, life: 1.4, maxLife: 1.4, size, pop: true });
  }

  sparkle(x: number, y: number) {
    for (let i = 0; i < 18; i++) {
      const a = rand(0, Math.PI * 2);
      this.add({ kind: "star", x, y, z: rand(0, 40), vx: Math.cos(a) * rand(30, 120), vy: Math.sin(a) * rand(30, 120), vz: rand(60, 200), life: rand(0.5, 0.9), size: rand(6, 10), grow: -6, drag: 2, gravity: 200, color: "255,255,200" });
    }
  }

  update(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.vz = p.vz * drag - p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.size = Math.max(0.5, p.size + p.grow * dt);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.z += (t.pop ? 25 : 45) * dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const f of this.flashes) f.life -= dt;
    this.flashes = this.flashes.filter((f) => f.life > 0);
  }
}
