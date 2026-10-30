import { COLORS, HATS, colorHex, type Look } from "../data/cosmetics";
import { MAPS, mapById } from "../data/maps";
import { sound } from "../game/audio";
import { BOT_LEVELS, type BotLevel } from "../game/bot";
import type { Game, HudState } from "../game/game";
import type { ActionKind } from "../game/input";
import { music } from "../game/music";
import type { MatchSettings, ScoreRow } from "../game/protocol";
import { ClientSession, HostSession, MAX_PLAYERS, normalizeCode, type LobbyPlayer } from "../net/session";
import { drawMapThumb } from "../render/models";
import { BeanPreview } from "../render/preview";
import { percentColor } from "../render/renderer";

type ScreenId = "menu" | "wardrobe" | "solo" | "help" | "online" | "lobby" | "pause" | "results" | "alert" | "none";

const ICONS = {
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>`,
  sfxOn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>`,
  sfxOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/></svg>`,
  musicOn: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 17.5V6l11-2v11.5" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="6.5" cy="17.5" r="2.8"/><circle cx="17.5" cy="15.5" r="2.8"/></svg>`,
  musicOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 17.5V6l11-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5" fill="currentColor"/><circle cx="17.5" cy="15.5" r="2.5" fill="currentColor"/><path d="M3 3l18 18" stroke-width="2.6"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>`,
};

const STORAGE = { name: "brawl-name", color: "brawl-color", hat: "brawl-hat", map: "brawl-map", bots: "brawl-bots", level: "brawl-level" };
const KO_OPTIONS = [3, 5, 10];
const TIME_OPTIONS = [120, 180, 300];

function load(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* abaikan */
  }
}

const escapeHtml = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const hatIcon = (id: string) => (id === "none" ? "" : (HATS.find((h) => h.id === id)?.icon ?? ""));
/** Ikon kacang kecil (CSS) berwarna sesuai karakter */
const bean = (color: string, size = "") => `<span class="bean ${size}" style="--c:${colorHex(color)}"></span>`;

async function enterFullscreen() {
  if (!matchMedia("(pointer: coarse)").matches) return;
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
    await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.("landscape");
  } catch {
    /* tidak didukung */
  }
}

export class App {
  private readonly root: HTMLElement;
  private readonly game: Game;
  private screen: ScreenId = "menu";
  private look: Look;
  private name: string;
  private soloMap: string;
  private soloBots: number;
  private soloLevel: BotLevel;
  private wardrobeReturn: ScreenId = "menu";
  private inMatch = false;
  private versus = false;
  private host: HostSession | null = null;
  private client: ClientSession | null = null;
  private preview: BeanPreview | null = null;
  private bannerTimer = 0;

  constructor(root: HTMLElement, game: Game) {
    this.root = root;
    this.game = game;
    this.look = { color: load(STORAGE.color) ?? COLORS[Math.floor(Math.random() * COLORS.length)].id, hat: load(STORAGE.hat) ?? "none" };
    this.name = load(STORAGE.name) ?? `Kacang${Math.floor(Math.random() * 90 + 10)}`;
    this.soloMap = load(STORAGE.map) ?? "island";
    this.soloBots = Number(load(STORAGE.bots)) || 3;
    this.soloLevel = (load(STORAGE.level) as BotLevel) ?? "normal";
    root.innerHTML = this.markup();
    this.bind();
    this.renderToggles();
    this.renderMenu();
    this.renderSolo();
    game.onSnapshot = (s) => this.host?.sendSnapshot(s);
    game.onLocalInput = (input) => this.client?.sendInput(input);
    music.play("menu");

    const roomFromUrl = new URLSearchParams(location.search).get("room");
    if (roomFromUrl) {
      this.$<HTMLInputElement>("#room-code").value = normalizeCode(roomFromUrl);
      this.show("online");
      history.replaceState(null, "", location.pathname);
    } else this.show("menu");
    document.fonts?.ready.then(() => this.renderSolo());
  }

  private $<T extends HTMLElement = HTMLElement>(selector: string) {
    return this.root.querySelector(selector) as T;
  }

  // ---------------- Markup ----------------

