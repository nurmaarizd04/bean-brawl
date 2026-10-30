import { COLORS, HATS, randomLook } from "../data/cosmetics";
import { MAPS, mapById, onGround, type ArenaMap } from "../data/maps";
import { Renderer } from "../render/renderer";
import { sound } from "./audio";
import { Bot, botName, type BotLevel } from "./bot";
import { Effects } from "./effects";
import { ACTION, Fighter, NO_INPUT, RADIUS, type Attack, type FrameInput } from "./fighter";
import { Input } from "./input";
import { angleDiff, rand, smoothing } from "./math";
import { r1, r2, type FighterState, type GameEvent, type MatchPlayer, type MatchSettings, type NetInput, type ScoreRow, type Snapshot } from "./protocol";

export type Mode = "idle" | "demo" | "solo" | "host" | "client";

export interface HudState {
  percent: number;
  alive: boolean;
  respawnIn: number;
  kos: number;
  koLimit: number;
  timeLeft: number;
  dashReady: number;
  board: ScoreRow[];
}

export interface GameEvents {
  hud(state: HudState): void;
  banner(title: string, subtitle: string): void;
  killFeed(killer: string | null, victim: string, killerLocal: boolean, victimLocal: boolean): void;
  matchEnd(rows: ScoreRow[]): void;
}

const RESPAWN_TIME = 2.5;
const KO_DEPTH = -170;

export class Game {
  map: ArenaMap = MAPS[0];
  effects = new Effects();
  fighters: Fighter[] = [];
  readonly input: Input;
  readonly renderer: Renderer;
  mode: Mode = "idle";
  paused = false;
  local: Fighter | null = null;

  onSnapshot: (s: Snapshot) => void = () => {};
  onLocalInput: (input: NetInput) => void = () => {};

