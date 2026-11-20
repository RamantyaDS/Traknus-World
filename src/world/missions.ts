// Missions that cross zones. Each step names the zone where it happens and what the zone's simulator must report
// (its status flags) for the step to count; the world sets the zone up (prepare) when the player gets there.
import { loaded } from '../zones';
import { ZONES, inRect, type ZoneId } from './map';
import { toast, truck, useWorld } from './state';

export interface Step {
  zone: ZoneId;
  text: string;
  /** Asked of the zone once, when the step starts with that zone mounted (choose the right job). */
  prepare?: string | (() => string | undefined);
  /** Run when the step starts. */
  start?: () => void;
  /** True when the step is complete. `st` is the mounted zone's status (empty when another zone is mounted). */
  done: (st: Record<string, number | boolean | string>) => boolean;
}

export interface Mission {
  id: string;
  title: string;
  intro: string;
  steps: Step[];
}

/** The crane's genset arrives on the truck (when the truck has it), else the site's own set. */
const fromTruck = () => (truck.cargo ? 'fromTruck' : 'genset');

export const MISSIONS: Mission[] = [
  {
    id: 'genset',
    title: 'Genset dari pelabuhan sampai menyala',
    intro: 'Genset 2250 kVA tiba di pelabuhan. Turunkan dengan forklift, muat ke truk Traknus, kirim ke proyek pabrik, bongkar dan pasang dengan crane, lalu jalankan genset cadangan gedung.',
    steps: [
      { zone: 'port', prepare: 'genset', text: 'Pelabuhan: naik forklift dan turunkan genset dari truk ke area letak.', done: (s) => s.job === 'genset' && s.phase === 'done' },
      {
        zone: 'port',
        text: 'Ambil truk Traknus (M → Panggil truk), masuk lewat gerbang utara pelabuhan dan parkir dekat genset. Lalu naik forklift dan letakkan genset di bak truk.',
        done: () => truck.cargo,
      },
      {
        zone: 'crane',
        prepare: fromTruck,
        text: 'Genset sudah di bak. Bawa truk Traknus ke Proyek pabrik dan parkir dalam jangkauan crane.',
        done: () => useWorld.getState().mode === 'truck' && inRect(ZONES.crane, truck.x, truck.z, -2) && Math.abs(truck.v) < 0.5,
      },
      {
        zone: 'crane',
        prepare: fromTruck,
        text: 'Proyek pabrik: naik crane, pasang sling ke genset di bak truk, angkat, lalu pasang di rumah genset.',
        done: (s) => s.genset === true,
      },
      { zone: 'gedung', text: 'Gedung kantor: hidupkan genset cadangan dan ambil alih beban gedung (breaker genset masuk).', done: (s) => s.onLoad === true },
    ],
  },
  {
    id: 'sawit',
    title: 'Panen sawit ke pabrik',
    intro: 'Angkut tandan buah segar dari kebun ke bin pabrik, lalu nyalakan PLTD supaya pabrik kelapa sawit bisa mengolahnya.',
    steps: [
      { zone: 'tractor', prepare: 'trailer', text: 'Kebun sawit: pasang trailer, muat janjang di TPH dengan crane, lalu tuang ke bin di ujung jalan.', done: (s) => Number(s.delivered) > 0 },
      { zone: 'plant', text: 'PKS & PLTD: jalankan genset pembangkit dan alirkan listrik ke pabrik (bus hidup).', done: (s) => s.busLive === true },
    ],
  },
  {
    id: 'galian',
    title: 'Isi dump truck di lahan galian',
    intro: 'Excavator PC800 memuat dump truck yang antre.',
    steps: [{ zone: 'excavator', prepare: 'trucks', text: 'Lahan galian: naik excavator dan isi penuh satu dump truck.', done: (s) => Number(s.trucksFilled) > 0 }],
  },
];

let prepared = '';

export function startMission(id: string) {
  const m = MISSIONS.find((x) => x.id === id);
  if (!m) return;
  prepared = '';
  useWorld.getState().set({ mission: { id, step: 0, done: false }, missions: false });
  m.steps[0].start?.();
  toast(m.steps[0].text, 8000);
}

export function stopMission() {
  useWorld.getState().set({ mission: null });
}

export function currentStep(): { m: Mission; s: Step; i: number } | null {
  const ms = useWorld.getState().mission;
  if (!ms || ms.done) return null;
  const m = MISSIONS.find((x) => x.id === ms.id);
  if (!m) return null;
  return { m, s: m.steps[ms.step], i: ms.step };
}

let acc = 0;
export function tickMissions(dt: number) {
  acc += dt;
  if (acc < 0.25) return;
  acc = 0;
  const c = currentStep();
  if (!c) return;
  const w = useWorld.getState();
  const mod = w.zone === c.s.zone ? loaded[w.zone] : null;
  const key = `${c.m.id}:${c.i}`;
  if (mod && c.s.prepare && prepared !== key && w.mode !== 'drive') {
    prepared = key;
    const what = typeof c.s.prepare === 'function' ? c.s.prepare() : c.s.prepare;
    if (what) mod.prepare?.(what);
  }
  const st = mod?.status?.() ?? {};
  if (!c.s.done(st)) return;
  const next = c.i + 1;
  if (next >= c.m.steps.length) {
    w.set({ mission: { id: c.m.id, step: next, done: true } });
    toast(`Misi selesai: ${c.m.title}. Hebat!`, 9000);
    return;
  }
  w.set({ mission: { id: c.m.id, step: next, done: false } });
  c.m.steps[next].start?.();
  toast(c.m.steps[next].text, 9000);
}
