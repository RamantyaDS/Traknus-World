import { Canvas } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO } from '@react-three/postprocessing';
import { useEffect, useRef, useState } from 'react';
import { loaded } from '../zones';
import { bindWorldKeys } from '../world/input';
import { ROADS, ZONES, ZONE_LIST, distToZone, type ZoneId } from '../world/map';
import { MISSIONS, currentStep, startMission, stopMission } from '../world/missions';
import { FULL, MAX_DPR, setQuality } from '../world/quality';
import { clearSave, load, look, player, toast, truck, useWorld } from '../world/state';
import { coastZ } from '../world/terrain';
import { initWorldAudio } from '../world/sound';
import { WorldScene, leaveStation } from '../world/World';
import { groundH } from '../world/physics';
import { FpsWarn } from './FpsWarn';

/** Which simulator's stylesheet scope a zone's panels use. */
const SIM_OF: Record<ZoneId, string> = { port: 'forklift', crane: 'crane', excavator: 'excavator', tractor: 'tractor', gedung: 'genset', plant: 'genset', bengkel: 'genset' };

const hhmm = (t: number) => `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.floor((t % 1) * 60)).padStart(2, '0')}`;

function where() {
  let best: ZoneId | null = null;
  let bd = 60;
  for (const d of ZONE_LIST) {
    const dd = distToZone(d, player.x, player.z);
    if (dd < bd) {
      bd = dd;
      best = d.id;
    }
  }
  return best ? ZONES[best].name : 'Jalan kawasan';
}

// ---------------- 2D map (minimap and the big map) ----------------

interface View {
  cx: number;
  cz: number;
  s: number; // pixels per metre
  w: number;
  h: number;
}
// north up; looking north +x is on the left, so x is drawn mirrored
const sx = (v: View, x: number) => v.w / 2 - (x - v.cx) * v.s;
const sy = (v: View, z: number) => v.h / 2 - (z - v.cz) * v.s;

function drawMap(g: CanvasRenderingContext2D, v: View, big: boolean) {
  g.fillStyle = '#5d7a3a';
  g.fillRect(0, 0, v.w, v.h);
  // sea
  g.fillStyle = '#2a5d70';
  g.beginPath();
  g.moveTo(0, v.h);
  for (let px = 0; px <= v.w; px += 6) {
    const x = v.cx - (px - v.w / 2) / v.s;
    g.lineTo(px, sy(v, coastZ(x)));
  }
  g.lineTo(v.w, v.h);
  g.fill();
  // plantation
  g.fillStyle = '#4b6b2c';
  g.fillRect(sx(v, 840), sy(v, 1460), (840 + 620) * v.s, (1460 - 880) * v.s);
  // roads
  g.strokeStyle = '#d9cfb8';
  g.lineWidth = Math.max(2, 8 * v.s);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const r of ROADS) {
    g.beginPath();
    r.forEach(([x, z], i) => (i ? g.lineTo(sx(v, x), sy(v, z)) : g.moveTo(sx(v, x), sy(v, z))));
    g.stroke();
  }
  // zones
  g.font = big ? '600 13px "IBM Plex Sans", sans-serif' : '600 10px "IBM Plex Sans", sans-serif';
  g.textAlign = 'center';
  for (const d of ZONE_LIST) {
    const [x0, z0, x1, z1] = d.rect;
    const a = sx(v, d.x + x1);
    const b = sy(v, d.z + z1);
    g.fillStyle = d.color + 'cc';
    g.fillRect(a, b, (x1 - x0) * v.s, (z1 - z0) * v.s);
    g.strokeStyle = '#ffffffaa';
    g.lineWidth = 1;
    g.strokeRect(a, b, (x1 - x0) * v.s, (z1 - z0) * v.s);
    const cx = sx(v, d.x + (x0 + x1) / 2);
    const cy = sy(v, d.z + (z0 + z1) / 2);
    g.fillStyle = '#fff';
    g.shadowColor = '#000';
    g.shadowBlur = 3;
    g.fillText(d.name, cx, cy + 4);
    if (big) {
      g.font = '11px "IBM Plex Sans", sans-serif';
      g.fillText(d.sub, cx, cy + 19);
      g.font = '600 13px "IBM Plex Sans", sans-serif';
    }
    g.shadowBlur = 0;
  }
  // mission target
  const c = currentStep();
  if (c) {
    const d = ZONES[c.s.zone];
    const t = performance.now() / 400;
    g.strokeStyle = '#ffd23a';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(sx(v, d.x + (d.rect[0] + d.rect[2]) / 2), sy(v, d.z + (d.rect[1] + d.rect[3]) / 2), 14 + 4 * Math.sin(t), 0, Math.PI * 2);
    g.stroke();
  }
  // the truck and the player (arrow)
  const arrow = (x: number, z: number, yaw: number, col: string, size: number) => {
    g.save();
    g.translate(sx(v, x), sy(v, z));
    g.rotate(yaw);
    g.fillStyle = col;
    g.strokeStyle = '#111';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -size);
    g.lineTo(size * 0.7, size * 0.8);
    g.lineTo(0, size * 0.4);
    g.lineTo(-size * 0.7, size * 0.8);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  };
  // a world yaw (forward = (sin, cos)) on the mirrored map is a screen rotation of −yaw
  arrow(truck.x, truck.z, -truck.yaw, '#f4f4f0', big ? 8 : 6);
  arrow(player.x, player.z, -player.yaw, '#ff7a1a', big ? 9 : 7);
}

