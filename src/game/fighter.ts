import { onGround, type ArenaMap } from "../data/maps";
import type { Bot } from "./bot";
import { rotateTowards } from "./math";
import type { GameEvent } from "./protocol";

export const ACTION = { idle: 0, punch: 1, kick: 2, dash: 3, stun: 4 } as const;

export interface Attack {
  startup: number;
  active: number;
  recovery: number;
  range: number;
  /** Lebar sudut serangan (radian) */
  arc: number;
  damage: number;
  knock: number;
  lift: number;
  lunge: number;
  strength: 0 | 1 | 2;
}

export const ATTACKS = {
  punch: { startup: 0.07, active: 0.09, recovery: 0.16, range: 44, arc: 1.5, damage: 6, knock: 120, lift: 40, lunge: 150, strength: 0 },
  finisher: { startup: 0.1, active: 0.1, recovery: 0.28, range: 48, arc: 1.7, damage: 9, knock: 260, lift: 130, lunge: 210, strength: 1 },
  kick: { startup: 0.2, active: 0.1, recovery: 0.32, range: 54, arc: 1.8, damage: 13, knock: 330, lift: 240, lunge: 100, strength: 2 },
} satisfies Record<string, Attack>;

export const RADIUS = 18;
const SPEED = 205;
export const GRAVITY = 1150;
const DASH_SPEED = 580;
const DASH_TIME = 0.2;
const DASH_COOLDOWN = 1;

export interface FrameInput {
  mx: number;
  my: number;
  punch: boolean;
  kick: boolean;
  dash: boolean;
}

export const NO_INPUT: FrameInput = { mx: 0, my: 0, punch: false, kick: false, dash: false };

export class Fighter {
  readonly id: string;
  name: string;
  color: string;
  hat: string;
  x: number;
  y: number;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  facing = 0;
  /** Persen kerusakan: makin tinggi, makin jauh terpental */
  percent = 0;
  alive = true;
  falling = false;
  action: number = ACTION.idle;
  actionTime = 0;
  combo = 0;
  comboWindow = 0;
  stun = 0;
  invuln = 0;
  dashCooldown = 0;
  readonly hitIds = new Set<string>();
  lastHitBy: string | null = null;
  lastHitAt = 0;
  bot: Bot | null = null;
  // Animasi (lokal di setiap pemain)
  walk = 0;
  squash = 0;
  hitFlash = 0;

  constructor(id: string, name: string, color: string, hat: string, x: number, y: number) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.hat = hat;
    this.x = x;
    this.y = y;
  }

  get attack(): Attack | null {
    if (this.action === ACTION.punch) return this.combo === 3 ? ATTACKS.finisher : ATTACKS.punch;
    if (this.action === ACTION.kick) return ATTACKS.kick;
    return null;
  }

  get attackActive() {
    const a = this.attack;
    return !!a && this.actionTime >= a.startup && this.actionTime < a.startup + a.active;
  }

  get grounded() {
    return this.z <= 0.01 && !this.falling;
  }

  respawn(x: number, y: number) {
    Object.assign(this, { x, y, z: 220, vx: 0, vy: 0, vz: -50, percent: 0, alive: true, falling: false, action: ACTION.idle, actionTime: 0, combo: 0, stun: 0, invuln: 2.2, lastHitBy: null });
    this.facing = Math.atan2(-y, -x);
  }

  private start(kind: number, attack: Attack, input: FrameInput, emit: (e: GameEvent) => void) {
    this.action = kind;
    this.actionTime = 0;
    this.hitIds.clear();
    if (Math.hypot(input.mx, input.my) > 0.2) this.facing = Math.atan2(input.my, input.mx);
    this.vx += Math.cos(this.facing) * attack.lunge;
    this.vy += Math.sin(this.facing) * attack.lunge;
    emit({ k: "swing", id: this.id, t: kind === ACTION.kick ? 1 : 0 });
  }

  /** Fisika & aksi — dijalankan oleh pemegang simulasi (latihan / host) */
  simulate(dt: number, input: FrameInput, map: ArenaMap, emit: (e: GameEvent) => void) {
    if (!this.alive) return;
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.comboWindow = Math.max(0, this.comboWindow - dt);

    if (this.falling) {
      this.vz -= GRAVITY * dt;
      this.z += this.vz * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return;
    }

    const grounded = this.z <= 0.01;
    const magnitude = Math.min(1, Math.hypot(input.mx, input.my));

    if (this.stun > 0) {
      this.stun -= dt;
      this.action = ACTION.stun;
      if (this.stun <= 0) this.action = ACTION.idle;
    } else if (this.action === ACTION.punch || this.action === ACTION.kick) {
      this.actionTime += dt;
      const a = this.attack!;
      if (this.actionTime >= a.startup + a.active + a.recovery) {
        if (this.action === ACTION.punch) this.comboWindow = this.combo === 3 ? 0 : 0.35;
        this.action = ACTION.idle;
        this.actionTime = 0;
      }
    } else if (this.action === ACTION.dash) {
      this.actionTime += dt;
      if (this.actionTime >= DASH_TIME) this.action = ACTION.idle;
    }

    if (this.action === ACTION.idle) {
      if (input.dash && this.dashCooldown <= 0 && grounded) {
        if (magnitude > 0.2) this.facing = Math.atan2(input.my, input.mx);
        this.vx = Math.cos(this.facing) * DASH_SPEED;
        this.vy = Math.sin(this.facing) * DASH_SPEED;
        this.action = ACTION.dash;
        this.actionTime = 0;
        this.dashCooldown = DASH_COOLDOWN;
        this.invuln = Math.max(this.invuln, 0.18);
        emit({ k: "swing", id: this.id, t: 2 });
      } else if (input.kick) {
        this.start(ACTION.kick, ATTACKS.kick, input, emit);
      } else if (input.punch) {
        this.combo = this.comboWindow > 0 ? (this.combo % 3) + 1 : 1;
        this.start(ACTION.punch, this.combo === 3 ? ATTACKS.finisher : ATTACKS.punch, input, emit);
      }
    }

    if (this.action === ACTION.idle) {
      if (magnitude > 0.1) this.facing = rotateTowards(this.facing, Math.atan2(input.my, input.mx), 14 * dt);
      const k = grounded ? 1 - Math.exp(-map.grip * dt) : 1 - Math.exp(-1.5 * dt);
      this.vx += (input.mx * SPEED - this.vx) * k;
      this.vy += (input.my * SPEED - this.vy) * k;
    } else if (this.action !== ACTION.dash) {
      const friction = grounded ? map.friction : 0.4;
      this.vx *= Math.exp(-friction * dt);
      this.vy *= Math.exp(-friction * dt);
    }

    // Gerak vertikal (terlempar ke udara)
    if (!grounded || this.vz > 0) {
      this.vz -= GRAVITY * dt;
      this.z += this.vz * dt;
      if (this.z <= 0 && onGround(map, this.x, this.y)) {
        if (this.vz < -280) this.squash = 1;
        this.z = 0;
        this.vz = 0;
      }
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Keluar dari lantai → jatuh
    if (this.z <= 0.01 && !onGround(map, this.x, this.y)) {
      this.falling = true;
      this.vz = Math.min(this.vz, 0);
      this.action = ACTION.idle;
      emit({ k: "fall", id: this.id, x: Math.round(this.x), y: Math.round(this.y) });
    }
  }
}
