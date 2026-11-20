import { describe, expect, it } from 'vitest';
import { ROADS, ROAD_HALF, ZONE_LIST, distToZone } from './map';
import { MISSIONS } from './missions';
import { SEA_Y, roadDist, terrainH } from './terrain';

describe('map', () => {
  it('keeps zones far enough apart that only one is loaded at a time', () => {
    for (const a of ZONE_LIST)
      for (const b of ZONE_LIST) {
        if (a === b) continue;
        // the gap between two footprints, measured from a's corners and centre to b
        const [x0, z0, x1, z1] = a.rect;
        const pts = [
          [x0, z0],
          [x1, z0],
          [x0, z1],
          [x1, z1],
          [(x0 + x1) / 2, (z0 + z1) / 2],
        ];
        const gap = Math.min(...pts.map(([x, z]) => distToZone(b, a.x + x, a.z + z)));
        expect(gap, `${a.id} – ${b.id}`).toBeGreaterThan(150);
      }
  });

  it('ends every road at a zone or on another road', () => {
    for (const r of ROADS) {
      const [x, z] = r[r.length - 1];
      const zone = Math.min(...ZONE_LIST.map((d) => distToZone(d, x, z)));
      const junction = ROADS.some((o) => o !== r && o.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < 1));
      expect(zone < 25 || junction, `road ending at ${x}, ${z}`).toBe(true);
    }
  });

  it('sends fast travel to dry land outside each zone', () => {
    for (const d of ZONE_LIST) {
      const x = d.x + d.arrive[0];
      const z = d.z + d.arrive[1];
      expect(distToZone(d, x, z), d.id).toBeGreaterThan(0);
      expect(terrainH(x, z), d.id).toBeGreaterThan(SEA_Y + 0.5);
    }
  });
});

describe('terrain', () => {
  it('is flat on the roads', () => {
    for (const r of ROADS)
      for (let i = 1; i < r.length; i++) {
        const x = (r[i - 1][0] + r[i][0]) / 2;
        const z = (r[i - 1][1] + r[i][1]) / 2;
        expect(roadDist(x, z)).toBeLessThan(ROAD_HALF);
        expect(Math.abs(terrainH(x, z))).toBeLessThan(0.3);
      }
  });

  it('has sea south of the port', () => {
    expect(terrainH(0, -80)).toBeLessThan(SEA_Y);
    expect(terrainH(600, -120)).toBeLessThan(SEA_Y);
  });
});

describe('missions', () => {
  it('only uses zones that exist', () => {
    const ids = new Set(ZONE_LIST.map((d) => d.id));
    for (const m of MISSIONS) for (const s of m.steps) expect(ids.has(s.zone), `${m.id}: ${s.zone}`).toBe(true);
  });
});