function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const c = ref.current;
      if (!c) return;
      const g = c.getContext('2d')!;
      drawMap(g, { cx: player.x, cz: player.z, s: 0.32, w: c.width, h: c.height }, false);
      // camera view direction
      g.strokeStyle = '#ffffff88';
      g.beginPath();
      g.moveTo(c.width / 2, c.height / 2);
      g.lineTo(c.width / 2 + Math.sin(-look.yaw) * 30, c.height / 2 - Math.cos(-look.yaw) * 30);
      g.stroke();
    }, 120);
    return () => clearInterval(id);
  }, []);
  return <canvas ref={ref} className="minimap" width={180} height={180} />;
}

function BigMap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const mode = useWorld((s) => s.mode);
  const view = useRef<View>({ cx: 120, cz: 560, s: 0.4, w: 900, h: 700 });
  useEffect(() => {
    const c = ref.current!;
    const fit = () => {
      c.width = Math.min(innerWidth - 40, 1100);
      c.height = Math.min(innerHeight - 140, 820);
      view.current.w = c.width;
      view.current.h = c.height;
      view.current.s = Math.min(c.width / 1750, c.height / 1900);
    };
    fit();
    const id = setInterval(() => drawMap(c.getContext('2d')!, view.current, true), 100);
    return () => clearInterval(id);
  }, []);
  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const v = view.current;
    const x = v.cx - (e.clientX - r.left - v.w / 2) / v.s;
    const z = v.cz - (e.clientY - r.top - v.h / 2) / v.s;
    const d = ZONE_LIST.find((d) => distToZone(d, x, z) < 25);
    if (!d) return;
    if (mode !== 'walk') {
      toast('Fast travel hanya saat jalan kaki.');
      return;
    }
    player.x = d.x + d.arrive[0];
    player.z = d.z + d.arrive[1];
    player.yaw = d.arrive[2];
    player.y = groundH(player.x, player.z);
    look.yaw = player.yaw;
    useWorld.getState().set({ map: false });
    toast(`Tiba di ${d.name}.`);
  };
  const callTruck = () => {
    if (mode !== 'walk') return;
    truck.x = player.x + Math.cos(player.yaw) * 5;
    truck.z = player.z - Math.sin(player.yaw) * 5;
    truck.yaw = player.yaw;
    truck.v = 0;
    useWorld.getState().set({ map: false });
    toast('Truk Traknus diantar ke dekatmu.');
  };
  return (
    <div className="overlay map">
      <div className="maphead">
        <h2>Peta Kawasan Traknus</h2>
        <span className="dim">Klik zona untuk pindah ke sana (saat jalan kaki).</span>
        <button onClick={callTruck} disabled={mode !== 'walk'}>
          🚚 Panggil truk ke sini
        </button>
        <button onClick={() => useWorld.getState().set({ map: false })}>Tutup (M)</button>
      </div>
      <canvas ref={ref} onClick={click} />
    </div>
  );
}

// ---------------- panels ----------------

function MissionList() {
  const ms = useWorld((s) => s.mission);
  return (
    <div className="overlay center">
      <div className="card wide">
        <h2>Misi</h2>
        {MISSIONS.map((m) => (
          <div key={m.id} className="mission-row">
            <div>
              <b>{m.title}</b>
              <p className="dim">{m.intro}</p>
              <ol>
                {m.steps.map((s, i) => (
                  <li key={i} className={ms?.id === m.id && (ms.done || i < ms.step) ? 'done' : ''}>
                    {ZONES[s.zone].name}: {s.text.replace(/^[^:]+: /, '')}
                  </li>
                ))}
              </ol>
            </div>
            <button className="ok" onClick={() => startMission(m.id)}>
              {ms?.id === m.id ? 'Ulangi' : 'Mulai'}
            </button>
          </div>
        ))}
        <div className="row">
          {ms && (
            <button onClick={stopMission} className="dim-btn">
              Hentikan misi
            </button>
          )}
          <button onClick={() => useWorld.getState().set({ missions: false })}>Tutup</button>
        </div>
      </div>
    </div>
  );
}

