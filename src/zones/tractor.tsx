// Kebun sawit: the Tractor Simulator (MF 5M.145) as a zone.
import { EMBED } from '@tractor/embed';
import { bindKeys, setImplement } from '@tractor/input';
import { ZoneContent } from '@tractor/scene/Experience';
import { BIN, PALMS, height } from '@tractor/sim/estate';
import { setShuttle } from '@tractor/sim/tractor';
import { ensureAudio, updateSound } from '@tractor/sound';
import { tr, useUI, work } from '@tractor/store';
import { Hud } from '@tractor/ui/App';
import '@tractor/ui/styles.css';
import type { Blocker, ZoneModule } from './types';

bindKeys();

// palm trunks and the fruit bin are solid; refreshed lazily (the palms never move)
const palms: Blocker[] = PALMS.map((p) => ({ x: p.x, z: p.z, hx: 0.45 * p.s, hz: 0.45 * p.s, yaw: 0, y0: -1, y1: 8 }));
const bin: Blocker = { x: BIN.x, z: BIN.z, hx: BIN.w / 2, hz: BIN.d / 2, yaw: 0, y0: 0, y1: BIN.h };

const zone: ZoneModule = {
  Content: ({ drive }) => <ZoneContent drive={drive} />,
  Hud: () => <Hud />,
  stations: [
    {
      id: 'tractor',
      label: 'Naik traktor MF 5M.145',
      pos: () => [tr.x, tr.z],
      r: 4,
      exit: () => [tr.x + Math.cos(tr.heading) * 2.2, tr.z - Math.sin(tr.heading) * 2.2, tr.heading],
    },
  ],
  groundAt: (x, z) => height(x, z),
  blockers: () => [...palms, bin, { x: tr.x, z: tr.z, hx: 1.2, hz: 2.2, yaw: tr.heading, y0: tr.y, y1: tr.y + 3 }],
  enter() {
    void ensureAudio();
    useUI.getState().set({ started: true });
    EMBED.input = true;
  },
  leave() {
    EMBED.input = false;
    setShuttle(tr, 'N');
    tr.hand = 0;
  },
  unmount() {
    updateSound(1e4, false);
  },
  status: () => ({ delivered: work.delivered }),
  prepare(what) {
    if (what === 'trailer' && work.kind !== 'trailer') setImplement('trailer');
  },
};
export default zone;
