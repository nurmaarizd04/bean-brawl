# 🥊 Bean Brawl — Adu Jotos Kacang Antariksa

Game adu jotos **3D** dengan karakter "kacang" astronaut yang lucu. Main **bersama teman lewat internet**
(semua lawan semua, hingga 10 pemain) atau latihan melawan bot. Dimainkan di browser HP maupun laptop.
Dibuat dengan **TypeScript + Three.js + PeerJS + Vite** — semua model 3D, map, efek, suara, dan **musik**
dibuat lewat kode (orisinal, tanpa file berhak cipta).

> Karakternya terinspirasi gaya astronaut "kacang" bervisor yang populer, tapi desainnya orisinal
> (punya kepalan tangan melayang, ransel, & topi) dan tidak memakai nama/aset game lain.

## ✨ Fitur

- **Pertarungan gaya Smash**: setiap pukulan menaikkan **persen kerusakan** lawan — makin tinggi persennya,
  makin jauh terpental. Lempar lawan **keluar arena** untuk KO!
  - 👊 **Pukul** — tekan 3× cepat untuk kombo (pukulan ke-3 lebih kuat)
  - 🦶 **Tendang** — lambat, tapi melempar lawan jauh ke atas
  - 💨 **Dash** — melesat cepat & kebal sesaat
- **5 map**: Pulau Tropis (jatuh ke laut), Kapal Angkasa, Gunung Berapi (lava), Atap Kota, **Arena Es** (licin!)
- **Karakter bisa diatur**: nama, 12 warna, 10 topi (pesta, mahkota, **peci**, koki, tanduk, dll.)
- **Main bersama teman**: buat room → bagikan kode 5 huruf / link → host pilih map, target KO & durasi.
  KO dihitung untuk pemain terakhir yang memukul korban.
- **Latihan vs bot**: 1–5 bot, 3 tingkat kesulitan.
- Efek komik (POW! BAM! KAPOW!), cipratan air/lava saat jatuh, musik ceria orisinal (bisa dimatikan).

## 🎮 Kontrol

| | HP | Laptop |
| --- | --- | --- |
| Jalan | Geser sisi **kiri** layar | **WASD** / panah |
| Pukul | Tombol 👊 | **J** / **Spasi** / klik kiri |
| Tendang | Tombol 🦶 | **K** / klik kanan |
| Dash | Tombol 💨 | **L** / **Shift** |
| Menu | Tombol ⏸ | **Esc** |

## 🚀 Menjalankan

```bash
npm install
npm run dev
```

## 🌐 Supaya teman-teman bisa ikut main

Teman di tempat lain butuh alamat game yang bisa dibuka dari internet:

1. Upload folder ini ke GitHub.
2. Impor repo di [vercel.com/new](https://vercel.com/new) (Vite terdeteksi otomatis; build `npm run build`, folder `dist`).
3. Bagikan alamatnya. Satu orang pilih **Main Bersama Teman → Buat Room**, lalu tekan tombol **bagikan**
   di lobi untuk mengirim link undangan lewat WhatsApp.

Tes cepat di Wi-Fi yang sama: `npm run dev -- --host`, lalu buka alamat **Network** dari HP lain.

Koneksi memakai WebRTC peer-to-peer (PeerJS), tanpa server sendiri. Host menjalankan pertarungan,
jadi **jika host keluar, room ditutup**. Di sebagian kecil jaringan yang sangat ketat koneksi bisa gagal —
coba pakai data seluler.

## 🗂️ Struktur

```
src/
  data/maps.ts       ← 5 map: bentuk, gesekan lantai, rintangan, warna (tambah map baru di sini)
  data/cosmetics.ts  ← warna & topi karakter
  game/fighter.ts    ← fisika petarung, pukulan/tendangan/dash, terpental & jatuh
  game/bot.ts        ← AI bot
  game/game.ts       ← aturan pertarungan, KO, skor, mode latihan / host / pemain online
  game/protocol.ts   ← format data online
  game/music.ts      ← musik latar orisinal
  game/audio.ts      ← efek suara sintetis
  game/input.ts      ← joystick sentuh, tombol, keyboard, mouse
  net/session.ts     ← room online (PeerJS)
  render/models.ts   ← model 3D karakter, topi, map & dekorasinya
  render/renderer.ts ← adegan 3D, animasi karakter, efek, label nama
  render/preview.ts  ← pratinjau karakter di lemari
  ui/app.ts          ← menu, lemari, latihan, lobi, HUD, hasil
```