function Menu() {
  const time = useWorld((s) => s.time);
  const timeRun = useWorld((s) => s.timeRun);
  const rain = useWorld((s) => s.rain);
  const set = useWorld((s) => s.set);
  return (
    <div className="overlay center">
      <div className="card">
        <h2>Pengaturan</h2>
        <label className="field">
          Jam {hhmm(time)}
          <input type="range" min={0} max={23.9} step={0.1} value={time} onChange={(e) => set({ time: +e.target.value })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={timeRun} onChange={(e) => set({ timeRun: e.target.checked })} /> Waktu berjalan (1 jam = 1 menit)
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={rain}
            onChange={(e) => {
              set({ rain: e.target.checked });
              const z = useWorld.getState().zone;
              if (z) loaded[z]?.setRain?.(e.target.checked);
            }}
          />{' '}
          Hujan
        </label>
        <div className="row">
          <span>Grafis: {FULL ? 'Mode penuh' : 'Ringan'}</span>
          <button onClick={() => setQuality(!FULL)}>{FULL ? 'Pakai grafis ringan' : 'Mode penuh (berat)'}</button>
        </div>
        <h3>Kontrol jalan kaki & truk</h3>
        <table className="keys">
          <tbody>
            {[
              ['W A S D', 'Jalan / gas, rem, setir truk'],
              ['Shift', 'Lari'],
              ['Spasi', 'Lompat / rem tangan truk'],
              ['E', 'Naik alat atau truk, turun dari truk'],
              ['Esc', 'Turun dari alat'],
              ['H', 'Klakson truk'],
              ['M', 'Peta'],
              ['Mouse', 'Seret untuk melihat sekeliling, roda untuk zoom'],
            ].map(([k, v]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="dim">Di atas alat berat, kontrolnya sama seperti di simulatornya masing-masing (lihat panel bantuan alat itu).</p>
        <div className="row">
          <button
            className="dim-btn"
            onClick={() => {
              clearSave();
              location.reload();
            }}
          >
            Mulai ulang dari awal
          </button>
          <button onClick={() => set({ menu: false })}>Tutup</button>
        </div>
      </div>
    </div>
  );
}

function Tracker() {
  useWorld((s) => s.tick);
  const ms = useWorld((s) => s.mission);
  const c = currentStep();
  if (!ms) return null;
  if (ms.done) {
    const m = MISSIONS.find((x) => x.id === ms.id);
    return (
      <div className="tracker done">
        <b>✓ {m?.title}</b>
        <span>Misi selesai</span>
      </div>
    );
  }
  if (!c) return null;
  return (
    <div className="tracker">
      <b>
        {c.m.title} · {c.i + 1}/{c.m.steps.length}
      </b>
      <span>{c.s.text}</span>
    </div>
  );
}

function Speedo() {
  useWorld((s) => s.tick);
  const rpm = truck.rpm;
  const gear = truck.gear < 0 ? 'R' : String(truck.gear);
  return (
    <div className="speedo">
      <div className="speedo-row">
        <div>
          <b>{Math.round(Math.abs(truck.v) * 3.6)}</b> km/jam
        </div>
        <div className="gear" title={truck.auto ? 'Otomatis' : 'Manual'}>
          <small>{truck.gear < 0 ? '' : truck.auto ? 'D' : 'M'}</small>
          {gear}
        </div>
      </div>
      <div className="tacho" title="Putaran mesin">
        <i style={{ width: `${Math.min(100, (rpm / 2500) * 100)}%` }} className={rpm > 1900 ? 'hi' : rpm > 1000 && rpm < 1600 ? 'eco' : ''} />
        <span>{Math.round(rpm / 10) * 10} rpm</span>
      </div>
      <span className="dim">{truck.v < -0.2 ? 'mundur' : truck.cargo ? 'genset di bak · 27 t' : 'kosong · 12,5 t'}</span>
      <span className="dim small">W gas · S rem (tahan saat berhenti: mundur) · A D setir · R/F naik/turun gigi · T otomatis/manual · Spasi rem tangan · H klakson · E turun</span>
    </div>
  );
}

function Toast() {
  const t = useWorld((s) => s.toast);
  const until = useWorld((s) => s.toastUntil);
  useWorld((s) => s.tick);
  if (!t || performance.now() > until) return null;
  return <div className="wtoast">{t}</div>;
}

function Hud() {
  const mode = useWorld((s) => s.mode);
  const zone = useWorld((s) => s.zone);
  const station = useWorld((s) => s.station);
  const prompt = useWorld((s) => s.prompt);
  const map = useWorld((s) => s.map);
  const menu = useWorld((s) => s.menu);
  const missions = useWorld((s) => s.missions);
  const loading = useWorld((s) => s.loading);
  const time = useWorld((s) => Math.floor(s.time * 12) / 12);
  const rain = useWorld((s) => s.rain);
  useEffect(() => {
    const id = setInterval(() => useWorld.setState((s) => ({ tick: s.tick + 1 })), 150);
    return () => clearInterval(id);
  }, []);
  const driving = mode === 'drive' && station && zone;
  const ZHud = driving ? loaded[zone!]?.Hud : null;
  return (
    <>
      {driving && ZHud && (
        <div className={`zhud z-${SIM_OF[zone!]} ${zone === 'plant' ? 'plant-mode' : zone === 'bengkel' ? 'bengkel-mode' : ''}`}>
          <ZHud station={station!.split(':')[1]} />
        </div>
      )}
      {driving ? (
        <button className={`getoff ${SIM_OF[zone!] === 'genset' ? 'low' : ''}`} onClick={leaveStation}>
          ⏏ Turun <kbd>Esc</kbd>
        </button>
      ) : (
        <>
          <div className="loc">
            <b>{where()}</b>
            <span>
              {hhmm(time)} {rain ? '🌧' : time > 6 && time < 18 ? '☀' : '🌙'}
            </span>
            <div className="row">
              <button onClick={() => useWorld.getState().set({ map: true })}>Peta (M)</button>
              <button onClick={() => useWorld.getState().set({ missions: true })}>Misi</button>
              <button onClick={() => useWorld.getState().set({ menu: true })}>⚙</button>
            </div>
          </div>
          <Tracker />
          <Minimap />
        </>
      )}
      {mode === 'truck' && <Speedo />}
      {prompt && mode === 'walk' && (
        <div className="prompt">
          <kbd>E</kbd> {prompt}
        </div>
      )}
      {loading && <div className="loading">Memuat zona…</div>}
      <Toast />
      {map && <BigMap />}
      {menu && <Menu />}
      {missions && <MissionList />}
    </>
  );
}

function Intro() {
  const [hasSave] = useState(() => {
    try {
      return !!localStorage.getItem('traknus-world-save');
    } catch {
      return false;
    }
  });
  const go = (cont: boolean) => {
    if (cont) load();
    else clearSave();
    initWorldAudio();
    look.yaw = player.yaw;
    useWorld.getState().set({ started: true });
  };
  return (
    <div className="overlay center intro-w">
      <div className="card wide">
        <h1>Kawasan Traknus</h1>
        <p>
          Satu kawasan yang menggabungkan semua simulator Traknus. Jalan kaki sebagai operator, naik truk di jalan kawasan, dan naiki alatnya langsung:
        </p>
        <ul className="zones">
          {ZONE_LIST.map((d) => (
            <li key={d.id}>
              <i style={{ background: d.color }} />
              <b>{d.name}</b> {d.sub}
            </li>
          ))}
        </ul>
        <p className="dim">
          W A S D jalan, Shift lari, E naik alat atau truk, Esc turun, M peta. Di atas alat, kontrolnya sama seperti di simulatornya. Zona dimuat saat kamu
          mendekat, jadi tunggu sebentar di batasnya.
        </p>
        <div className="row">
          {hasSave && (
            <button className="big" onClick={() => go(true)}>
              Lanjutkan
            </button>
          )}
          <button className="big ok" onClick={() => go(false)}>
            {hasSave ? 'Mulai baru' : 'Mulai'} (suara aktif)
          </button>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const started = useWorld((s) => s.started);
  useEffect(() => bindWorldKeys(), []);
  return (
    <>
      <Canvas shadows dpr={[1, MAX_DPR]} camera={{ position: [10, 8, 80], fov: 55, near: 0.15, far: 3200 }} gl={{ antialias: true, alpha: false }}>
        <WorldScene />
        {FULL ? (
          <EffectComposer>
            <N8AO aoRadius={1.2} intensity={2} distanceFalloff={0.6} halfRes quality="performance" aoSamples={10} denoiseSamples={4} />
            <Bloom mipmapBlur luminanceThreshold={1.15} intensity={0.35} />
          </EffectComposer>
        ) : (
          <></>
        )}
      </Canvas>
      {started ? <Hud /> : <Intro />}
      <FpsWarn />
    </>
  );
}
