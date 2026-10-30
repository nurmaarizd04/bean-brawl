export interface Stick {
  active: boolean;
  id: number;
  ox: number;
  oy: number;
  x: number;
  y: number;
}

export type ActionKind = "punch" | "kick" | "dash";

const STICK_RADIUS = 56;
const emptyStick = (): Stick => ({ active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 });

/**
 * Kontrol:
 * - HP: joystick muncul di tempat jari menyentuh sisi kiri; tombol Pukul/Tendang/Dash di kanan (HUD)
 * - Laptop: WASD/panah gerak · J/Spasi/klik kiri = pukul · K/klik kanan = tendang · L/Shift = dash
 */
export class Input {
  readonly radius = STICK_RADIUS;
  stick = emptyStick();
  /** Jumlah tombol ditekan (kumulatif) */
  counts: Record<ActionKind, number> = { punch: 0, kick: 0, dash: 0 };
  private consumed: Record<ActionKind, number> = { punch: 0, kick: 0, dash: 0 };
  private keys = new Set<string>();

  constructor(el: HTMLElement) {
    el.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  reset() {
    this.stick = emptyStick();
    this.keys.clear();
    this.consumed = { ...this.counts };
  }

  press(kind: ActionKind) {
    this.counts[kind]++;
  }

  /** true sekali per tekan */
  consume(kind: ActionKind) {
    if (this.counts[kind] > this.consumed[kind]) {
      this.consumed[kind] = this.counts[kind];
      return true;
    }
    return false;
  }

  private onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse") {
      if (e.button === 0) this.press("punch");
      else if (e.button === 2) this.press("kick");
      return;
    }
    if (e.clientX > window.innerWidth * 0.55 || this.stick.active) return;
    Object.assign(this.stick, { active: true, id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY });
  };

  private onMove = (e: PointerEvent) => {
    const s = this.stick;
    if (!s.active || s.id !== e.pointerId) return;
    s.x = e.clientX;
    s.y = e.clientY;
    const dx = s.x - s.ox;
    const dy = s.y - s.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_RADIUS * 1.6) {
      s.ox = s.x - (dx / d) * STICK_RADIUS * 1.6;
      s.oy = s.y - (dy / d) * STICK_RADIUS * 1.6;
    }
  };

  private onUp = (e: PointerEvent) => {
    if (this.stick.active && this.stick.id === e.pointerId) this.stick = emptyStick();
  };

  private onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    const key = e.key.toLowerCase();
    const handled = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "j", "k", "l", "shift"];
    if (handled.includes(key)) e.preventDefault();
    if (e.type === "keydown") {
      if (!e.repeat) {
        if (key === "j" || key === " ") this.press("punch");
        if (key === "k") this.press("kick");
        if (key === "l" || key === "shift") this.press("dash");
      }
      this.keys.add(key);
    } else this.keys.delete(key);
  };

  /** Vektor gerak (arah layar = arah dunia), panjang 0–1 */
  get move() {
    const s = this.stick;
    if (s.active) {
      const dx = s.x - s.ox;
      const dy = s.y - s.oy;
      const d = Math.hypot(dx, dy);
      if (d < 6) return { x: 0, y: 0 };
      const m = Math.min(1, d / STICK_RADIUS);
      return { x: (dx / d) * m, y: (dy / d) * m };
    }
    let x = 0;
    let y = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) y -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    const d = Math.hypot(x, y);
    return d ? { x: x / d, y: y / d } : { x: 0, y: 0 };
  }
}
