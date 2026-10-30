/** Event: dijalankan lokal dan dikirim host ke semua pemain */
export type GameEvent =
  /** Ayunan serangan / dash (0 = pukul, 1 = tendang, 2 = dash) */
  | { k: "swing"; id: string; t: 0 | 1 | 2 }
  /** Serangan kena: penyerang, korban, posisi, kerusakan, kekuatan 0–2 */
  | { k: "hit"; a: string; v: string; x: number; y: number; z: number; d: number; s: 0 | 1 | 2 }
  /** Jatuh dari arena */
  | { k: "fall"; id: string; x: number; y: number }
  | { k: "ko"; v: string; a: string | null }
  | { k: "spawn"; id: string };

/** [id, x, y, z, facing, persen, aksi, waktuAksi, stun, kebal, jatuh, hidup, kombo] */
export type FighterState = [string, number, number, number, number, number, number, number, 0 | 1, 0 | 1, 0 | 1, 0 | 1, number];

export interface Snapshot {
  time: number;
  fighters: FighterState[];
  /** [id, kos, jatuh] */
  scores: [string, number, number][];
  respawn: [string, number][];
  ev: GameEvent[];
  over: 0 | 1;
}

export interface MatchPlayer {
  id: string;
  name: string;
  color: string;
  hat: string;
}

export interface MatchSettings {
  map: string;
  koLimit: number;
  timeLimit: number;
}

export interface ScoreRow {
  id: string;
  name: string;
  color: string;
  kos: number;
  falls: number;
  local: boolean;
}

/** Input dari pemain: arah gerak + jumlah tombol ditekan (kumulatif, agar tidak hilang di jaringan) */
export interface NetInput {
  mx: number;
  my: number;
  p: number;
  k: number;
  d: number;
}

export const r1 = (n: number) => Math.round(n * 10) / 10;
export const r2 = (n: number) => Math.round(n * 100) / 100;
