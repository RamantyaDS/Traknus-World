// Ground height and walls for the operator and the truck, in world coordinates.
import { loaded } from '../zones';
import type { Blocker } from '../zones/types';
import { ZONES, ZONE_LIST, inRect } from './map';
import { useWorld } from './state';
import { terrainH } from './terrain';

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

/**
 * Push a circle (radius r, standing between y and y + h) out of every box it overlaps. Returns true when it touched
 * something. Boxes lower than `step` above the feet are stepped over.
 */
export function collide(p: { x: number; z: number }, r: number, y: number, h: number, step: number, frame: number) {
  let hit = false;
  for (const b of blockers(frame)) {
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
