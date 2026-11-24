// The land between the zones: one terrain mesh (with a hole where the mounted zone draws its own ground), the sea,
// the roads and instanced trees and oil palms. All of it sits in the shifted world group (world coordinates).
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { SITE_TREES } from '@crane/scene/siteTrees';
import { crownGeometry, palmMaterials, palmTrunkH } from '@tractor/scene/palmKit';
import { EDGE_TREES } from '@excavator/scene/edgeTrees';
import { shape } from '@excavator/sim/site';
import { ROADS, ROAD_HALF, ZONES } from './map';

/** The dig site's own ground height (its trees stand on it). */
const EXC_GROUND = (x: number, z: number) => shape(x, z).h;
import { MAP, SEA_Y, coastZ, noise, roadDist, terrainH, zoneDist } from './terrain';
import { MAT_OF, TREE_LAYOUT, TREE_TINT, treeParts } from '@excavator/scene/treeKit';
import { Grass, groundMaps } from './Grass';
import { canvasTexture } from './util';

/** Local rect of the mounted zone (render coordinates = the zone's own), where the world terrain is not drawn. */
export const hole = { value: new THREE.Vector4(1e7, 1e7, 1e7, 1e7) };

const STEP = 8;

function Ground() {
  const geo = useMemo(() => {
    const w = MAP.x1 - MAP.x0;
    const d = MAP.z1 - MAP.z0;
    const g = new THREE.PlaneGeometry(w, d, Math.round(w / STEP), Math.round(d / STEP));
    g.rotateX(-Math.PI / 2);
    g.translate((MAP.x0 + MAP.x1) / 2, 0, (MAP.z0 + MAP.z1) / 2);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    // the same grid as maps for the grass: height and how much grass grows (half float), and the ground colour
    const cols = Math.round(w / STEP) + 1;
    const rows = Math.round(d / STEP) + 1;
    const hg = new Uint16Array(cols * rows * 4);
    const gc = new Uint8Array(cols * rows * 4);
    const c = new THREE.Color();
    const grass = new THREE.Color('#5b7f34');
    const grass2 = new THREE.Color('#7b8f3e');
    const dry = new THREE.Color('#8f8a55');
    const laterite = new THREE.Color('#9a5a34');
    const sand = new THREE.Color('#d8c79a');
    const wetSand = new THREE.Color('#9d8f6c');
    const hill = new THREE.Color('#47672c');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const h = terrainH(x, z);
      p.setY(i, h);
      const n = noise(x / 37, z / 37);
      c.copy(grass).lerp(grass2, n);
      if (noise(x / 90 + 4, z / 90) > 0.68) c.lerp(dry, 0.5);
      if (h > 6) c.lerp(hill, Math.min(1, (h - 6) / 20));
      const rd = roadDist(x, z);
      if (rd < ROAD_HALF + 4) c.lerp(laterite, 0.75 * (1 - Math.max(0, rd - ROAD_HALF) / 4));
      const zd = zoneDist(x, z);
      if (zd < 10) c.lerp(laterite, 0.35 * (1 - zd / 10));
      const cz = coastZ(x);
      if (z < cz + 14) c.lerp(sand, Math.min(1, (cz + 14 - z) / 10));
      if (z < cz - 2) c.lerp(wetSand, Math.min(1, (cz - 2 - z) / 6));
      col.set([c.r, c.g, c.b], i * 3);
      // grass: none on roads, sand, the sea or in a zone; thinner on the dry patches and the laterite edges
      let grow = 1;
      if (rd < ROAD_HALF + 2.5) grow = 0;
      else if (rd < ROAD_HALF + 6) grow = 0.5;
      if (zd < 1) grow = 0;
      if (z < cz + 12 || h < SEA_Y + 0.5) grow = 0;
      if (noise(x / 90 + 4, z / 90) > 0.68) grow *= 0.7;
      const k = (Math.round((z - MAP.z0) / STEP) * cols + Math.round((x - MAP.x0) / STEP)) * 4;
      hg[k] = THREE.DataUtils.toHalfFloat(h);
      hg[k + 1] = THREE.DataUtils.toHalfFloat(grow);
      hg[k + 3] = THREE.DataUtils.toHalfFloat(1);
      gc[k] = Math.round(c.r * 255);
      gc[k + 1] = Math.round(c.g * 255);
      gc[k + 2] = Math.round(c.b * 255);
      gc[k + 3] = 255;
    }
    const ht = new THREE.DataTexture(hg, cols, rows, THREE.RGBAFormat, THREE.HalfFloatType);
    const ct = new THREE.DataTexture(gc, cols, rows, THREE.RGBAFormat, THREE.UnsignedByteType);
    for (const t of [ht, ct]) {
      t.magFilter = t.minFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.needsUpdate = true;
    }
    groundMaps.height = ht;
    groundMaps.color = ct;
    groundMaps.min.set(MAP.x0 - STEP / 2, MAP.z0 - STEP / 2);
    groundMaps.size.set(cols * STEP, rows * STEP);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  const mat = useMemo(() => {
    // short grass and soil: blade strokes in several shades over a mottled base, near-neutral so the ground's own
    // colour shows through
    const tex = canvasTexture(512, 512, (g) => {
      g.fillStyle = '#bdbdb4';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 700; i++) {
        const v = 150 + Math.random() * 70;
        g.fillStyle = `rgba(${v},${v - 4},${v - 18},0.35)`;
        g.beginPath();
        g.arc(Math.random() * 512, Math.random() * 512, 4 + Math.random() * 14, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 26000; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const v = 140 + Math.random() * 115;
        g.strokeStyle = `rgb(${v - 6},${v},${v - 30})`;
        g.lineWidth = 0.8 + Math.random() * 1.2;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 5);
        g.stroke();
      }
    });
    tex.repeat.set((MAP.x1 - MAP.x0) / 9, (MAP.z1 - MAP.z0) / 9);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 });
    m.onBeforeCompile = (s) => {
      s.uniforms.uHole = hole;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWxz;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWxz = (modelMatrix * vec4(transformed, 1.0)).xz;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWxz;\nuniform vec4 uHole;')
        .replace('void main() {', 'void main() {\nif (vWxz.x > uHole.x && vWxz.x < uHole.z && vWxz.y > uHole.y && vWxz.y < uHole.w) discard;')
        // large-scale variation so the tiling never shows: the detail texture again at 1/23 the size, as a tint
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= 0.78 + 0.44 * texture2D(map, vWxz / 207.0).g;');
    };
    return m;
  }, []);
  return <mesh geometry={geo} material={mat} receiveShadow />;
}

