// The map of Kawasan Traknus. Units are metres, axes as in the simulators: z runs north (inland), y up, and looking
// north +x is on the left (the 2D map draws it that way). The sea is south of the port.
// Every simulator keeps its own coordinates: a zone's local origin sits at (x, z) in the world, never rotated, and
// `rect` is the local area where the zone's own ground replaces the world terrain.

export type ZoneId = 'port' | 'bengkel' | 'gedung' | 'crane' | 'excavator' | 'plant' | 'tractor';

export interface ZoneDef {
  id: ZoneId;
  name: string;
  sub: string;
  x: number;
  z: number;
  rect: [number, number, number, number]; // local x0, z0, x1, z1
  color: string;
  /** Where fast travel puts you (local), just outside the zone's entrance. */
  arrive: [number, number, number]; // x, z, yaw
}

export const ZONES: Record<ZoneId, ZoneDef> = {
  port: { id: 'port', name: 'Pelabuhan', sub: 'Forklift Toyota 4FD240', x: 0, z: 0, rect: [-120, -30, 120, 58.5], color: '#4f7fb0', arrive: [3, 66, Math.PI] },
  bengkel: { id: 'bengkel', name: 'Bengkel Traknus', sub: 'Dyno mesin Perkins 4016', x: -350, z: 60, rect: [-8, -6, 8, 6], color: '#8a6db0', arrive: [0, 13, Math.PI] },
  gedung: { id: 'gedung', name: 'Gedung kantor', sub: 'Genset cadangan 2250 kVA', x: -350, z: 330, rect: [-60, -60, 60, 60], color: '#c0703a', arrive: [66, 0, -Math.PI / 2] },
  crane: { id: 'crane', name: 'Proyek pabrik', sub: 'Crane Link-Belt RTC-80160', x: 500, z: 450, rect: [-210, -210, 210, 210], color: '#c23b3b', arrive: [-216, -50, Math.PI / 2] },
  excavator: { id: 'excavator', name: 'Lahan galian', sub: 'Excavator Komatsu PC800', x: -380, z: 700, rect: [-80, -80, 80, 80], color: '#d9a21c', arrive: [86, 0, -Math.PI / 2] },
  plant: { id: 'plant', name: 'PKS & PLTD', sub: 'Pembangkit 5 genset', x: 500, z: 1050, rect: [-200, -100, 200, 300], color: '#2f8f6a', arrive: [-206, 0, Math.PI / 2] },
  tractor: { id: 'tractor', name: 'Kebun sawit', sub: 'Traktor MF 5M.145', x: -300, z: 1150, rect: [-130, -125, 130, 160], color: '#5a8f2c', arrive: [0, -131, 0] },
};

export const ZONE_LIST = Object.values(ZONES);

/** Roads as polylines in world coordinates; each ends at a zone's entrance. */
export const ROADS: [number, number][][] = [
  // trunk road from the port gate inland
  [
    [0, 58],
    [0, 120],
    [0, 330],
    [0, 400],
    [0, 700],
    [0, 950],
    [0, 1050],
  ],
  [
    [0, 120],
    [-150, 112],
    [-260, 88],
    [-350, 74],
  ],
  [
    [0, 330],
    [-290, 330],
  ],
  // to the crane site's west gate (its fence has the gate at local x −70, z −58…−42)
  [
    [0, 400],
    [420, 400],
  ],
  [
    [0, 700],
    [-300, 700],
  ],
  [
    [0, 1050],
    [300, 1050],
  ],
  [
    [0, 950],
    [-300, 950],
    [-300, 1025],
  ],
];
export const ROAD_HALF = 4;

/** Where the player and the truck start: just outside the port gate. */
export const SPAWN = { x: 4, z: 70, yaw: Math.PI };
export const TRUCK_SPAWN = { x: -9, z: 78, yaw: 0 };

export const toWorld = (z: ZoneDef, x: number, y: number): [number, number] => [x + z.x, y + z.z];
export const inRect = (d: ZoneDef, wx: number, wz: number, pad = 0) => {
  const x = wx - d.x;
  const z = wz - d.z;
  return x > d.rect[0] - pad && x < d.rect[2] + pad && z > d.rect[1] - pad && z < d.rect[3] + pad;
};
/** Distance from a world point to a zone's footprint (0 inside). */
export function distToZone(d: ZoneDef, wx: number, wz: number) {
  const x = wx - d.x;
  const z = wz - d.z;
  const dx = Math.max(d.rect[0] - x, 0, x - d.rect[2]);
  const dz = Math.max(d.rect[1] - z, 0, z - d.rect[3]);
  return Math.hypot(dx, dz);
}
