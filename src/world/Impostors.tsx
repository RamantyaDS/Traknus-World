// Distant stand-ins for the zones that are not loaded: their landmarks as a few coloured boxes and cylinders merged
// into one mesh per zone (one draw call each), so the world never looks empty. Hidden for the mounted zone.
import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALMS, height } from '@tractor/sim/estate';
import { crownGeometry, palmMaterials, palmTrunkH } from '@tractor/scene/palmKit';
import { ZONES, ZONE_LIST, type ZoneId } from './map';
import { useWorld } from './state';
import { palmTrunkGeo } from './Land';

type Part = { box?: [number, number, number]; cyl?: [number, number, number]; at: [number, number, number]; c: string; yaw?: number; tilt?: number };

const B = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, yaw = 0): Part => ({ box: [sx, sy, sz], at: [x, y + sy / 2, z], c, yaw });
const C = (x: number, y: number, z: number, r0: number, r1: number, h: number, c: string): Part => ({ cyl: [r0, r1, h], at: [x, y + h / 2, z], c });
const plate = (d: ZoneId, c: string): Part => {
  const [x0, z0, x1, z1] = ZONES[d].rect;
  return { box: [x1 - x0, 0.04, z1 - z0], at: [(x0 + x1) / 2, 0.02, (z0 + z1) / 2], c };
};

const BOXES = ['#1e5aa8', '#b8322a', '#d9802b', '#6e7378', '#2f7a47', '#8a2f6b', '#c9b72e', '#2a8b9c'];

function partsOf(id: ZoneId): Part[] {
  switch (id) {
    case 'port': {
      const p: Part[] = [plate('port', '#9b9a94')];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) for (let t = 0; t < 1 + ((r * 3 + c * 5) % 3); t++) p.push(B(22 + c * 14, t * 2.59, 14 + r * 6, 12.19, 2.59, 2.44, BOXES[(r * 3 + c + t) % 8]));
      for (let c = 0; c < 4; c++) for (let t = 0; t < 1 + (c % 2); t++) p.push(B(-48 + c * 13.5, t * 2.59, -18, 12.19, 2.59, 2.44, BOXES[(c + t * 3) % 8]));
      p.push(B(-62, 0, 22, 30, 12, 36, '#8fa3b5'), B(-62, 12, 22, 31, 0.6, 37, '#5d6b78'));
      // ship-to-shore crane
      for (const x of [38, 56]) for (const z of [-27, -8]) p.push(B(x, 0, z, 1.6, 40, 2.2, '#c23b2b'));
      p.push(B(47, 40, -30, 20, 3, 70, '#c23b2b'), B(47, 43, -10, 14, 4, 8, '#d8d8d0'));
      // ship at the quay
      p.push(B(0, -6, -47, 130, 9, 21, '#2e3a46'), B(-48, 3, -47, 14, 12, 18, '#e8e8e2'), B(10, 3, -47, 60, 2.6, 16, BOXES[1]), B(30, 3, -47, 20, 5.2, 16, BOXES[0]));
      for (const [x, z] of [[-12, -14], [12, 54], [-36, 54], [12, -16]]) p.push(C(x, 0, z, 0.3, 0.3, 30, '#8c9094'));
      return p;
    }
    case 'bengkel':
      return [plate('bengkel', '#8d8d88'), B(0, 0, 0, 16, 7, 12, '#d9d4c8'), B(0, 7, 0, 17, 0.6, 13, '#e05a1a'), B(8.05, 0.4, 0, 0.1, 5, 6, '#3d4f63')];
    case 'gedung':
      return [plate('gedung', '#a3a39c'), B(-10, 0, -15, 34, 16, 20, '#c9cdd2'), B(-10, 16, -15, 35, 0.8, 21, '#6f7880'), B(10, 0, 8, 12.2, 2.9, 2.44, '#3a6aa5'), B(18, 0, 8, 3, 4, 3, '#8a8f94')];
    case 'crane': {
      return [
        plate('crane', '#9e9a90'),
        B(14, 0, 29, 40, 12, 30, '#b9c2c9'),
        B(14, 12, 29, 41, 1, 31, '#7f8b95'),
        B(47, 0, 19, 14, 8, 14, '#c7c2b6'),
        C(-62, 0, -20, 2.6, 1.9, 148.5, '#efefea'),
        B(-62, 148.5, -20, 4.5, 4.5, 12, '#efefea'),
        B(-24, 0, 24, 9, 4, 5.5, '#c9c4b8'),
        // the rough terrain crane parked with its boom down
        B(-14, 0, 2, 3, 3.2, 12, '#b5282a'),
        { box: [1.2, 1.2, 14], at: [-14, 4.6, 7], c: '#c9a227', tilt: -0.12 },
      ];
    }
    case 'excavator':
      return [
        // the world terrain already shows the dig site's hill, quarry and swamp; only the machines here
        B(-10, 0, -5, 4.2, 1.4, 6, '#2b2b2b'),
        B(-10, 1.4, -5.5, 3.6, 1.8, 5, '#f2bf18'),
        { box: [0.9, 0.9, 8], at: [-10, 4.2, 1], c: '#f2bf18', tilt: -0.35 },
        B(15, 0, -30, 5.4, 4.2, 9.5, '#d9a21c'),
      ];
    case 'plant':
      return [
        plate('plant', '#6f8a4a'),
        B(0, 0, 0, 54, 9, 18, '#c5ccd1'),
        B(0, 9, 0, 55, 0.6, 19, '#7a8790'),
        ...[-20, -10, 0, 10, 20].map((x) => C(x, 9, -3.3, 0.4, 0.4, 5, '#c0c4c8')),
        B(15, 0, 165, 40, 14, 22, '#7f97a8'),
        B(42, 0, 162, 10, 10, 10, '#c8ccd0'),
        C(44, 0, 158, 1.2, 0.9, 34, '#efefea'),
        B(62, 0, 168, 20, 10, 16, '#8e9a7a'),
        B(-4, 0, 30, 6, 9, 0.5, '#8c9094'),
      ];
    case 'tractor':
      // the world terrain follows the estate's own ground here; the laterite road, the loading pad and the bin
      return [B(0, 0.12, 18, 6.4, 0.06, 285, '#a25a32'), B(2, 0, 138, 32, 0.1, 28, '#9d9d98'), B(9, 0, 136, 6, 1.7, 3, '#6e7378')];
  }
}