  private markup() {
    const mapCards = (attr: string) =>
      MAPS.map((m) => `<button class="map-card" ${attr}="${m.id}"><canvas width="240" height="150"></canvas><b>${m.name}</b><span>${m.description}</span></button>`).join("");
    return `
    <section class="screen backdrop" id="screen-menu">
      <div class="menu-left">
        <h1 class="logo">BEAN<br/><span>BRAWL</span></h1>
        <p class="tagline">Adu jotos kacang antariksa!</p>
        <div class="menu-actions">
          <button class="btn btn-primary" data-action="online">⚔ Main Bersama Teman</button>
          <button class="btn" data-action="solo">🤖 Latihan vs Bot</button>
          <button class="btn" data-action="wardrobe">👕 Karakter</button>
          <button class="btn" data-action="help">❓ Cara Main</button>
        </div>
      </div>
      <div class="menu-right">
        <div class="toggles">
          <button class="icon-btn" data-action="toggle-music" aria-label="Musik"></button>
          <button class="icon-btn" data-action="toggle-sfx" aria-label="Efek suara"></button>
        </div>
        <button class="me-card" data-action="wardrobe" id="me-card"></button>
      </div>
    </section>

    <section class="screen backdrop panel-screen" id="screen-wardrobe">
      <div class="screen-head">
        <button class="icon-btn" data-action="wardrobe-back" aria-label="Kembali">${ICONS.back}</button>
        <h2>Karakter Kamu</h2>
      </div>
      <div class="wardrobe">
        <canvas id="bean-preview"></canvas>
        <div class="wardrobe-panel">
          <label class="field">Nama<input id="player-name" maxlength="12" autocomplete="off" spellcheck="false" /></label>
          <div class="field-label">Warna</div>
          <div class="swatches">${COLORS.map((c) => `<button class="swatch" data-color="${c.id}" style="--c:${c.hex}" aria-label="${c.name}"></button>`).join("")}</div>
          <div class="field-label">Topi</div>
          <div class="hats">${HATS.map((h) => `<button class="hat" data-hat="${h.id}"><span>${h.icon}</span>${h.name}</button>`).join("")}</div>
          <button class="btn btn-primary" data-action="wardrobe-back">Simpan</button>
        </div>
      </div>
    </section>

    <section class="screen backdrop panel-screen" id="screen-solo">
      <div class="screen-head">
        <button class="icon-btn" data-action="menu" aria-label="Kembali">${ICONS.back}</button>
        <h2>Latihan vs Bot</h2>
        <button class="btn btn-primary head-start" data-action="start-solo">▶ Mulai</button>
      </div>
      <div class="solo-body">
        <div class="map-row">${mapCards("data-solo-map")}</div>
        <div class="solo-options">
          <div class="setting"><span>Jumlah bot</span><div class="segmented">${[1, 2, 3, 4, 5].map((n) => `<button data-bots="${n}">${n}</button>`).join("")}</div></div>
          <div class="setting"><span>Kesulitan</span><div class="segmented">${BOT_LEVELS.map((l) => `<button data-level="${l.id}">${l.name}</button>`).join("")}</div></div>
        </div>
      </div>
    </section>

    <section class="screen backdrop center-screen" id="screen-online">
      <div class="dialog online-dialog">
        <div class="dialog-head">
          <button class="icon-btn" data-action="menu" aria-label="Kembali">${ICONS.back}</button>
          <h2>Main Bersama Teman</h2>
        </div>
        <p class="sub">Semua lawan semua — hingga ${MAX_PLAYERS} pemain lewat internet.</p>
        <div class="online-me" id="online-me"></div>
        <div class="online-grid">
          <section>
            <h4>Buat room</h4>
            <p>Kamu jadi host & pilih map. Bagikan kode ke teman.</p>
            <button class="btn btn-primary" data-action="create">Buat Room</button>
          </section>
          <section>
            <h4>Gabung room</h4>
            <p>Masukkan kode 5 huruf dari temanmu.</p>
            <div class="join-row">
              <input id="room-code" maxlength="5" placeholder="KODE" autocomplete="off" spellcheck="false" />
              <button class="btn btn-primary" data-action="join">Gabung</button>
            </div>
          </section>
        </div>
        <p class="status" id="online-status"></p>
      </div>
    </section>

    <section class="screen backdrop panel-screen" id="screen-lobby">
      <div class="screen-head">
        <button class="icon-btn" data-action="leave" aria-label="Keluar room">${ICONS.back}</button>
        <h2>Lobi</h2>
        <div class="room-code">
          <span>KODE</span><b id="lobby-code">-----</b>
          <button class="icon-btn" data-action="copy-code" aria-label="Salin kode">${ICONS.copy}</button>
          <button class="icon-btn" data-action="share-code" aria-label="Bagikan">${ICONS.share}</button>
        </div>
      </div>
      <div class="lobby">
        <div class="panel lobby-players">
          <div class="lobby-count" id="lobby-count"></div>
          <ul id="lobby-list"></ul>
          <button class="btn btn-small" data-action="lobby-wardrobe">👕 Ganti Karakter</button>
        </div>
        <aside class="panel lobby-side">
          <div class="field-label" id="lobby-map-label">Map</div>
          <div class="map-row small" id="lobby-maps">${mapCards("data-lobby-map")}</div>
          <div class="setting"><span>Target KO</span><div class="segmented" id="ko-seg">${KO_OPTIONS.map((k) => `<button data-ko="${k}">${k}</button>`).join("")}</div></div>
          <div class="setting"><span>Durasi</span><div class="segmented" id="time-seg">${TIME_OPTIONS.map((t) => `<button data-time="${t}">${t / 60} mnt</button>`).join("")}</div></div>
          <button class="btn btn-primary" id="btn-start" data-action="start-match">⚔ Mulai Bertarung</button>
          <p class="status" id="lobby-status"></p>
        </aside>
      </div>
    </section>

    <section class="screen dim center-screen" id="screen-help">
      <div class="dialog">
        <h2>Cara Main</h2>
        <p class="sub">Pukul lawan untuk menaikkan <b>persen kerusakannya</b> — makin tinggi persennya, makin jauh ia terpental. Lempar keluar arena untuk <b>KO</b>!</p>
        <div class="help-grid">
          <section><h4>📱 Di HP</h4><ul>
            <li>Geser <b>sisi kiri</b> layar untuk berjalan.</li>
            <li>👊 <b>Pukul</b>: tekan 3× cepat untuk kombo.</li>
            <li>🦶 <b>Tendang</b>: lambat tapi melempar jauh ke atas.</li>
            <li>💨 <b>Dash</b>: melesat & kebal sesaat.</li></ul></section>
          <section><h4>💻 Di Laptop</h4><ul>
            <li><b>WASD</b> / panah untuk berjalan.</li>
            <li><b>J</b> / <b>Spasi</b> / klik kiri = pukul.</li>
            <li><b>K</b> / klik kanan = tendang.</li>
            <li><b>L</b> / <b>Shift</b> = dash · <b>Esc</b> = menu.</li></ul></section>
          <section><h4>🗺️ Map</h4><ul>
            <li><b>Arena Es</b> licin — sekali terdorong susah berhenti!</li>
            <li>Tiang & batu bisa jadi tameng atau tempat memantul.</li></ul></section>
          <section><h4>🏆 Menang</h4><ul>
            <li>KO dihitung untuk yang terakhir memukul korban.</li>
            <li>Yang pertama mencapai target KO menang.</li></ul></section>
        </div>
        <div class="dialog-actions"><button class="btn btn-primary" data-action="menu">Siap!</button></div>
      </div>
    </section>

    <section class="screen" id="hud">
      <div class="hud-me">
        <div class="hud-percent" id="hud-percent">0%</div>
        <div class="hud-name" id="hud-name"></div>
        <ol class="hud-board" id="hud-board"></ol>
      </div>
      <div class="hud-center">
        <div class="hud-time" id="hud-time"></div>
        <div class="hud-ko" id="hud-ko"></div>
      </div>
      <div class="hud-right">
        <button class="icon-btn" data-action="toggle-music" aria-label="Musik"></button>
        <button class="icon-btn" data-action="toggle-sfx" aria-label="Efek suara"></button>
        <button class="icon-btn" data-action="pause" aria-label="Menu">${ICONS.pause}</button>
      </div>
      <ul class="killfeed" id="killfeed"></ul>
      <div class="respawn" id="respawn"></div>
      <div class="actions">
        <button class="act act-dash" data-press="dash"><span>💨</span><em id="dash-ring"></em></button>
        <button class="act act-kick" data-press="kick"><span>🦶</span></button>
        <button class="act act-punch" data-press="punch"><span>👊</span></button>
      </div>
      <div class="key-hint">WASD gerak · J pukul · K tendang · L dash</div>
      <div id="banner"><div class="title"></div><div class="subtitle"></div></div>
    </section>

    <section class="screen dim center-screen" id="screen-pause">
      <div class="dialog">
        <h2 id="pause-title">Jeda</h2>
        <p class="sub" id="pause-info"></p>
        <div class="dialog-actions" id="pause-actions"></div>
      </div>
    </section>

    <section class="screen dim center-screen" id="screen-results">
      <div class="dialog results-dialog">
        <h2 id="results-title">Selesai!</h2>
        <p class="sub" id="results-sub"></p>
        <div class="podium" id="podium"></div>
        <table class="scoreboard"><thead><tr><th>#</th><th>Pemain</th><th>KO</th><th>Jatuh</th></tr></thead><tbody id="results-body"></tbody></table>
        <div class="dialog-actions" id="results-actions"></div>
      </div>
    </section>

    <section class="screen dim center-screen" id="screen-alert">
      <div class="dialog">
        <h2 id="alert-title">Ups!</h2>
        <p class="sub" id="alert-text"></p>
        <div class="dialog-actions"><button class="btn btn-primary" data-action="menu">OK</button></div>
      </div>
    </section>`;
  }