function Sea() {
  const tex = useMemo(() => {
    const t = canvasTexture(256, 256, (g) => {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2500; i++) {
        const v = 100 + Math.random() * 60;
        g.fillStyle = `rgb(${v},${v},255)`;
        g.beginPath();
        g.ellipse(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 10, 2 + Math.random() * 3, 0, 0, Math.PI * 2);
        g.fill();
      }
    });
    t.repeat.set(160, 60);
    return t;
  }, []);
  useFrame((_, dt) => {
    tex.offset.x += dt * 0.004;
    tex.offset.y += dt * 0.006;
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[100, SEA_Y, -1200]}>
      <planeGeometry args={[5000, 2400]} />
      <meshStandardMaterial color="#1f4c5c" roughness={0.12} metalness={0.25} normalMap={tex} normalScale={new THREE.Vector2(0.4, 0.4)} />
    </mesh>
  );
}

function Roads() {
  const { geo, mat } = useMemo(() => {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    ROADS.forEach((r, ri) => {
      const y = 0.05 + ri * 0.006;
      let along = 0;
      r.forEach((p, i) => {
        const a = r[Math.max(0, i - 1)];
        const b = r[Math.min(r.length - 1, i + 1)];
        let dx = b[0] - a[0];
        let dz = b[1] - a[1];
        const l = Math.hypot(dx, dz);
        dx /= l;
        dz /= l;
        if (i > 0) along += Math.hypot(p[0] - r[i - 1][0], p[1] - r[i - 1][1]);
        // widen at bends so the edges stay parallel
        let k = 1;
        if (i > 0 && i < r.length - 1) {
          const ax = p[0] - a[0];
          const az = p[1] - a[1];
          const al = Math.hypot(ax, az);
          k = 1 / Math.max(0.5, (ax / al) * dx + (az / al) * dz);
        }
        const nx = -dz * ROAD_HALF * k;
        const nz = dx * ROAD_HALF * k;
        const base = pos.length / 3;
        pos.push(p[0] + nx, y, p[1] + nz, p[0] - nx, y, p[1] - nz);
        uv.push(0, along / 10, 1, along / 10);
        if (i > 0) idx.push(base - 2, base, base - 1, base - 1, base, base + 1); // facing up
      });
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const tex = canvasTexture(128, 256, (c) => {
      c.fillStyle = '#4a4b4d';
      c.fillRect(0, 0, 128, 256);
      for (let i = 0; i < 3000; i++) {
        const v = 55 + Math.random() * 40;
        c.fillStyle = `rgb(${v},${v},${v + 2})`;
        c.fillRect(Math.random() * 128, Math.random() * 256, 1.5, 1.5);
      }
      c.fillStyle = '#d9d6c8';
      c.fillRect(5, 0, 3, 256);
      c.fillRect(120, 0, 3, 256);
      c.fillStyle = '#e8c21c';
      c.fillRect(62, 0, 4, 140);
    });
    tex.wrapS = THREE.ClampToEdgeWrapping;
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    return { geo: g, mat: m };
  }, []);
  return <mesh geometry={geo} material={mat} receiveShadow />;
}

// ---- trees ----

function rand(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const palmTrunkGeo = () => {
  const g = new THREE.CylinderGeometry(0.32, 0.42, 1, 7, 1, true);
  g.translate(0, 0.5, 0);
  return g;
};

interface Inst {
  x: number;
  z: number;
  s: number;
  r: number;
  h: number;
}

function useInstances(list: Inst[], geo: THREE.BufferGeometry, mat: THREE.Material, place: (m: THREE.Matrix4, i: Inst) => void, tint?: (c: THREE.Color, i: Inst) => void) {
  return useMemo(() => {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    list.forEach((it, k) => {
      place(m, it);
      mesh.setMatrixAt(k, m);
      if (tint) {
        tint(c, it);
        mesh.setColorAt(k, c);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }, [list, geo, mat]); // eslint-disable-line react-hooks/exhaustive-deps
}

const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const sc = new THREE.Vector3();

let planted: ReturnType<typeof plant> | null = null;
/** Every palm and tree (the same every run): for drawing, and their trunks for collisions. */
export const plants = () => (planted ??= plant());

/** Palm blocks north of the trunk road, the tropical trees elsewhere: spread over a few chunks so the ones behind the camera are culled. */
function plant() {
  const palms: Inst[][] = [[], [], [], [], [], []];
  const trees: Inst[][] = [[], [], [], []];
  const rnd = rand(42);
  // oil palm plantation: triangular planting 9 m, rows 7.8 m apart, harvest roads every 24 rows
  for (let row = 0; row < 75; row++) {
    if (row % 24 === 23) continue;
    const z = 880 + row * 7.8;
    for (let x = -620 + (row % 2) * 4.5; x < 840; x += 9) {
      if (Math.abs(x) % 400 < 9) continue; // block roads
      const px = x + (rnd() - 0.5) * 0.8;
      const pz = z + (rnd() - 0.5) * 0.8;
      if (roadDist(px, pz) < ROAD_HALF + 7 || zoneDist(px, pz) < 6) continue;
      const h = terrainH(px, pz);
      const chunk = Math.min(5, Math.max(0, Math.floor((px + 620) / 245)));
      palms[chunk].push({ x: px, z: pz, s: 0.75 + rnd() * 0.45, r: rnd() * Math.PI * 2, h });
    }
  }
  // tropical trees in clumps, not in the plantation, on the beach, on roads or in zones
  for (let x = MAP.x0 + 20; x < MAP.x1 - 20; x += 13)
    for (let z = MAP.z0 + 20; z < MAP.z1 - 20; z += 13) {
      const px = x + (rnd() - 0.5) * 10;
      const pz = z + (rnd() - 0.5) * 10;
      if (pz > 860 && pz < 1480 && px > -640 && px < 860) continue;
      const dens = noise(px / 120, pz / 120);
      if (dens < 0.52 || rnd() > (dens - 0.45) * 2.2) continue;
      if (pz < coastZ(px) + 14) continue;
      if (roadDist(px, pz) < ROAD_HALF + 6 || zoneDist(px, pz) < 14) continue;
      const h = terrainH(px, pz);
      const chunk = (px > 125 ? 1 : 0) + (pz > 550 ? 2 : 0);
      trees[chunk].push({ x: px, z: pz, s: 0.7 + rnd() * 0.8, r: rnd() * Math.PI * 2, h });
    }
  // the trees of the crane site and the dig site, which those simulators leave to the world when embedded
  for (const [zone, list] of [
    ['crane', SITE_TREES.map(([x, h, z]) => ({ x, z, s: h / 4.6 }))],
    ['excavator', EDGE_TREES.map(([x, z, s]) => ({ x, z, s: s * 1.15 }))],
  ] as const) {
    const d = ZONES[zone];
    for (const t of list) {
      const px = d.x + t.x;
      const pz = d.z + t.z;
      trees[(px > 125 ? 1 : 0) + (pz > 550 ? 2 : 0)].push({ x: px, z: pz, s: t.s, r: rnd() * Math.PI * 2, h: zone === 'excavator' ? EXC_GROUND(t.x, t.z) : 0 });
    }
  }
  return { palms, trees };
}

function Trees() {
  const { palms, trees } = plants();
  const mats = useMemo(
    () => ({
      // the estate's own bark and fronds (the tractor simulator's), so the plantation reads the same near and far
      trunk: palmMaterials().trunkMat,
      frond: palmMaterials().crownMat,
      ...treeParts().mat,
    }),
    [],
  );
  const geos = useMemo(() => {
    // the leafy trees come from the shared tree kit (the same as in the simulators)
    return { palmTrunk: palmTrunkGeo(), crown: crownGeometry(14, 5), ...treeParts().geo };
  }, []);
  const meshes: THREE.Object3D[] = [];
  // fixed number of chunks, so the hooks below run in the same order every render
  palms.forEach((list) => {
    meshes.push(
      useInstances(list, geos.palmTrunk, mats.trunk, (m, it) => m.compose(v.set(it.x, it.h - 0.1, it.z), q.setFromEuler(e.set(0, it.r, 0)), sc.set(it.s, palmTrunkH(it.s), it.s))),
      useInstances(list, geos.crown, mats.frond, (m, it) => m.compose(v.set(it.x, it.h + palmTrunkH(it.s) - 0.2, it.z), q.setFromEuler(e.set(0, it.r, 0)), sc.set(it.s, it.s, it.s))),
    );
  });
  trees.forEach((list) => {
    meshes.push(
      ...(['trunk', 'canopy', 'core', 'shade'] as const).map((part) =>
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useInstances(list, geos[part], mats[MAT_OF[part]], (m, it) => TREE_LAYOUT[part](m, it), TREE_TINT[part]),
      ),
    );
  });
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}

export function Land() {
  return (
    <>
      <Ground />
      <Sea />
      <Roads />
      <Trees />
      <Grass />
    </>
  );
}

