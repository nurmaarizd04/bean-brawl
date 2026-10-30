export const COLORS = [
  { id: "red", name: "Merah", hex: "#d7263d" },
  { id: "blue", name: "Biru", hex: "#2b59c3" },
  { id: "green", name: "Hijau", hex: "#2fb44a" },
  { id: "pink", name: "Merah Muda", hex: "#f472b6" },
  { id: "orange", name: "Oranye", hex: "#f28c28" },
  { id: "yellow", name: "Kuning", hex: "#f5d22e" },
  { id: "black", name: "Hitam", hex: "#3a3a44" },
  { id: "white", name: "Putih", hex: "#e8ecf2" },
  { id: "purple", name: "Ungu", hex: "#7c4dce" },
  { id: "brown", name: "Cokelat", hex: "#8b5a2b" },
  { id: "cyan", name: "Toska", hex: "#2ec4d6" },
  { id: "lime", name: "Hijau Muda", hex: "#9be04a" },
] as const;

export const HATS = [
  { id: "none", name: "Tanpa Topi", icon: "🚫" },
  { id: "party", name: "Topi Pesta", icon: "🥳" },
  { id: "crown", name: "Mahkota", icon: "👑" },
  { id: "cap", name: "Topi Lapangan", icon: "🧢" },
  { id: "peci", name: "Peci", icon: "🎩" },
  { id: "band", name: "Ikat Kepala", icon: "🥋" },
  { id: "horns", name: "Tanduk", icon: "😈" },
  { id: "flower", name: "Bunga", icon: "🌼" },
  { id: "chef", name: "Topi Koki", icon: "👨‍🍳" },
  { id: "antenna", name: "Antena", icon: "📡" },
] as const;

export type ColorId = (typeof COLORS)[number]["id"];
export type HatId = (typeof HATS)[number]["id"];

export const colorHex = (id: string) => COLORS.find((c) => c.id === id)?.hex ?? COLORS[0].hex;

export interface Look {
  color: string;
  hat: string;
}

export const randomLook = (): Look => ({
  color: COLORS[Math.floor(Math.random() * COLORS.length)].id,
  hat: HATS[Math.floor(Math.random() * HATS.length)].id,
});
