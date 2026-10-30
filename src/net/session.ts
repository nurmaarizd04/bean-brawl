import Peer, { type DataConnection } from "peerjs";
import type { MatchPlayer, MatchSettings, NetInput, Snapshot } from "../game/protocol";

/**
 * Multiplayer lewat internet tanpa server sendiri (WebRTC peer-to-peer via PeerJS).
 * Host membuat room dengan kode 5 huruf dan menjalankan simulasi; pemain lain mengirim input
 * dan menerima snapshot keadaan permainan.
 */

export const MAX_PLAYERS = 10;
const PREFIX = "beanbrawl-v1-";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PEER_OPTIONS = {
  config: {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }, { urls: "stun:global.stun.twilio.com:3478" }],
  },
};

export interface LobbyPlayer extends MatchPlayer {
  host: boolean;
}

type ClientMessage =
  | { t: "join"; name: string; color: string; hat: string }
  | { t: "look"; color: string; hat: string }
  | ({ t: "input" } & NetInput);

type HostMessage =
  | { t: "welcome"; id: string }
  | { t: "lobby"; players: LobbyPlayer[]; settings: MatchSettings }
  | { t: "start"; seed: number; players: MatchPlayer[]; settings: MatchSettings }
  | { t: "snap"; s: Snapshot }
  | { t: "error"; message: string };

const randomCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");

export const normalizeCode = (code: string) =>
  code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);

function peerErrorMessage(type: string) {
  switch (type) {
    case "peer-unavailable":
      return "Room tidak ditemukan. Periksa kembali kodenya.";
    case "network":
    case "server-error":
    case "socket-error":
    case "socket-closed":
      return "Tidak bisa terhubung ke server. Periksa koneksi internet.";
    case "browser-incompatible":
      return "Browser ini tidak mendukung main online.";
    default:
      return "Koneksi gagal. Coba lagi.";
  }
}

// ---------------- Host ----------------

export class HostSession {
  readonly code: string;
  readonly localId = "host";
  players: LobbyPlayer[];
  settings: MatchSettings = { map: "island", koLimit: 10, timeLimit: 180 };
  inMatch = false;
  onLobby: (players: LobbyPlayer[]) => void = () => {};
  onInput: (id: string, input: NetInput) => void = () => {};
  onLeave: (id: string) => void = () => {};
  onClosed: (message: string) => void = () => {};
  private readonly peer: Peer;
  private readonly conns = new Map<string, DataConnection>();

  private constructor(peer: Peer, code: string, name: string, color: string, hat: string) {
    this.peer = peer;
    this.code = code;
    this.players = [{ id: this.localId, name, color, hat, host: true }];
    peer.on("connection", (conn) => this.accept(conn));
    peer.on("disconnected", () => peer.reconnect());
    peer.on("error", (err) => {
      if (err.type === "peer-unavailable") return;
      if (err.type === "network" || err.type === "server-error") this.onClosed(peerErrorMessage(err.type));
    });
  }

  static create(name: string, color: string, hat: string, attempt = 0): Promise<HostSession> {
    return new Promise((resolve, reject) => {
      const code = randomCode();
      const peer = new Peer(PREFIX + code, PEER_OPTIONS);
      const timeout = window.setTimeout(() => {
        peer.destroy();
        reject(new Error("Server tidak merespons. Periksa koneksi internet."));
      }, 12000);
      peer.once("open", () => {
        clearTimeout(timeout);
        resolve(new HostSession(peer, code, name, color, hat));
      });
      peer.once("error", (err) => {
        clearTimeout(timeout);
        peer.destroy();
        if (err.type === "unavailable-id" && attempt < 4) HostSession.create(name, color, hat, attempt + 1).then(resolve, reject);
        else reject(new Error(peerErrorMessage(err.type)));
      });
    });
  }

  private accept(conn: DataConnection) {
    conn.on("data", (raw) => {
      const msg = raw as ClientMessage;
      if (msg.t === "join") {
        if (this.inMatch) return this.refuse(conn, "Pertandingan sedang berlangsung. Tunggu sampai selesai.");
        if (this.players.length >= MAX_PLAYERS) return this.refuse(conn, `Room penuh (maksimal ${MAX_PLAYERS} pemain).`);
        const id = conn.peer;
        this.conns.set(id, conn);
        this.players.push({ id, name: msg.name.slice(0, 14) || "Pemain", color: msg.color, hat: msg.hat, host: false });
        this.send(conn, { t: "welcome", id });
        this.broadcastLobby();
      } else if (msg.t === "look") {
        const p = this.players.find((pl) => pl.id === conn.peer);
        if (p && !this.inMatch) {
          p.color = msg.color;
          p.hat = msg.hat;
          this.broadcastLobby();
        }
      } else if (msg.t === "input") {
        this.onInput(conn.peer, { mx: msg.mx, my: msg.my, p: msg.p, k: msg.k, d: msg.d });
      }
    });
    const drop = () => {
      if (!this.conns.has(conn.peer)) return;
      this.conns.delete(conn.peer);
      this.players = this.players.filter((p) => p.id !== conn.peer);
      this.onLeave(conn.peer);
      this.broadcastLobby();
    };
    conn.on("close", drop);
    conn.on("error", drop);
  }

