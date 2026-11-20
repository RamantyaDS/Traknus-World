// PKS & PLTD: the Genset Simulator's five-unit power plant feeding the palm oil mill, as a zone.
import { EMBED } from '@genset/embed';
import { PlantHud } from '@genset/plant/PlantApp';
import { PlantContent } from '@genset/plant/PlantScene';
import '@genset/plant/plant.css';
import { HALL, plant } from '@genset/plant/store';
import { busLive } from '@genset/sim/plant';
import { initSound, updateSound } from '@genset/sound';
import { useUI } from '@genset/store';
import '@genset/ui/styles.css';
import { useEffect } from 'react';
import type { Blocker, ZoneModule } from './types';

function Content({ drive }: { drive: boolean }) {
  useEffect(() => useUI.getState().set({ mode: 'plant' }), []);
  return <PlantContent drive={drive} />;
}

const box = (x: number, z: number, w: number, d: number, h: number): Blocker => ({ x, z, hx: w / 2, hz: d / 2, yaw: 0, y0: 0, y1: h });
const SOLID: Blocker[] = [
  box((HALL.x0 + HALL.x1) / 2, (HALL.z0 + HALL.z1) / 2, HALL.x1 - HALL.x0, HALL.z1 - HALL.z0, HALL.h),
  box(15, 165, 40, 22, 14),
  box(42, 162, 10, 10, 10),
  box(62, 168, 20, 16, 10),
];

const zone: ZoneModule = {
  Content,
  Hud: () => <PlantHud />,
  stations: [{ id: 'control', label: 'Masuk ruang kontrol PLTD (5 genset paralel)', pos: () => [0, HALL.z1 + 2.5], r: 5, exit: () => [0, HALL.z1 + 5, 0] }],
  blockers: () => SOLID,
  noShadows: true,
  enter() {
    void initSound();
    EMBED.input = true;
  },
  leave() {
    EMBED.input = false;
  },
  unmount() {
    updateSound(1e4, false);
  },
  setRain: (on) => {
    plant.autoWeather = false;
    plant.weather = on ? 'hujan' : 'cerah';
  },
  status: () => ({ busLive: busLive(plant) }),
};
export default zone;
