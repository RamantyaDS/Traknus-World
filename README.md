# Kawasan Traknus

Satu dunia 3D yang menggabungkan semua simulator Traknus. Jalan kaki sebagai operator, naik truk di jalan kawasan, dan naiki alatnya langsung.

**Main:** https://ramantyads.github.io/Traknus-World/

| Zona | Simulator | Yang bisa dilakukan |
|---|---|---|
| Pelabuhan | [Forklift Toyota 4FD240](https://github.com/RamantyaDS/Forklif-Simulator) | Tujuh muatan, P2H, latihan SIO |
| Bengkel Traknus | [Genset: bengkel & dyno](https://github.com/RamantyaDS/Genset-Simulator) | Modifikasi dan uji tenaga Perkins 4016 |
| Gedung kantor | [Genset 2250 kVA](https://github.com/RamantyaDS/Genset-Simulator) | Genset cadangan, ATS, PLN padam |
| Proyek pabrik | [Crane Link-Belt RTC-80160](https://github.com/RamantyaDS/Crane-Simulator) | Load chart resmi, rigging, model lain lewat tab Tampilan |
| Lahan galian | [Excavator Komatsu PC800](https://github.com/RamantyaDS/Excavator-Simulator) | Tanah bisa digali, isi dump truck, parit, kanal |
| PKS & PLTD | [Genset: pembangkit 5 unit](https://github.com/RamantyaDS/Genset-Simulator) | Black start, sinkronisasi, penyulang pabrik sawit |
| Kebun sawit | [Traktor MF 5M.145](https://github.com/RamantyaDS/Tractor-Simulator) | Angkut janjang, slasher, pupuk |

Tiap simulator tetap punya situsnya sendiri; di sini mereka dipasang sebagai zona.

## Kontrol

- W A S D jalan, Shift lari, Spasi lompat, mouse seret untuk melihat sekeliling, roda untuk zoom
- E naik alat atau truk (dan turun dari truk), Esc turun dari alat, M peta (klik zona untuk pindah)
- Truk: W gas, S rem lalu mundur, A D setir, Spasi rem tangan, H klakson
- Di atas alat berat kontrolnya sama seperti di simulatornya masing-masing

## Misi lintas zona

1. **Genset dari pelabuhan sampai menyala:** forklift menurunkan genset, truk membawanya ke proyek pabrik, crane memasangnya di rumah genset, lalu genset cadangan gedung dijalankan sampai mengambil beban.
2. **Panen sawit ke pabrik:** traktor mengangkut janjang ke bin, lalu PLTD dinyalakan untuk pabrik kelapa sawit.
3. **Isi dump truck:** excavator memuat dump truck di lahan galian.

Pemindahan genset dari area letak forklift ke bak truk, dan dari truk ke area muat crane, dikerjakan "crew" secara otomatis (tidak disimulasikan).

## Cara kerjanya

- Kelima simulator adalah git submodule di `sims/`. Masing-masing punya `src/embed.ts`: saat dunia memasangnya, simulator itu tidak menggambar langit, lampu, kabut, efek, dan latar belakangnya sendiri, dan keyboard baru diteruskan ke simulator saat pemain naik alatnya. Di situs simulator itu sendiri tidak ada yang berubah.
- Zona yang didekati dimuat saat itu juga (satu chunk per simulator) dan hanya satu zona yang aktif. Zona lain tampil sebagai bentuk sederhana dari jauh. Zona aktif selalu berada di titik nol koordinat (*floating origin*), jadi kamera dan fisika simulator berjalan di koordinatnya sendiri; sisa dunia digeser.
- Stylesheet tiap simulator dibatasi ke pembungkus zonanya (`.z-forklift` …) lewat `postcss-prefix-selector`.
- Grafis ringan sebagai bawaan (resolusi 1×, tanpa ambient occlusion dan bloom, bayangan 1024). Mode penuh bisa dipilih di menu ⚙ dan tidak pernah berganti sendiri.
- Posisi, truk, jam, cuaca dan misi tersimpan di browser. Kondisi tiap alat berat mulai baru setelah halaman dimuat ulang.

## Suara

Truk memakai suara sintetis (Web Audio). Alat berat memakai rekaman dari simulatornya. File di `public/audio/` sama dengan milik simulator:

| Suara | Sumber | Lisensi |
|---|---|---|
| Mesin idle, putaran tinggi, mesin mati | [John Deere 5820](https://commons.wikimedia.org/wiki/File:WWS_JohnDeereTractor.ogg), Work With Sounds / Werstas | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Pompa hidrolik | [Komatsu 941 harvester](https://commons.wikimedia.org/wiki/File:WWS_Komatsu941Harvester.ogg), Work With Sounds / Werstas | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Starter dan mesin menyala | [Gillig bus, Cummins ISL9](https://commons.wikimedia.org/wiki/File:Merced_The_Bus_Gillig_engine_start.ogg), Evan0512 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

## Pengembangan

```bash
git clone --recurse-submodules https://github.com/RamantyaDS/Traknus-World.git
cd Traknus-World
npm install
npm run dev
```

Perbarui simulator ke versi terbarunya: `git submodule update --remote`, lalu commit.