function build(id: ZoneId) {
  const geos: THREE.BufferGeometry[] = [];
  const col = new THREE.Color();
  for (const p of partsOf(id)) {
    const g = p.box ? new THREE.BoxGeometry(...p.box) : new THREE.CylinderGeometry(p.cyl![1], p.cyl![0], p.cyl![2], 12);
    if (p.tilt) g.rotateX(p.tilt);
    if (p.yaw) g.rotateY(p.yaw);
    g.translate(...p.at);
    col.set(p.c);
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    geos.push(g.index ? g.toNonIndexed() : g);
  }
  const d = ZONES[id];
  const m = mergeGeometries(geos)!;
  m.translate(d.x, 0, d.z);
  return m;
}

/** The estate's palms (same positions as in the tractor simulator) while that zone is not loaded. */
function EstatePalms({ visible }: { visible: boolean }) {
  const meshes = useMemo(() => {
    const d = ZONES.tractor;
    // the estate's own palms (parts from the tractor simulator), a lighter crown: the switch to the zone does not show
    const { trunkMat, crownMat } = palmMaterials();
    const trunk = new THREE.InstancedMesh(palmTrunkGeo(), trunkMat, PALMS.length);
    const crown = new THREE.InstancedMesh(crownGeometry(14, 5), crownMat, PALMS.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    PALMS.forEach((p, i) => {
      const h = height(p.x, p.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.r);
      trunk.setMatrixAt(i, m.compose(v.set(p.x + d.x, h - 0.1, p.z + d.z), q, s.set(p.s, palmTrunkH(p.s), p.s)));
      crown.setMatrixAt(i, m.compose(v.set(p.x + d.x, h + palmTrunkH(p.s) - 0.2, p.z + d.z), q, s.set(p.s, p.s, p.s)));
    });
    for (const x of [trunk, crown]) {
      x.instanceMatrix.needsUpdate = true;
      x.computeBoundingSphere();
    }
    return [trunk, crown];
  }, []);
  return (
    <group visible={visible}>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}

export function Impostors() {
  const zone = useWorld((s) => s.zone);
  const geos = useMemo(() => Object.fromEntries(ZONE_LIST.map((d) => [d.id, build(d.id)])) as Record<ZoneId, THREE.BufferGeometry>, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), []);
  return (
    <>
      {ZONE_LIST.map((d) => (
        <mesh key={d.id} geometry={geos[d.id]} material={mat} visible={zone !== d.id} receiveShadow />
      ))}
      <EstatePalms visible={zone !== 'tractor'} />
    </>
  );
}
