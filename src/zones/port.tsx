// Pelabuhan: the Forklift Simulator (Toyota 4FD240) as a zone.
import { EMBED } from '@forklift/embed';
import { bindKeys } from '@forklift/input';
import { ZoneContent } from '@forklift/scene/Experience';
import { footprint, forksClear, togglePark } from '@forklift/sim/forklift';
import { inside } from '@forklift/sim/geom';
import { DYNAMIC, OBSTACLES } from '@forklift/sim/world';
import { ensureAudio, updateSound } from '@forklift/sound';
import { chooseJob, fk, setRain, useUI } from '@forklift/store';
import { Hud } from '@forklift/ui/App';
import '@forklift/ui/styles.css';
import type { ZoneModule } from './types';

bindKeys();

/** Where a set that left the yard on the truck is kept; `mine`: the forklift's set is the truck's genset. */
const AWAY = 1e4;
let mine = false;

const side = (d: number): [number, number, number] => {
  // step out on the left of the cab (the operator's door), facing the same way as the forklift
  const h = fk.heading;
  return [fk.x + Math.cos(h) * d, fk.z - Math.sin(h) * d, h];
};

const zone: ZoneModule = {
  Content: ({ drive }) => <ZoneContent drive={drive} />,
  Hud: () => <Hud />,
  stations: [{ id: 'forklift', label: 'Naik forklift Toyota 4FD240', pos: () => [fk.x, fk.z], r: 4.2, exit: () => side(2.6) }],
  solids: EMBED.solids,
  supports: EMBED.supports,
  cargo(deck, has) {
    const c = fk.cargo;
    if (has) {
      // the yard's own set is somewhere else: the truck's genset stays the truck's
      if (!mine && c.x < AWAY - 1) return { has, shown: false };
      mine = true;
      if (c.state === 'forks') {
        mine = false; // lifted off the deck
        return { has: false, shown: false };
      }
      if (c.state !== 'rest') {
        mine = false;
        return { has: false, shown: false };
      }
      if (!deck) {
        c.x = AWAY;
        c.z = AWAY;
        return { has: true, shown: false };
      }
      // it rides on the deck (timbers)
      c.x = deck.x;
      c.z = deck.z;
      c.y = deck.top;
      c.yaw = deck.loadYaw;
      return { has: true, shown: true };
    }
    // set down on the deck or its timbers, the forks drawn out: now it rides with the truck
    if (deck && c.state === 'rest' && c.y > deck.y1 - 0.05 && c.y < deck.y1 + 0.3 && inside(deck, c.x, c.z) && forksClear(fk)) {
      mine = true;
      return { has: true, shown: true };
    }
    return { has: false, shown: false };
  },
  blockers: () => [...OBSTACLES.filter((o) => o.y1 > 0.45 && o.y0 < 1.8), ...DYNAMIC, ...footprint(fk)],
  enter() {
    void ensureAudio();
    useUI.getState().set({ started: true });
    EMBED.input = true;
  },
  leave() {
    EMBED.input = false;
    if (!fk.park) togglePark(fk);
  },
  unmount() {
    updateSound(1e4, false);
  },
  setNight: (on) => useUI.getState().set({ night: on }),
  setRain: (on) => setRain(on),
  status: () => ({ job: useUI.getState().job, phase: fk.phase }),
  prepare(what) {
    if (what === 'genset') chooseJob('genset');
  },
};
export default zone;