  private readonly events: GameEvents;
  private players: MatchPlayer[] = [];
  private settings: MatchSettings = { map: "island", koLimit: 10, timeLimit: 180 };
  private scores = new Map<string, { kos: number; falls: number }>();
  private respawnTimers = new Map<string, number>();
  private remoteInputs = new Map<string, NetInput>();
  private remoteSeen = new Map<string, NetInput>();
  private targets = new Map<string, { x: number; y: number; z: number; facing: number }>();
  private pendingEvents: GameEvent[] = [];
  private timeLeft = 0;
  private time = 0;
  private matchOver = false;
  private last = 0;
  private hudTimer = 0;
  private netTimer = 0;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLCanvasElement, events: GameEvents) {
    this.events = events;
    this.renderer = new Renderer(canvas, overlay);
    this.input = new Input(overlay);
    requestAnimationFrame(this.frame);
  }

  // ---------------- Mode ----------------

  private reset(map: ArenaMap) {
    this.map = map;
    this.renderer.setMap(map);
    this.effects = new Effects();
    this.fighters = [];
    this.local = null;
    this.scores.clear();
    this.respawnTimers.clear();
    this.remoteInputs.clear();
    this.remoteSeen.clear();
    this.targets.clear();
    this.pendingEvents = [];
    this.matchOver = false;
    this.paused = false;
    this.time = 0;
    this.input.reset();
  }

  private spawnPoint(index: number, total: number) {
    const a = (index / total) * Math.PI * 2 + 0.4;
    const r = (this.map.shape === "rect" ? Math.min(this.map.w, this.map.h) : this.map.size) * 0.55;
    for (let tries = 0; tries < 20; tries++) {
      const x = Math.cos(a) * r * (1 - tries * 0.03);
      const y = Math.sin(a) * r * (1 - tries * 0.03);
      if (onGround(this.map, x, y, 60) && !this.map.props.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + 40)) return { x, y };
    }
    return { x: 0, y: 0 };
  }

  private addFighter(p: MatchPlayer, index: number, total: number) {
    const spot = this.spawnPoint(index, total);
    const f = new Fighter(p.id, p.name, p.color, p.hat, spot.x, spot.y);
    f.facing = Math.atan2(-spot.y, -spot.x);
    f.invuln = 1.5;
    this.fighters.push(f);
    this.scores.set(p.id, { kos: 0, falls: 0 });
    return f;
  }

  /** Bot saling bertarung sebagai latar menu */
  startDemo() {
    this.reset(MAPS[Math.floor(Math.random() * MAPS.length)]);
    this.mode = "demo";
    this.players = Array.from({ length: 5 }, (_, i) => ({ id: `bot${i}`, name: botName(i), ...randomLook() }));
    this.players.forEach((p, i) => (this.addFighter(p, i, this.players.length).bot = new Bot("normal")));
    this.timeLeft = Infinity;
  }

  /** Latihan: kamu melawan bot */
  startSolo(me: MatchPlayer, mapId: string, bots: number, level: BotLevel) {
    this.reset(mapById(mapId));
    this.mode = "solo";
    this.settings = { map: mapId, koLimit: 5, timeLimit: 180 };
    const taken = new Set([me.color]);
    const free = COLORS.filter((c) => !taken.has(c.id));
    this.players = [
      { ...me, id: "me" },
      ...Array.from({ length: bots }, (_, i) => ({ id: `bot${i}`, name: botName(i), color: free[i % free.length].id, hat: HATS[(i * 3 + 1) % HATS.length].id })),
    ];
    this.players.forEach((p, i) => {
      const f = this.addFighter(p, i, this.players.length);
      if (p.id === "me") this.local = f;
      else f.bot = new Bot(level);
    });
    this.timeLeft = this.settings.timeLimit;
    this.events.banner("Bertarung!", `Lempar lawan keluar arena · ${this.settings.koLimit} KO untuk menang`);
    sound.fanfare();
  }

  startVersus(role: "host" | "client", players: MatchPlayer[], settings: MatchSettings, localId: string) {
    this.reset(mapById(settings.map));
    this.mode = role;
    this.settings = settings;
    this.players = players;
    players.forEach((p, i) => {
      const f = this.addFighter(p, i, players.length);
      if (p.id === localId) this.local = f;
    });
    this.timeLeft = settings.timeLimit;
    this.events.banner("Bertarung!", `${this.map.name} · ${settings.koLimit} KO untuk menang`);
    sound.fanfare();
  }

  stop() {
    this.mode = "idle";
  }

  setRemoteInput(id: string, input: NetInput) {
    this.remoteInputs.set(id, input);
  }

  removePlayer(id: string) {
    this.fighters = this.fighters.filter((f) => f.id !== id);
    this.players = this.players.filter((p) => p.id !== id);
  }

  get isVersus() {
    return this.mode === "host" || this.mode === "client";
  }

  get inMatch() {
    return this.mode === "solo" || this.isVersus;
  }

  private fighter(id: string) {
    return this.fighters.find((f) => f.id === id);
  }

  private nameOf(id: string | null) {
    return id ? (this.players.find((p) => p.id === id)?.name ?? "?") : null;
  }

  private volumeAt(x: number, y: number) {
    const f = this.renderer.focusPoint;
    const v = Math.max(0.15, 1 - Math.hypot(x - f.x, y - f.y) / 1200);
    return this.mode === "demo" ? v * 0.15 : v;
  }

  // ---------------- Event ----------------

  private emit = (ev: GameEvent) => {
    this.applyEvent(ev);
    if (this.mode === "host") this.pendingEvents.push(ev);
  };

  private applyEvent(ev: GameEvent) {
    switch (ev.k) {
      case "swing": {
        const f = this.fighter(ev.id);
        if (!f) break;
        if (ev.t === 2) {
          this.effects.dash(f.x, f.y, f.facing);
          sound.dash(this.volumeAt(f.x, f.y));
        } else {
          this.effects.whoosh(f.x + Math.cos(f.facing) * 20, f.y + Math.sin(f.facing) * 20, f.facing);
          sound.whoosh(this.volumeAt(f.x, f.y), ev.t === 1);
        }
        break;
      }
      case "hit": {
        const v = this.fighter(ev.v);
        if (v) {
          v.hitFlash = 1;
          v.squash = 1;
        }
        this.effects.hit(ev.x, ev.y, ev.z, ev.s, ev.d);
        sound.hit(ev.s, this.volumeAt(ev.x, ev.y));
        const involved = ev.v === this.local?.id || ev.a === this.local?.id;
        this.renderer.shake(involved ? 4 + ev.s * 4 : ev.s * 2);
        break;
      }
      case "fall":
        sound.fall(this.volumeAt(ev.x, ev.y) * 0.8);
        break;
      case "ko": {
        const v = this.fighter(ev.v);
        if (v) {
          this.effects.splash(v.x, v.y, this.map.void, Math.max(v.z, -60));
          sound.splash(this.volumeAt(v.x, v.y));
          v.alive = false;
        }
        if (this.mode === "demo") break;
        this.events.killFeed(this.nameOf(ev.a), this.nameOf(ev.v) ?? "?", ev.a === this.local?.id, ev.v === this.local?.id);
        if (ev.v === this.local?.id) {
          this.events.banner("KO!", ev.a ? `Dilempar oleh ${this.nameOf(ev.a)}` : "Kamu jatuh sendiri 😅");
          this.renderer.shake(14);
        } else if (ev.a === this.local?.id) {
          sound.ko();
          if (v) this.effects.text(v.x, v.y, 60, "KO!", "#ffe066", 40);
        }
        break;
      }
      case "spawn": {
        const f = this.fighter(ev.id);
        if (f) {
          f.alive = true;
          this.effects.sparkle(f.x, f.y);
          if (f === this.local) sound.spawn();
        }
        break;
      }
    }
  }

  // ---------------- Loop ----------------

  private frame = (time: number) => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (time - this.last) / 1000 || 0);
    this.last = time;
    if (this.mode === "idle") return;
    if (!this.paused || this.isVersus) {
      this.time += dt;
      if (this.mode === "client") this.updateClient(dt);
      else this.updateSim(dt);
    }
    this.renderer.render(dt, this);
  };

  private localFrameInput(): FrameInput {
    const move = this.input.move;
    return { mx: move.x, my: move.y, punch: this.input.consume("punch"), kick: this.input.consume("kick"), dash: this.input.consume("dash") };
  }

  /** Bantu arah serangan di HP: hadap ke lawan terdekat bila dekat */
  private assistFacing(f: Fighter, input: FrameInput) {
    if (!(input.punch || input.kick) || Math.hypot(input.mx, input.my) > 0.2) return input;
    let best: Fighter | null = null;
    let bestD = 90;
    for (const o of this.fighters) {
      if (o === f || !o.alive || o.falling) continue;
      const d = Math.hypot(o.x - f.x, o.y - f.y);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (best) {
      const a = Math.atan2(best.y - f.y, best.x - f.x);
      return { ...input, mx: Math.cos(a) * 0.15, my: Math.sin(a) * 0.15 };
    }
    return input;
  }

  private remoteFrameInput(id: string): FrameInput {
    const latest = this.remoteInputs.get(id);
    if (!latest) return NO_INPUT;
    const seen = this.remoteSeen.get(id) ?? { ...latest, p: latest.p, k: latest.k, d: latest.d };
    const input = { mx: latest.mx, my: latest.my, punch: latest.p > seen.p, kick: latest.k > seen.k, dash: latest.d > seen.d };
    // Satu tekan per frame; sisanya diproses frame berikutnya
    this.remoteSeen.set(id, { ...latest, p: input.punch ? seen.p + 1 : seen.p, k: input.kick ? seen.k + 1 : seen.k, d: input.dash ? seen.d + 1 : seen.d });
    return input;
  }

  private updateSim(dt: number) {
    for (const f of this.fighters) {
      let input = NO_INPUT;
      if (!this.matchOver && f.alive) {
        if (f === this.local) input = this.assistFacing(f, this.localFrameInput());
        else if (f.bot) input = f.bot.think(f, this.fighters, this.map, dt);
        else if (this.mode === "host") input = this.assistFacing(f, this.remoteFrameInput(f.id));
      }
      const wasAir = f.z > 0;
      f.simulate(dt, input, this.map, this.emit);
      if (wasAir && f.z === 0 && f.squash > 0.9) this.effects.land(f.x, f.y);
      this.animate(f, dt, Math.hypot(f.vx, f.vy));
    }
    this.resolveCollisions();
    this.resolveHits();
    this.handleFalls(dt);
    this.effects.update(dt);
    if (this.mode !== "demo") this.updateMatch(dt);
    this.followCamera();
    this.publishHud(dt);
    if (this.mode === "host") {
      this.netTimer -= dt;
      if (this.netTimer <= 0) {
        this.netTimer = 0.05;
        this.onSnapshot(this.snapshot());
        this.pendingEvents = [];
      }
    }
  }

  private animate(f: Fighter, dt: number, speed: number) {
    f.walk += speed * dt * 0.09;
    f.squash = Math.max(0, f.squash - dt * 5);
    f.hitFlash = Math.max(0, f.hitFlash - dt * 5);
  }

  private resolveCollisions() {
    const list = this.fighters.filter((f) => f.alive && !f.falling);
    for (const f of list) {
      if (f.z > 50) continue;
      for (const p of this.map.props) {
        const dx = f.x - p.x;
        const dy = f.y - p.y;
        const d = Math.hypot(dx, dy);
        const min = p.r + RADIUS;
        if (d < min && d > 0.01) {
          f.x = p.x + (dx / d) * min;
          f.y = p.y + (dy / d) * min;
          // Pantulan kecil saat terlempar menabrak tiang
          const dot = (f.vx * dx + f.vy * dy) / d;
          if (dot < 0) {
            f.vx -= (1.6 * dot * dx) / d;
            f.vy -= (1.6 * dot * dy) / d;
          }
        }
      }
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (Math.abs(a.z - b.z) > 30) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = RADIUS * 2;
        if (d >= min || d < 0.01) continue;
        const push = (min - d) / 2;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
      }
    }
  }

  private resolveHits() {
    for (const att of this.fighters) {
      if (!att.alive || att.falling || !att.attackActive) continue;
      const atk = att.attack!;
      for (const tgt of this.fighters) {
        if (tgt === att || !tgt.alive || tgt.falling || tgt.invuln > 0 || att.hitIds.has(tgt.id)) continue;
        if (Math.abs(tgt.z - att.z) > 40) continue;
        const dx = tgt.x - att.x;
        const dy = tgt.y - att.y;
        const d = Math.hypot(dx, dy);
        if (d > atk.range + RADIUS) continue;
        if (d > RADIUS && Math.abs(angleDiff(att.facing, Math.atan2(dy, dx))) > atk.arc / 2) continue;
        this.applyHit(att, tgt, atk, d > 1 ? Math.atan2(dy, dx) : att.facing);
      }
    }
  }

  private applyHit(att: Fighter, tgt: Fighter, atk: Attack, direction: number) {
    att.hitIds.add(tgt.id);
    tgt.percent = Math.min(999, tgt.percent + atk.damage);
    const knock = atk.knock * (1 + tgt.percent / 85);
    const angle = att.facing + angleDiff(att.facing, direction) * 0.5;
    tgt.vx = Math.cos(angle) * knock;
    tgt.vy = Math.sin(angle) * knock;
    tgt.vz = atk.lift * (1 + tgt.percent / 220);
    tgt.z = Math.max(tgt.z, 1);
    tgt.stun = 0.16 + knock / 1800;
    tgt.action = ACTION.stun;
    tgt.actionTime = 0;
    tgt.combo = 0;
    tgt.lastHitBy = att.id;
    tgt.lastHitAt = this.time;
    this.emit({ k: "hit", a: att.id, v: tgt.id, x: r1((att.x + tgt.x) / 2), y: r1((att.y + tgt.y) / 2), z: r1(tgt.z + 22), d: atk.damage, s: atk.strength });
  }

  private handleFalls(dt: number) {
    for (const f of this.fighters) {
      if (f.alive && f.falling && f.z < KO_DEPTH) {
        const killer = f.lastHitBy && this.time - f.lastHitAt < 8 ? f.lastHitBy : null;
        this.emit({ k: "ko", v: f.id, a: killer });
        f.alive = false;
        f.falling = false;
        const victim = this.scores.get(f.id);
        if (victim) victim.falls++;
        const score = killer ? this.scores.get(killer) : null;
        if (score) {
          score.kos++;
          if (score.kos >= this.settings.koLimit && this.mode !== "demo") this.endMatch();
        }
        this.respawnTimers.set(f.id, RESPAWN_TIME);
      }
    }
    for (const [id, left] of this.respawnTimers) {
      const next = left - dt;
      if (next > 0) {
        this.respawnTimers.set(id, next);
        continue;
      }
      this.respawnTimers.delete(id);
      const f = this.fighter(id);
      if (!f || this.matchOver) continue;
      const others = this.fighters.filter((o) => o !== f && o.alive);
      let spot = { x: 0, y: 0 };
      for (let i = 0; i < 30; i++) {
        const c = this.spawnPoint(Math.floor(rand(0, 12)), 12);
        if (others.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > 120)) {
          spot = c;
          break;
        }
        spot = c;
      }
      f.respawn(spot.x, spot.y);
      this.emit({ k: "spawn", id });
    }
  }

  private updateMatch(dt: number) {
    if (this.matchOver) return;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft <= 0) this.endMatch();
  }

  private endMatch() {
    if (this.matchOver) return;
    this.matchOver = true;
    this.events.matchEnd(this.scoreRows());
  }

  scoreRows(): ScoreRow[] {
    return this.players
      .map((p) => {
        const s = this.scores.get(p.id) ?? { kos: 0, falls: 0 };
        return { id: p.id, name: p.name, color: p.color, kos: s.kos, falls: s.falls, local: p.id === this.local?.id };
      })
      .sort((a, b) => b.kos - a.kos || a.falls - b.falls);
  }

  // ---------------- Client ----------------

  private updateClient(dt: number) {
    const k = smoothing(16, dt);
    for (const f of this.fighters) {
      const t = this.targets.get(f.id);
      if (t) {
        const bx = f.x;
        const by = f.y;
        f.x += (t.x - f.x) * k;
        f.y += (t.y - f.y) * k;
        f.z += (t.z - f.z) * k;
        f.facing += angleDiff(f.facing, t.facing) * k;
        f.vx = (f.x - bx) / Math.max(dt, 0.001);
        f.vy = (f.y - by) / Math.max(dt, 0.001);
      }
      if (f.action === ACTION.punch || f.action === ACTION.kick || f.action === ACTION.dash) f.actionTime += dt;
      this.animate(f, dt, Math.hypot(f.vx, f.vy));
    }
    this.effects.update(dt);
    this.timeLeft = Math.max(0, this.timeLeft - dt);

    this.netTimer -= dt;
    if (this.netTimer <= 0) {
      this.netTimer = 1 / 30;
      const move = this.input.move;
      this.onLocalInput({ mx: move.x, my: move.y, p: this.input.counts.punch, k: this.input.counts.kick, d: this.input.counts.dash });
    }
    this.followCamera();
    this.publishHud(dt);
  }

  applySnapshot(s: Snapshot) {
    if (this.mode !== "client") return;
    const seen = new Set<string>();
    for (const [id, x, y, z, facing, percent, action, actionTime, stun, invuln, falling, alive, combo] of s.fighters as FighterState[]) {
      seen.add(id);
      const f = this.fighter(id);
      if (!f) continue;
      const prev = this.targets.get(id);
      const teleported = !prev || (alive && !f.alive) || Math.hypot(f.x - x, f.y - y) > 200;
      if (teleported) {
        f.x = x;
        f.y = y;
        f.z = z;
        f.facing = facing;
      }
      this.targets.set(id, { x, y, z, facing });
      f.percent = percent;
      if (action !== f.action || Math.abs(actionTime - f.actionTime) > 0.15) {
        f.action = action;
        f.actionTime = actionTime;
      }
      f.combo = combo;
      f.stun = stun ? 0.2 : 0;
      f.invuln = invuln ? 1 : 0;
      f.falling = falling === 1;
      if (alive === 1) f.alive = true;
    }
    this.fighters = this.fighters.filter((f) => seen.has(f.id));
    for (const [id, kos, falls] of s.scores) this.scores.set(id, { kos, falls });
    this.respawnTimers = new Map(s.respawn);
    this.timeLeft = s.time;
    for (const ev of s.ev) this.applyEvent(ev);
    if (s.over && !this.matchOver) {
      this.matchOver = true;
      this.events.matchEnd(this.scoreRows());
    }
  }

  private snapshot(): Snapshot {
    return {
      time: Math.ceil(this.timeLeft),
      fighters: this.fighters.map((f) => [
        f.id,
        r1(f.x),
        r1(f.y),
        r1(f.z),
        r2(f.facing),
        Math.round(f.percent),
        f.action,
        r2(f.actionTime),
        f.stun > 0 ? 1 : 0,
        f.invuln > 0 ? 1 : 0,
        f.falling ? 1 : 0,
        f.alive ? 1 : 0,
        f.combo,
      ]),
      scores: [...this.scores].map(([id, s]) => [id, s.kos, s.falls]),
      respawn: [...this.respawnTimers].map(([id, t]) => [id, Math.ceil(t)]),
      ev: this.pendingEvents,
      over: this.matchOver ? 1 : 0,
    };
  }

  // ---------------- Kamera & HUD ----------------

  private followCamera() {
    const f = this.local;
    if (f && (f.alive || f.falling)) this.renderer.focus(f.x * 0.75, f.y * 0.75);
    else this.renderer.focus(0, 0);
  }

  private publishHud(dt: number) {
    this.hudTimer -= dt;
    if (this.hudTimer > 0 || !this.local || !this.inMatch) return;
    this.hudTimer = 0.1;
    const f = this.local;
    const mine = this.scores.get(f.id);
    this.events.hud({
      percent: Math.round(f.percent),
      alive: f.alive,
      respawnIn: this.respawnTimers.get(f.id) ?? 0,
      kos: mine?.kos ?? 0,
      koLimit: this.settings.koLimit,
      timeLeft: this.timeLeft,
      dashReady: this.mode === "client" ? 1 : 1 - f.dashCooldown,
      board: this.scoreRows(),
    });
  }
}
