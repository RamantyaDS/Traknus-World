// Ground height and walls for the operator and the truck, in world coordinates.
import { loaded } from '../zones';
import type { Blocker } from '../zones/types';
import { ZONES, ZONE_LIST, inRect } from './map';
import { useWorld } from './state';
import { plants } from './Land';
import { terrainH } from './terrain';
import { truck } from './state';

/** Ground height at a world point: the mounted zone's own ground on its footprint, the world terrain elsewhere. */
export function groundH(wx: number, wz: number) {
  const id = useWorld.getState().zone;
  if (id) {
    const d = ZONES[id];
    const m = loaded[id];
    if (m && inRect(d, wx, wz)) return m.groundAt ? m.groundAt(wx - d.x, wz - d.z) : 0;
  }
  for (const d of ZONE_LIST) if (inRect(d, wx, wz)) return 0;
  return terrainH(wx, wz);
}

let cache: { t: number; list: Blocker[] } = { t: -1, list: [] };

/** Solid boxes of the mounted zone in world coordinates (refreshed once per frame). */
export function blockers(frame: number) {
  if (cache.t === frame) return cache.list;
  const id = useWorld.getState().zone;
  const m = id ? loaded[id] : null;
  const list: Blocker[] = [];
  if (id && m) {
    const d = ZONES[id];
    for (const b of m.blockers()) list.push({ ...b, x: b.x + d.x, z: b.z + d.z });
  }
  cache = { t: frame, list };
  return list;
}

/** The truck's solid boxes (truck frame: x across, z forward from its centre): cab, deck, headboard. */
export const TRUCK_BOXES = [
  { x: 0, z: 3.45, hx: 1.25, hz: 1.15, y0: 0.15, y1: 3.2 },
  { x: 0, z: -1.6, hx: 1.25, hz: 3.3, y0: 0.15, y1: 1.38 },
  { x: 0, z: 1.6, hx: 1.25, hz: 0.12, y0: 1.3, y1: 2.95 },
];

/** The truck's boxes in world coordinates (for someone on foot). */
function truckBlockers(): Blocker[] {
  return TRUCK_BOXES.map((b) => ({
    x: truck.x + b.x * Math.cos(truck.yaw) + b.z * Math.sin(truck.yaw),
    z: truck.z - b.x * Math.sin(truck.yaw) + b.z * Math.cos(truck.yaw),
    hx: b.hx,
    hz: b.hz,
    yaw: truck.yaw,
    y0: truck.y + b.y0,
    y1: truck.y + (truck.cargo ? 3.8 : b.y1),
  }));
}

/** Trunks of the world's palms and trees in an 8 m grid (built once). */
const CELL = 8;
let trunks: Map<string, { x: number; z: number; r: number }[]> | null = null;
function trunkGrid() {
  if (trunks) return trunks;
  trunks = new Map();
  const { palms, trees } = plants();
  for (const it of [...palms.flat(), ...trees.flat()]) {
    const k = `${Math.floor(it.x / CELL)},${Math.floor(it.z / CELL)}`;
    const list = trunks.get(k) ?? [];
    list.push({ x: it.x, z: it.z, r: 0.4 * it.s });
    trunks.set(k, list);
  }
  return trunks;
}

/** Push a circle out of the trunks around it. */
function collideTrunks(p: { x: number; z: number }, r: number) {
  let hit = false;
  const g = trunkGrid();
  const cx = Math.floor(p.x / CELL);
  const cz = Math.floor(p.z / CELL);
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (const t of g.get(`${cx + i},${cz + j}`) ?? []) {
        const dx = p.x - t.x;
        const dz = p.z - t.z;
        const d = Math.hypot(dx, dz);
        const min = r + t.r;
        if (d >= min) continue;
        hit = true;
        const k = d > 1e-4 ? (min - d) / d : 0;
        p.x += d > 1e-4 ? dx * k : min;
        p.z += dz * k;
      }
  return hit;
}

/**
 * Keep a circle (radius r, standing between y and y + h) out of the mounted zone's solids, the world's tree and palm
 * trunks and, for someone on foot (`onFoot`), the truck. Boxes lower than `step` above the feet are stepped over.
 * Returns true when it touched something.
 */
export function collide(p: { x: number; z: number }, r: number, y: number, h: number, step: number, frame: number, onFoot = false) {
  let hit = collideTrunks(p, r);
  for (const b of onFoot ? [...blockers(frame), ...truckBlockers()] : blockers(frame)) {
    if (b.y1 < y + step || b.y0 > y + h) continue;
    const dx = p.x - b.x;
    const dz = p.z - b.z;
    if (Math.abs(dx) > b.hx + b.hz + r && Math.abs(dz) > b.hx + b.hz + r) continue;
    const s = Math.sin(b.yaw);
    const c = Math.cos(b.yaw);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const cx = Math.max(-b.hx, Math.min(b.hx, lx));
    const cz = Math.max(-b.hz, Math.min(b.hz, lz));
    let ox = lx - cx;
    let oz = lz - cz;
    const dist = Math.hypot(ox, oz);
    if (dist >= r) continue;
    hit = true;
    if (dist < 1e-4) {
      // centre inside the box: leave by the nearest face
      const ex = b.hx - Math.abs(lx);
      const ez = b.hz - Math.abs(lz);
      if (ex < ez) {
        ox = Math.sign(lx) || 1;
        oz = 0;
        const push = ex + r;
        p.x += ox * c * push;
        p.z += -ox * s * push;
      } else {
        const sz = Math.sign(lz) || 1;
        const push = ez + r;
        p.x += sz * s * push;
        p.z += sz * c * push;
      }
      continue;
    }
    const k = (r - dist) / dist;
    ox *= k;
    oz *= k;
    // back from box axes to world: local x → (c, −s), local z → (s, c)
    p.x += ox * c + oz * s;
    p.z += -ox * s + oz * c;
  }
  return hit;
}
