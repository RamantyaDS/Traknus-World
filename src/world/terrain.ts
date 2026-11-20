// Height of the world terrain between the zones: lowland with gentle hills, flat along the roads and around every
// zone (each zone draws its own ground on its footprint), a beach and the sea south of the coast, and higher hills
// towards the north and west edges of the map.
import { shape as excavatorShape } from '@excavator/sim/site';
import { height as estateHeight } from '@tractor/sim/estate';
import { ROADS, ROAD_HALF, ZONES, ZONE_LIST, distToZone, type ZoneDef } from './map';

export const SEA_Y = -1.4; // same as the port's sea
export const MAP = { x0: -1100, x1: 1350, z0: -700, z1: 1800 };

function hash(i: number, j: number) {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = (t: number) => t * t * (3 - 2 * t);
export function noise(x: number, z: number) {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = fade(x - i);
  const fz = fade(z - j);
  const a = hash(i, j);
  const b = hash(i + 1, j);
  const c = hash(i, j + 1);
  const d = hash(i + 1, j + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
const fbm = (x: number, z: number) => noise(x, z) * 0.55 + noise(x * 2.1 + 7, z * 2.1 - 3) * 0.3 + noise(x * 4.3 - 11, z * 4.3 + 5) * 0.15;
const smooth = (a: number, b: number, v: number) => fade(Math.max(0, Math.min(1, (v - a) / (b - a))));

/** The coastline: z of the shore at x (the port's quay is at z −30). */
export const coastZ = (x: number) => (Math.abs(x) < 125 ? -30 : -30 - 22 * smooth(125, 260, Math.abs(x)) + 14 * (noise(x / 160, 3.3) - 0.5));

const SEGS: [number, number, number, number][] = ROADS.flatMap((r) => r.slice(1).map((p, i) => [r[i][0], r[i][1], p[0], p[1]] as [number, number, number, number]));

/** Distance from (x, z) to the nearest road centre line. */
export function roadDist(x: number, z: number) {
  let best = Infinity;
  for (const [ax, az, bx, bz] of SEGS) {
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

export function zoneDist(x: number, z: number) {
  let best = Infinity;
  for (const d of ZONE_LIST) best = Math.min(best, distToZone(d, x, z));
  return best;
}

/** Zones whose ground is not flat: the world terrain meets their edge at their height. */
const EDGES: [ZoneDef, (x: number, z: number) => number][] = [
  [ZONES.excavator, (x, z) => excavatorShape(x, z).h],
  [ZONES.tractor, estateHeight],
];

/** Terrain height at a world point (zones excluded: they report their own ground). */
export function terrainH(x: number, z: number) {
  // rolling land, rising to hills near the north and west edges
  const edge = Math.max(smooth(1150, 1700, z), smooth(-650, -1050, x), smooth(1000, 1300, x) * 0.6);
  let h = (fbm(x / 320, z / 320) - 0.45) * 10 + edge * (25 + 60 * fbm(x / 180 + 9, z / 180));
  // flat near roads and zones
  const flat = Math.min(smooth(ROAD_HALF + 4, ROAD_HALF + 45, roadDist(x, z)), smooth(4, 70, zoneDist(x, z)));
  h *= flat;
  // the dig site's own terrain (quarry bench, swamp) carries on a little way past its edge instead of ending in a step
  for (const [E, f] of EDGES) {
    const de = distToZone(E, x, z);
    if (de >= 50) continue;
    const lx = Math.max(E.rect[0], Math.min(E.rect[2], x - E.x));
    const lz = Math.max(E.rect[1], Math.min(E.rect[3], z - E.z));
    const s = smooth(0, 45, de);
    h = f(lx, lz) * (1 - s) + h * s;
  }
  // the beach and the sea floor
  const c = coastZ(x);
  // beside the port the land stays level up to the quay line, farther away a sandy beach slopes into the water
  const inland = 30 * smooth(130, 190, Math.abs(x));
  if (z < c + inland) {
    const beach = smooth(c + inland, c - 18, z);
    h = h * (1 - beach) + (SEA_Y - 3) * beach;
  }
  return h;
}
