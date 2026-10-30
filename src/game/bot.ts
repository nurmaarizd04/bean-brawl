import { onGround, type ArenaMap } from "../data/maps";
import { ACTION, NO_INPUT, type FrameInput, type Fighter } from "./fighter";
import { angleDiff, rand } from "./math";

export type BotLevel = "easy" | "normal" | "hard";

export const BOT_LEVELS: { id: BotLevel; name: string; description: string; reaction: number; dash: number; care: number }[] = [
  { id: "easy", name: "Santai", description: "Bot lambat menyerang dan sering ceroboh di tepi arena.", reaction: 0.9, dash: 0.08, care: 0.5 },
  { id: "normal", name: "Normal", description: "Bot menyerang dengan kombo dan menjaga jarak dari tepi.", reaction: 0.45, dash: 0.25, care: 0.8 },
  { id: "hard", name: "Jago", description: "Bot cepat, sering dash, dan pintar mendorongmu ke tepi.", reaction: 0.2, dash: 0.6, care: 1 },
];

const BOT_NAMES = ["Kacang", "Bolu", "Tahu", "Cilok", "Gembul", "Bakpao", "Mochi", "Onde", "Lemper", "Cimol", "Klepon", "Getuk"];
export const botName = (i: number) => BOT_NAMES[i % BOT_NAMES.length];

export class Bot {
  private readonly level: (typeof BOT_LEVELS)[number];
  private target: Fighter | null = null;
  private retarget = 0;
  private cooldown = rand(0.3, 1);
  private wander = rand(0, Math.PI * 2);

  constructor(level: BotLevel) {
    this.level = BOT_LEVELS.find((l) => l.id === level) ?? BOT_LEVELS[1];
  }

  think(self: Fighter, fighters: Fighter[], map: ArenaMap, dt: number): FrameInput {
    if (!self.alive || self.falling || self.z > 1) return NO_INPUT;
    this.cooldown -= dt;
    this.retarget -= dt;
    if (this.retarget <= 0 || !this.target?.alive || this.target.falling) {
      this.retarget = rand(0.8, 1.6);
      let best: Fighter | null = null;
      let bestD = Infinity;
      for (const f of fighters) {
        if (f === self || !f.alive || f.falling) continue;
        const d = Math.hypot(f.x - self.x, f.y - self.y) * (f.percent > 80 ? 0.7 : 1);
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      this.target = best;
    }

    // Terlalu dekat tepi → kembali ke tengah
    const toCenter = Math.atan2(-self.y, -self.x);
    if (!onGround(map, self.x, self.y, 70 * this.level.care)) {
      return { mx: Math.cos(toCenter), my: Math.sin(toCenter), punch: false, kick: false, dash: false };
    }

    const target = this.target;
    if (!target) {
      this.wander += rand(-1, 1) * dt;
      return { mx: Math.cos(this.wander) * 0.5, my: Math.sin(this.wander) * 0.5, punch: false, kick: false, dash: false };
    }

    const dx = target.x - self.x;
    const dy = target.y - self.y;
    const d = Math.hypot(dx, dy);
    let dir = Math.atan2(dy, dx);

    // Jangan berjalan ke luar arena: belokkan ke tengah jika titik di depan berbahaya
    const ahead = (a: number) => onGround(map, self.x + Math.cos(a) * 60, self.y + Math.sin(a) * 60, 25 * this.level.care);
    if (!ahead(dir)) dir += angleDiff(dir, toCenter) * 0.7;

    const input: FrameInput = { mx: Math.cos(dir), my: Math.sin(dir), punch: false, kick: false, dash: false };

    if (d < 60) {
      input.mx *= 0.25;
      input.my *= 0.25;
      if (this.cooldown <= 0 && self.action === ACTION.idle) {
        // Kombo pukulan beruntun, tendangan saat lawan sudah "matang"
        const kick = target.percent > 70 ? Math.random() < 0.55 : Math.random() < 0.2;
        if (kick) input.kick = true;
        else input.punch = true;
        this.cooldown = input.punch && self.comboWindow > 0 ? rand(0.05, 0.15) : this.level.reaction * rand(0.6, 1.4);
      }
    } else if (d > 120 && d < 280 && Math.random() < this.level.dash * dt * 3 && ahead(dir)) {
      input.dash = true;
    }
    return input;
  }
}
