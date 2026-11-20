// Proyek pabrik: the Crane Simulator (Link-Belt RTC-80160, or the model picked in its Tampilan tab) as a zone.
import { EMBED } from '@crane/embed';
import { bindKeys } from '@crane/input';
import { ZoneContent } from '@crane/scene/Experience';
import { loadBox } from '@crane/sim/crane';
import { inside } from '@crane/sim/geom';
import { EXCAVATION, OBSTACLES, inExcavation } from '@crane/sim/site';
import { SPEC } from '@crane/sim/spec';
import { ensureAudio, updateSound } from '@crane/sound';
import { cr, useUI } from '@crane/store';
import { Hud } from '@crane/ui/App';
import '@crane/ui/styles.css';
import type { Blocker, ZoneModule } from './types';

bindKeys();

/** Where the site's genset is kept while the truck has it; `mine`: that set is the truck's genset. */
const AWAY = 1e4;
let mine = false;
const genset = () => cr.loads.find((l) => l.def.id === 'genset');

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
  solids: EMBED.solids,
  supports: EMBED.supports,
  // the set on the truck's deck moves with the truck: not a wall for it
  blockers: () => [
    ...OBSTACLES.filter((o) => o.y1 > 0.45 && o.y0 < 1.8),
    body(),
    ...cr.loads.filter((l) => l.state !== 'air' && l.x < AWAY - 1 && !(mine && l === genset())).map((l) => loadBox(l, l.x, l.y, l.z)),
  ],
  cargo(deck, has) {
    const L = genset();
    if (!L) return { has, shown: false };
    if (has) {
      // the site's own set is somewhere else: the truck's genset stays the truck's
      if (!mine && L.x < AWAY - 1) return { has, shown: false };
      mine = true;
      if (L.state !== 'rest') {
        mine = false; // hoisted off the deck (or dropped)
        return { has: false, shown: false };
      }
      if (!deck) {
        L.x = AWAY;
        L.z = AWAY;
        return { has: true, shown: false };
      }
      L.x = deck.x;
      L.z = deck.z;
      L.y = deck.top;
      L.yaw = deck.loadYaw;
      L.placed = false;
      return { has: true, shown: true };
    }
    // set down on the deck timbers and unhooked: it rides with the truck
    if (deck && L.state === 'rest' && L.y > deck.y1 - 0.05 && L.y < deck.y1 + 0.3 && inside(deck, L.x, L.z) && cr.attached !== cr.loads.indexOf(L)) {
      mine = true;
      return { has: true, shown: true };
    }
    return { has: false, shown: false };
  },
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
    // 'fromTruck': the genset comes on the Traknus truck, so the site's own set is not at the laydown area
    const id = what === 'fromTruck' ? 'genset' : what;
    const i = cr.loads.findIndex((l) => l.def.id === id);
    if (i < 0) return;
    cr.target = i;
    if (what === 'fromTruck' && !mine) {
      const L = cr.loads[i];
      Object.assign(L, { x: AWAY, z: AWAY, state: 'rest', placed: false });
      mine = true;
    }
  },
};
export default zone;