  private refuse(conn: DataConnection, message: string) {
    this.send(conn, { t: "error", message });
    setTimeout(() => conn.close(), 500);
  }

  private send(conn: DataConnection, msg: HostMessage) {
    if (conn.open) void conn.send(msg);
  }

  private broadcast(msg: HostMessage) {
    for (const conn of this.conns.values()) this.send(conn, msg);
  }

  broadcastLobby() {
    this.broadcast({ t: "lobby", players: this.players, settings: this.settings });
    this.onLobby(this.players);
  }

  setLocalLook(color: string, hat: string) {
    this.players[0].color = color;
    this.players[0].hat = hat;
    this.broadcastLobby();
  }

  setLocalName(name: string) {
    this.players[0].name = name;
    this.broadcastLobby();
  }

  setSettings(settings: MatchSettings) {
    this.settings = settings;
    this.broadcastLobby();
  }

  start(seed: number) {
    this.inMatch = true;
    const players = this.players.map(({ id, name, color, hat }) => ({ id, name, color, hat }));
    this.broadcast({ t: "start", seed, players, settings: this.settings });
    return players;
  }

  backToLobby() {
    this.inMatch = false;
    this.broadcastLobby();
  }

  sendSnapshot(s: Snapshot) {
    this.broadcast({ t: "snap", s });
  }

  close() {
    for (const conn of this.conns.values()) conn.close();
    this.peer.destroy();
  }
}

// ---------------- Pemain yang bergabung ----------------

export class ClientSession {
  readonly code: string;
  localId = "";
  players: LobbyPlayer[] = [];
  settings: MatchSettings = { map: "island", koLimit: 10, timeLimit: 180 };
  onLobby: (players: LobbyPlayer[], settings: MatchSettings) => void = () => {};
  onStart: (seed: number, players: MatchPlayer[], settings: MatchSettings) => void = () => {};
  onSnapshot: (s: Snapshot) => void = () => {};
  onClosed: (message: string) => void = () => {};
  private readonly peer: Peer;
  private conn: DataConnection | null = null;
  private closedByUser = false;

  private constructor(peer: Peer, code: string) {
    this.peer = peer;
    this.code = code;
  }

  static join(rawCode: string, name: string, color: string, hat: string): Promise<ClientSession> {
    const code = normalizeCode(rawCode);
    return new Promise((resolve, reject) => {
      if (code.length !== 5) return reject(new Error("Kode room harus 5 karakter."));
      const peer = new Peer(PEER_OPTIONS);
      const session = new ClientSession(peer, code);
      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        peer.destroy();
        reject(new Error(message));
      };
      const timeout = window.setTimeout(() => fail("Tidak ada jawaban dari room. Pastikan kode benar & host masih online."), 15000);

      peer.once("error", (err) => fail(peerErrorMessage(err.type)));
      peer.once("open", () => {
        const conn = peer.connect(PREFIX + code, { reliable: true });
        session.conn = conn;
        conn.on("open", () => void conn.send({ t: "join", name, color, hat } satisfies ClientMessage));
        conn.on("data", (raw) => {
          const msg = raw as HostMessage;
          if (msg.t === "error") return fail(msg.message);
          if (msg.t === "welcome") {
            session.localId = msg.id;
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              resolve(session);
            }
            return;
          }
          session.handle(msg);
        });
        conn.on("close", () => {
          if (!settled) fail("Koneksi ke room terputus.");
          else if (!session.closedByUser) session.onClosed("Koneksi ke host terputus. Host mungkin keluar dari room.");
        });
      });
    });
  }

  private handle(msg: HostMessage) {
    if (msg.t === "lobby") {
      this.players = msg.players;
      this.settings = msg.settings;
      this.onLobby(msg.players, msg.settings);
    } else if (msg.t === "start") this.onStart(msg.seed, msg.players, msg.settings);
    else if (msg.t === "snap") this.onSnapshot(msg.s);
  }

  private send(msg: ClientMessage) {
    if (this.conn?.open) void this.conn.send(msg);
  }

  setLook(color: string, hat: string) {
    this.send({ t: "look", color, hat });
  }

  sendInput(input: NetInput) {
    this.send({ t: "input", mx: Math.round(input.mx * 100) / 100, my: Math.round(input.my * 100) / 100, p: input.p, k: input.k, d: input.d });
  }

  close() {
    this.closedByUser = true;
    this.conn?.close();
    this.peer.destroy();
  }
}
