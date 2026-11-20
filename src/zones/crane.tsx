// Proyek pabrik: the Crane Simulator (Link-Belt RTC-80160, or the model picked in its Tampilan tab) as a zone.
import { EMBED } from '@crane/embed';
import { bindKeys } from '@crane/input';
import { ZoneContent } from '@crane/scene/Experience';
import { loadBox } from '@crane/sim/crane';
import { EXCAVATION, OBSTACLES, inExcavation } from '@crane/sim/site';
import { SPEC } from '@crane/sim/spec';
import { ensureAudio, updateSound } from '@crane/sound';
import { cr, useUI } from '@crane/store';
import { Hud } from '@crane/ui/App';
import '@crane/ui/styles.css';
import type { Blocker, ZoneModule } from './types';

bindKeys();

// the carrier (or crawler base) as one box for walking around it
const body = (): Blocker => {
  const L = SPEC.crawler ? 12 : SPEC.bigView ? 22 : 14;
  const W = SPEC.crawler ? 10 : 3.2;
  return { x: cr.x, z: cr.z, hx: W / 2, hz: L / 2, yaw: cr.heading, y0: 0, y1: 4 };
};

const zone: ZoneModule = {
  Content: ({ drive }) => <ZoneContent drive={drive} />,
  Hud: () => <Hud />,
  stations: [
    {
      id: 'crane',
      label: `Naik crane ${SPEC.name}`,
      pos: () => [cr.x, cr.z],
      r: SPEC.crawler ? 9 : SPEC.bigView ? 12 : 8,
      exit: () => {
        const h = cr.heading;
        const d = SPEC.crawler ? 7 : SPEC.bigView ? 4 : 3.2;
        return [cr.x + Math.cos(h) * d, cr.z - Math.sin(h) * d, h];
      },
    },
  ],
  groundAt: (x, z) => (inExcavation(x, z) ? -EXCAVATION.depth : 0),
  blockers: () => [...OBSTACLES.filter((o) => o.y1 > 0.45 && o.y0 < 1.8), body(), ...cr.loads.filter((l) => l.state !== 'air').map((l) => loadBox(l, l.x, l.y, l.z))],
  enter() {
    void ensureAudio();
    useUI.getState().set({ started: true });
    EMBED.input = true;
  },
  leave() {
    EMBED.input = false;
    cr.park = true;
  },
  unmount() {
    updateSound(1e4, false);
  },
  status: () => ({ genset: !!cr.loads.find((l) => l.def.id === 'genset')?.placed }),
  prepare(what) {
    const i = cr.loads.findIndex((l) => l.def.id === what);
    if (i >= 0) cr.target = i;
  },
};
export default zone;
