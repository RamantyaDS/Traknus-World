// Gedung kantor: the Genset Simulator's single 2250 kVA standby set (Perkins 4016, DSE7320, ATS, building loads).
import { EMBED } from '@genset/embed';
import { ZoneContent } from '@genset/scene/Experience';
import { PANEL_POS } from '@genset/scene/ControlPanel';
import { BUILDING } from '@genset/scene/Site';
import { initSound, updateSound } from '@genset/sound';
import { sim, useUI } from '@genset/store';
import { Hud } from '@genset/ui/App';
import '@genset/ui/styles.css';
import { useEffect } from 'react';
import type { ZoneModule } from './types';

function Content({ drive }: { drive: boolean }) {
  useEffect(() => useUI.getState().set({ mode: 'single' }), []);
  return <ZoneContent drive={drive} />;
}

const zone: ZoneModule = {
  Content,
  Hud: () => <Hud />,
  stations: [{ id: 'panel', label: 'Operasikan genset 2250 kVA (panel DSE7320)', pos: () => [PANEL_POS[0], PANEL_POS[2] + 1], r: 3.2, exit: () => [PANEL_POS[0] + 0.5, PANEL_POS[2] + 2.6, Math.PI] }],
  blockers: () => [
    { x: 0, z: 0, hx: 3.2, hz: 1.2, yaw: 0, y0: 0, y1: 3 },
    { x: BUILDING.x, z: BUILDING.z, hx: BUILDING.w / 2, hz: BUILDING.d / 2, yaw: 0, y0: 0, y1: BUILDING.h },
  ],
  enter() {
    void initSound();
    EMBED.input = true;
  },
  leave() {
    EMBED.input = false;
    useUI.getState().set({ focus: null, tour: null });
  },
  unmount() {
    updateSound(1e4, false);
  },
  setNight: (on) => useUI.getState().set({ sky: on ? 'malam' : 'siang' }),
  setRain: (on) => useUI.getState().set({ weather: on ? 'hujan' : 'cerah' }),
  status: () => ({ onLoad: sim.gcb }),
};
export default zone;