  private bind() {
    this.root.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const pick = (attr: string) => t.closest<HTMLElement>(`[${attr}]`)?.getAttribute(attr) ?? null;
      const action = pick("data-action");
      const color = pick("data-color");
      const hat = pick("data-hat");
      const soloMap = pick("data-solo-map");
      const lobbyMap = pick("data-lobby-map");
      const bots = pick("data-bots");
      const level = pick("data-level");
      const ko = pick("data-ko");
      const time = pick("data-time");
      if ([action, color, hat, soloMap, lobbyMap, bots, level, ko, time].some((v) => v !== null)) {
        sound.unlock();
        sound.click();
      }
      if (color || hat) this.setLook({ color: color ?? this.look.color, hat: hat ?? this.look.hat });
      if (soloMap) this.soloMap = soloMap;
      if (bots) this.soloBots = Number(bots);
      if (level) this.soloLevel = level as BotLevel;
      if (soloMap || bots || level) this.renderSolo();
      if (this.host && lobbyMap) this.host.setSettings({ ...this.host.settings, map: lobbyMap });
      if (this.host && ko) this.host.setSettings({ ...this.host.settings, koLimit: Number(ko) });
      if (this.host && time) this.host.setSettings({ ...this.host.settings, timeLimit: Number(time) });
      if (action) this.handleAction(action);
    });

    // Tombol aksi di HUD (HP): pointerdown agar responsif & bisa ditekan bersamaan dengan joystick
    for (const btn of this.root.querySelectorAll<HTMLElement>("[data-press]")) {
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        sound.unlock();
        btn.classList.add("down");
        this.game.input.press(btn.dataset.press as ActionKind);
      });
      const up = () => btn.classList.remove("down");
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointerleave", up);
      btn.addEventListener("pointercancel", up);
    }

    const nameInput = this.$<HTMLInputElement>("#player-name");
    nameInput.value = this.name;
    nameInput.addEventListener("input", () => {
      this.name = nameInput.value.trim().slice(0, 12) || "Kacang";
      save(STORAGE.name, this.name);
      this.renderMenu();
    });
    const code = this.$<HTMLInputElement>("#room-code");
    code.addEventListener("input", () => (code.value = normalizeCode(code.value)));
    code.addEventListener("keydown", (e) => e.key === "Enter" && void this.joinRoom());
    for (const input of this.root.querySelectorAll("input")) input.addEventListener("pointerdown", (e) => e.stopPropagation());

    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (this.screen === "none" && this.inMatch) this.openPause();
      else if (this.screen === "pause") this.resume();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.screen === "none" && this.inMatch && !this.versus) this.openPause();
    });
  }

  private handleAction(action: string) {
    switch (action) {
      case "online":
        this.renderMenu();
        this.show("online");
        break;
      case "solo":
        if (this.inMatch) this.leaveMatch();
        this.show("solo");
        break;
      case "wardrobe":
        this.wardrobeReturn = "menu";
        this.show("wardrobe");
        break;
      case "lobby-wardrobe":
        this.wardrobeReturn = "lobby";
        this.show("wardrobe");
        break;
      case "wardrobe-back":
        this.host?.setLocalLook(this.look.color, this.look.hat);
        this.host?.setLocalName(this.name);
        this.client?.setLook(this.look.color, this.look.hat);
        this.show(this.wardrobeReturn);
        break;
      case "help":
        this.show("help");
        break;
      case "menu":
        if (this.screen === "alert") this.leaveOnline();
        this.show("menu");
        break;
      case "start-solo":
        this.startSolo();
        break;
      case "create":
        void this.createRoom();
        break;
      case "join":
        void this.joinRoom();
        break;
      case "leave":
        this.leaveOnline();
        this.show("menu");
        break;
      case "copy-code":
        void this.copyInvite(false);
        break;
      case "share-code":
        void this.copyInvite(true);
        break;
      case "start-match":
      case "rematch":
        this.startMatch();
        break;
      case "to-lobby":
        this.host?.backToLobby();
        this.leaveMatch();
        this.show("lobby");
        break;
      case "solo-again":
        this.startSolo();
        break;
      case "pause":
        this.openPause();
        break;
      case "resume":
        this.resume();
        break;
      case "quit":
        if (this.versus) this.leaveOnline();
        else this.leaveMatch();
        this.show("menu");
        break;
      case "toggle-music":
        sound.setMusic(!sound.musicOn);
        this.renderToggles();
        break;
      case "toggle-sfx":
        sound.setSfx(!sound.sfxOn);
        this.renderToggles();
        break;
    }
  }

  // ---------------- Navigasi ----------------

  private show(id: ScreenId) {
    this.screen = id;
    for (const el of this.root.querySelectorAll<HTMLElement>(".screen")) {
      el.classList.toggle("active", el.id === `screen-${id}` || (el.id === "hud" && this.inMatch));
    }
    if (id === "wardrobe") {
      requestAnimationFrame(() => {
        this.preview ??= new BeanPreview(this.$<HTMLCanvasElement>("#bean-preview"));
        this.preview.show(this.look.color, this.look.hat);
        this.preview.start();
        this.renderWardrobe();
      });
    } else this.preview?.stop();
    if (id === "lobby") requestAnimationFrame(() => this.renderLobby());
    if (id === "menu") this.renderMenu();
  }

  private enterMatch(versus: boolean) {
    void enterFullscreen();
    this.inMatch = true;
    this.versus = versus;
    this.$("#killfeed").innerHTML = "";
    this.$("#hud-name").innerHTML = `${bean(this.look.color, "sm")} ${escapeHtml(this.name)}`;
    this.renderToggles();
    music.play("battle");
    this.show("none");
  }

  private leaveMatch() {
    this.inMatch = false;
    this.versus = false;
    this.game.paused = false;
    this.game.startDemo();
    music.play("menu");
  }

  private startSolo() {
    save(STORAGE.map, this.soloMap);
    save(STORAGE.bots, String(this.soloBots));
    save(STORAGE.level, this.soloLevel);
    this.game.startSolo({ id: "me", name: this.name, ...this.look }, this.soloMap, this.soloBots, this.soloLevel);
    this.enterMatch(false);
  }

  private openPause() {
    if (!this.versus) this.game.paused = true;
    this.$("#pause-title").textContent = this.versus ? "Menu" : "Jeda";
    this.$("#pause-info").textContent = this.versus ? "Pertarungan tetap berjalan untuk pemain lain." : `${mapById(this.soloMap).name} · ${this.soloBots} bot`;
    this.$("#pause-actions").innerHTML = this.versus
      ? `<button class="btn btn-primary" data-action="resume">▶ Lanjut</button><button class="btn" data-action="quit">Keluar Room</button>`
      : `<button class="btn btn-primary" data-action="resume">▶ Lanjut</button><button class="btn" data-action="solo-again">Ulangi</button><button class="btn" data-action="quit">Menu Utama</button>`;
    this.show("pause");
  }

  private resume() {
    this.game.paused = false;
    this.game.input.reset();
    this.show("none");
  }

  private alert(title: string, text: string) {
    this.$("#alert-title").textContent = title;
    this.$("#alert-text").textContent = text;
    this.show("alert");
  }

  // ---------------- Karakter ----------------

  private setLook(look: Look) {
    this.look = look;
    save(STORAGE.color, look.color);
    save(STORAGE.hat, look.hat);
    this.preview?.show(look.color, look.hat);
    this.renderWardrobe();
    this.renderMenu();
  }

  private renderWardrobe() {
    for (const b of this.root.querySelectorAll<HTMLElement>("[data-color]")) b.classList.toggle("active", b.dataset.color === this.look.color);
    for (const b of this.root.querySelectorAll<HTMLElement>("[data-hat]")) b.classList.toggle("active", b.dataset.hat === this.look.hat);
  }

  private renderMenu() {
    const html = `${bean(this.look.color, "lg")}<div><small>Karaktermu</small><b>${escapeHtml(this.name)}</b><span>${hatIcon(this.look.hat)} ${HATS.find((h) => h.id === this.look.hat)?.name ?? ""}</span></div>`;
    this.$("#me-card").innerHTML = html;
    this.$("#online-me").innerHTML = `${bean(this.look.color)} Kamu bermain sebagai <b>${escapeHtml(this.name)}</b> <button class="btn btn-small" data-action="wardrobe">Ubah</button>`;
  }

  private renderSolo() {
    for (const card of this.root.querySelectorAll<HTMLElement>("[data-solo-map], [data-lobby-map]")) {
      const id = card.dataset.soloMap ?? card.dataset.lobbyMap!;
      const canvas = card.querySelector("canvas")!;
      if (!canvas.dataset.drawn) {
        drawMapThumb(canvas, mapById(id));
        canvas.dataset.drawn = "1";
      }
      if (card.dataset.soloMap) card.classList.toggle("active", id === this.soloMap);
    }
    for (const b of this.root.querySelectorAll<HTMLElement>("[data-bots]")) b.classList.toggle("active", Number(b.dataset.bots) === this.soloBots);
    for (const b of this.root.querySelectorAll<HTMLElement>("[data-level]")) b.classList.toggle("active", b.dataset.level === this.soloLevel);
  }

  // ---------------- Online ----------------

  private setStatus(id: string, text: string, error = false) {
    const el = this.$(id);
    el.textContent = text;
    el.classList.toggle("error", error);
  }

  private async createRoom() {
    this.leaveOnline(false);
    this.setStatus("#online-status", "Membuat room…");
    try {
      const host = await HostSession.create(this.name, this.look.color, this.look.hat);
      this.host = host;
      host.settings = { map: this.soloMap, koLimit: 5, timeLimit: 180 };
      host.onLobby = () => this.renderLobby();
      host.onInput = (id, input) => this.game.setRemoteInput(id, input);
      host.onLeave = (id) => this.game.removePlayer(id);
      host.onClosed = (message) => {
        this.leaveOnline();
        this.alert("Koneksi terputus", message);
      };
      this.setStatus("#online-status", "");
      this.show("lobby");
    } catch (err) {
      this.setStatus("#online-status", (err as Error).message, true);
    }
  }

  private async joinRoom() {
    const code = normalizeCode(this.$<HTMLInputElement>("#room-code").value);
    if (code.length !== 5) return this.setStatus("#online-status", "Masukkan kode room 5 karakter.", true);
    this.leaveOnline(false);
    this.setStatus("#online-status", `Menghubungkan ke room ${code}…`);
    try {
      const client = await ClientSession.join(code, this.name, this.look.color, this.look.hat);
      this.client = client;
      client.onLobby = () => {
        if (this.inMatch) {
          this.leaveMatch();
          this.show("lobby");
        } else if (this.screen === "results") this.show("lobby");
        else this.renderLobby();
      };
      client.onStart = (_seed, players, settings) => {
        this.game.startVersus("client", players, settings, client.localId);
        this.enterMatch(true);
      };
      client.onSnapshot = (s) => this.game.applySnapshot(s);
      client.onClosed = (message) => {
        this.leaveOnline();
        this.alert("Koneksi terputus", message);
      };
      this.setStatus("#online-status", "");
      this.show("lobby");
    } catch (err) {
      this.setStatus("#online-status", (err as Error).message, true);
    }
  }

  private leaveOnline(resetGame = true) {
    this.host?.close();
    this.client?.close();
    this.host = null;
    this.client = null;
    if (resetGame && this.inMatch) this.leaveMatch();
  }

  private renderLobby() {
    const session = this.host ?? this.client;
    if (!session) return;
    const localId = this.host ? this.host.localId : this.client!.localId;
    const players: LobbyPlayer[] = session.players;
    const settings: MatchSettings = session.settings;
    this.$("#lobby-code").textContent = session.code;
    this.$("#lobby-count").textContent = `${players.length} / ${MAX_PLAYERS} pemain`;
    this.$("#lobby-list").innerHTML = players
      .map(
        (p) => `<li class="${p.id === localId ? "me" : ""}">${bean(p.color)}<div><b>${escapeHtml(p.name)}</b><span>${hatIcon(p.hat)}</span></div>${p.host ? `<em class="badge host">HOST</em>` : ""}${p.id === localId ? `<em class="badge">KAMU</em>` : ""}</li>`,
      )
      .join("");
    const isHost = !!this.host;
    for (const card of this.root.querySelectorAll<HTMLElement>("[data-lobby-map]")) {
      card.classList.toggle("active", card.dataset.lobbyMap === settings.map);
      card.hidden = !isHost && card.dataset.lobbyMap !== settings.map;
    }
    this.$("#lobby-maps").classList.toggle("readonly", !isHost);
    this.$("#lobby-map-label").textContent = isHost ? "Pilih map" : "Map";
    for (const b of this.root.querySelectorAll<HTMLElement>("[data-ko]")) b.classList.toggle("active", Number(b.dataset.ko) === settings.koLimit);
    for (const b of this.root.querySelectorAll<HTMLElement>("[data-time]")) b.classList.toggle("active", Number(b.dataset.time) === settings.timeLimit);
    this.$("#ko-seg").classList.toggle("readonly", !isHost);
    this.$("#time-seg").classList.toggle("readonly", !isHost);
    this.renderSolo();
    const start = this.$<HTMLButtonElement>("#btn-start");
    start.hidden = !isHost;
    start.disabled = players.length < 2;
    this.setStatus(
      "#lobby-status",
      isHost ? (players.length < 2 ? "Bagikan kode ke teman. Butuh minimal 2 pemain." : `${players.length} pemain siap. Ayo mulai!`) : "Menunggu host memulai…",
    );
  }

  private async copyInvite(share: boolean) {
    const session = this.host ?? this.client;
    if (!session) return;
    const url = `${location.origin}${location.pathname}?room=${session.code}`;
    const text = `Ayo adu jotos di Bean Brawl! Kode room: ${session.code}`;
    if (share && navigator.share) {
      try {
        await navigator.share({ title: "Bean Brawl", text, url });
        return;
      } catch {
        /* dibatalkan */
      }
    }
    try {
      await navigator.clipboard.writeText(share ? `${text}\n${url}` : session.code);
      this.setStatus("#lobby-status", share ? "Link undangan disalin — tempel di WhatsApp/grup." : `Kode ${session.code} disalin.`);
    } catch {
      this.setStatus("#lobby-status", `Kode room: ${session.code}`);
    }
  }

  private startMatch() {
    const host = this.host;
    if (!host) return;
    if (host.players.length < 2) {
      if (this.screen !== "lobby") this.show("lobby");
      return this.setStatus("#lobby-status", "Butuh minimal 2 pemain untuk memulai.", true);
    }
    const players = host.start(0);
    this.game.startVersus("host", players, host.settings, host.localId);
    this.enterMatch(true);
  }

  private renderToggles() {
    for (const b of this.root.querySelectorAll<HTMLElement>("[data-action=toggle-music]")) {
      b.innerHTML = sound.musicOn ? ICONS.musicOn : ICONS.musicOff;
      b.classList.toggle("off", !sound.musicOn);
    }
    for (const b of this.root.querySelectorAll<HTMLElement>("[data-action=toggle-sfx]")) {
      b.innerHTML = sound.sfxOn ? ICONS.sfxOn : ICONS.sfxOff;
      b.classList.toggle("off", !sound.sfxOn);
    }
  }

  // ---------------- Dipanggil oleh Game ----------------

  updateHud(s: HudState) {
    const pct = this.$("#hud-percent");
    pct.textContent = `${s.percent}%`;
    pct.style.color = percentColor(s.percent);
    this.$("#hud-time").textContent = formatTime(s.timeLeft);
    this.$("#hud-ko").textContent = `KO ${s.kos} / ${s.koLimit}`;
    const top = s.board.slice(0, 4);
    const me = s.board.find((r) => r.local);
    if (me && !top.includes(me)) top.push(me);
    this.$("#hud-board").innerHTML = top
      .map((r) => `<li class="${r.local ? "me" : ""}"><span>${s.board.indexOf(r) + 1}</span>${bean(r.color, "xs")}<b>${escapeHtml(r.name)}</b><em>${r.kos}</em></li>`)
      .join("");
    const respawn = this.$("#respawn");
    respawn.classList.toggle("show", !s.alive);
    if (!s.alive) respawn.innerHTML = `Kembali dalam <b>${Math.max(1, Math.ceil(s.respawnIn))}</b>`;
    this.$("#dash-ring").style.setProperty("--p", String(Math.max(0, Math.min(1, s.dashReady))));
  }

  showBanner(title: string, subtitle: string) {
    const banner = this.$("#banner");
    (banner.querySelector(".title") as HTMLElement).textContent = title;
    (banner.querySelector(".subtitle") as HTMLElement).textContent = subtitle;
    banner.classList.remove("show");
    void banner.offsetWidth;
    banner.classList.add("show");
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => banner.classList.remove("show"), 2200);
  }

  killFeed(killer: string | null, victim: string, killerLocal: boolean, victimLocal: boolean) {
    const feed = this.$("#killfeed");
    const item = document.createElement("li");
    const n = (name: string, local: boolean) => `<b class="${local ? "me" : ""}">${escapeHtml(name)}</b>`;
    item.innerHTML = killer && killer !== victim ? `${n(killer, killerLocal)} <span>👊💨</span> ${n(victim, victimLocal)}` : `${n(victim, victimLocal)} <span>jatuh sendiri</span>`;
    feed.prepend(item);
    while (feed.children.length > 4) feed.lastElementChild?.remove();
    setTimeout(() => item.remove(), 4500);
  }

  showMatchEnd(rows: ScoreRow[]) {
    const winner = rows[0];
    this.$("#results-title").textContent = winner?.local ? "🏆 Kamu Juara!" : "Selesai!";
    this.$("#results-sub").textContent = winner ? `${winner.local ? "Hebat!" : `Juara: ${winner.name}`} · ${winner.kos} KO` : "";
    this.$("#podium").innerHTML = rows
      .slice(0, 3)
      .map((r, i) => `<div class="step s${i + 1}">${bean(r.color, "lg")}<b>${escapeHtml(r.name)}</b><span>${["🥇", "🥈", "🥉"][i]}</span></div>`)
      .join("");
    this.$("#results-body").innerHTML = rows
      .map((r, i) => `<tr class="${r.local ? "me" : ""}"><td>${i + 1}</td><td><div class="who">${bean(r.color, "xs")}<b>${escapeHtml(r.name)}</b></div></td><td>${r.kos}</td><td>${r.falls}</td></tr>`)
      .join("");
    this.$("#results-actions").innerHTML = !this.versus
      ? `<button class="btn btn-primary" data-action="solo-again">Main Lagi</button><button class="btn" data-action="solo">Ganti Map</button><button class="btn" data-action="quit">Menu</button>`
      : this.host
        ? `<button class="btn btn-primary" data-action="rematch">Main Lagi</button><button class="btn" data-action="to-lobby">Ke Lobi</button><button class="btn" data-action="quit">Keluar</button>`
        : `<p class="status">Menunggu host…</p><button class="btn" data-action="quit">Keluar</button>`;
    sound.fanfare();
    this.show("results");
  }
}
