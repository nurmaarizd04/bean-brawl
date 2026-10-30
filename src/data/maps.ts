export type MapShape = "circle" | "rect" | "hex";
export type VoidKind = "water" | "space" | "lava" | "street" | "icewater";
export type PropKind = "palm" | "rock" | "crate" | "pillar" | "ac" | "crystal" | "lamp";

export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  /** Radius tabrakan */
  r: number;
}

export interface ArenaMap {
  id: string;
  name: string;
  description: string;
  shape: MapShape;
  /** Lingkaran/segi enam: jari-jari. Persegi: setengah lebar (w) & setengah panjang (h) */
  size: number;
  w: number;
  h: number;
  /** Gesekan lantai per detik (es jauh lebih licin) */
  friction: number;
  /** Seberapa cepat karakter mencapai kecepatan jalan */
  grip: number;
  props: Prop[];
  void: VoidKind;
  colors: {
    ground: string;
    groundAlt: string;
    rim: string;
    sky: string;
    fog: string;
    sun: string;
    hemiSky: string;
    hemiGround: string;
  };
}

export const MAPS: ArenaMap[] = [
  {
    id: "island",
    name: "Pulau Tropis",
    description: "Pulau rumput mungil di tengah laut. Yang terlempar — byur!",
    shape: "circle",
    size: 430,
    w: 0,
    h: 0,
    friction: 7,
    grip: 12,
    props: [
      { kind: "palm", x: -170, y: -120, r: 15 },
      { kind: "palm", x: 190, y: 150, r: 15 },
      { kind: "palm", x: 60, y: -250, r: 15 },
      { kind: "rock", x: -230, y: 170, r: 24 },
      { kind: "rock", x: 260, y: -90, r: 20 },
    ],
    void: "water",
    colors: { ground: "#62b04a", groundAlt: "#e7d39a", rim: "#d9c184", sky: "#8fd3f4", fog: "#9fd8f0", sun: "#fff3d6", hemiSky: "#dff3ff", hemiGround: "#3f6b2e" },
  },
  {
    id: "ship",
    name: "Kapal Angkasa",
    description: "Dek kapal luar angkasa. Jatuh = melayang selamanya di antara bintang.",
    shape: "rect",
    size: 0,
    w: 470,
    h: 300,
    friction: 7.5,
    grip: 12,
    props: [
      { kind: "crate", x: -220, y: -110, r: 22 },
      { kind: "crate", x: 230, y: 120, r: 22 },
      { kind: "pillar", x: -60, y: 150, r: 20 },
      { kind: "pillar", x: 90, y: -150, r: 20 },
      { kind: "lamp", x: -380, y: 220, r: 10 },
      { kind: "lamp", x: 380, y: -220, r: 10 },
    ],
    void: "space",
    colors: { ground: "#7b8597", groundAlt: "#4c5566", rim: "#f5c542", sky: "#05060f", fog: "#0b0d1f", sun: "#cfe0ff", hemiSky: "#9fb4ff", hemiGround: "#2a2440" },
  },
  {
    id: "volcano",
    name: "Gunung Berapi",
    description: "Batu segi enam di atas lautan lava. Panas!",
    shape: "hex",
    size: 450,
    w: 0,
    h: 0,
    friction: 7,
    grip: 12,
    props: [
      { kind: "rock", x: -200, y: 0, r: 28 },
      { kind: "rock", x: 210, y: 90, r: 24 },
      { kind: "rock", x: 40, y: -230, r: 22 },
      { kind: "rock", x: -40, y: 240, r: 20 },
    ],
    void: "lava",
    colors: { ground: "#4a3b36", groundAlt: "#2d2522", rim: "#ff7a2a", sky: "#2a0d08", fog: "#4a1608", sun: "#ffb27a", hemiSky: "#ff9b6a", hemiGround: "#2a0c06" },
  },
  {
    id: "rooftop",
    name: "Atap Kota",
    description: "Atap gedung pencakar langit saat senja. Jangan lihat ke bawah!",
    shape: "rect",
    size: 0,
    w: 420,
    h: 320,
    friction: 7.5,
    grip: 12,
    props: [
      { kind: "ac", x: -230, y: -170, r: 26 },
      { kind: "ac", x: 240, y: 180, r: 26 },
      { kind: "pillar", x: 0, y: 0, r: 22 },
      { kind: "lamp", x: -360, y: 260, r: 10 },
      { kind: "lamp", x: 360, y: -260, r: 10 },
    ],
    void: "street",
    colors: { ground: "#8d8a86", groundAlt: "#6f6c69", rim: "#ffd166", sky: "#f08a5d", fog: "#b8607a", sun: "#ffc28a", hemiSky: "#ffd2b3", hemiGround: "#3b2b44" },
  },
  {
    id: "ice",
    name: "Arena Es",
    description: "Lantai es super licin — sekali terdorong, susah berhenti!",
    shape: "circle",
    size: 400,
    w: 0,
    h: 0,
    friction: 1.4,
    grip: 2.6,
    props: [
      { kind: "crystal", x: -150, y: -150, r: 18 },
      { kind: "crystal", x: 160, y: 140, r: 18 },
      { kind: "crystal", x: 170, y: -170, r: 16 },
    ],
    void: "icewater",
    colors: { ground: "#cfeefc", groundAlt: "#a9dcf3", rim: "#ffffff", sky: "#bcdcf0", fog: "#cfe6f5", sun: "#ffffff", hemiSky: "#f2fbff", hemiGround: "#6a93b0" },
  },
];

export const mapById = (id: string) => MAPS.find((m) => m.id === id) ?? MAPS[0];

const SQRT3 = Math.sqrt(3);

/** Apakah titik masih berada di atas lantai arena (margin = jarak aman dari tepi) */
export function onGround(map: ArenaMap, x: number, y: number, margin = 0) {
  switch (map.shape) {
    case "circle":
      return Math.hypot(x, y) <= map.size - margin;
    case "rect":
      return Math.abs(x) <= map.w - margin && Math.abs(y) <= map.h - margin;
    case "hex": {
      const R = map.size - margin;
      const ax = Math.abs(x);
      const ay = Math.abs(y);
      return ax <= R && ay <= (R * SQRT3) / 2 && SQRT3 * ax + ay <= SQRT3 * R;
    }
  }
}

/** Ukuran kira-kira arena (untuk kamera) */
export const mapExtent = (map: ArenaMap) => (map.shape === "rect" ? Math.max(map.w, map.h) : map.size);
