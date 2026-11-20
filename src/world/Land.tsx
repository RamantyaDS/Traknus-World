// The land between the zones: one terrain mesh (with a hole where the mounted zone draws its own ground), the sea,
// the roads and instanced trees and oil palms. All of it sits in the shifted world group (world coordinates).
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { ROADS, ROAD_HALF } from './map';
import { MAP, SEA_Y, coastZ, noise, roadDist, terrainH, zoneDist } from './terrain';
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
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  const mat = useMemo(() => {
    const tex = canvasTexture(256, 256, (g) => {
      g.fillStyle = '#c8c8c8';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 9000; i++) {
        const v = 150 + Math.random() * 105;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 3);
      }
    });
    tex.repeat.set((MAP.x1 - MAP.x0) / 6, (MAP.z1 - MAP.z0) / 6);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 });
    m.onBeforeCompile = (s) => {
      s.uniforms.uHole = hole;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWxz;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWxz = (modelMatrix * vec4(transformed, 1.0)).xz;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWxz;\nuniform vec4 uHole;')
        .replace('void main() {', 'void main() {\nif (vWxz.x > uHole.x && vWxz.x < uHole.z && vWxz.y > uHole.y && vWxz.y < uHole.w) discard;');
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

/** An oil palm crown: drooping fronds as tapered strips, one geometry. */
export function palmCrown() {
  const pos: number[] = [];
  const idx: number[] = [];
  const N = 14;
  for (let f = 0; f < N; f++) {
    const a = (f / N) * Math.PI * 2 + (f % 2) * 0.2;
    const up = f % 2 ? 0.55 : 0.2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const segs = 4;
    const base = pos.length / 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const r = 4.2 * t;
      const y = up * 3 * t - 2.6 * t * t;
      const w = 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.05;
      pos.push(ca * r - sa * w, y, sa * r + ca * w, ca * r + sa * w, y, sa * r - ca * w);
      if (s > 0) {
        const b = base + s * 2;
        idx.push(b - 2, b - 1, b, b - 1, b + 1, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export const palmTrunkGeo = () => {
  const g = new THREE.CylinderGeometry(0.28, 0.42, 1, 7, 1, true);
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
  return { palms, trees };
}

function Trees() {
  const { palms, trees } = plants();
  const mats = useMemo(
    () => ({
      trunk: new THREE.MeshStandardMaterial({ color: '#6b5a44', roughness: 1 }),
      frond: new THREE.MeshStandardMaterial({ color: '#3f6e26', roughness: 0.85, side: THREE.DoubleSide }),
      bark: new THREE.MeshStandardMaterial({ color: '#5c4a38', roughness: 1 }),
      leaf: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }),
    }),
    [],
  );
  const geos = useMemo(() => {
    const trunk = new THREE.CylinderGeometry(0.22, 0.38, 1, 6, 1, true);
    trunk.translate(0, 0.5, 0);
    const canopy = new THREE.IcosahedronGeometry(1, 1);
    return { palmTrunk: palmTrunkGeo(), crown: palmCrown(), trunk, canopy };
  }, []);
  const meshes: THREE.Object3D[] = [];
  // fixed number of chunks, so the hooks below run in the same order every render
  palms.forEach((list) => {
    meshes.push(
      useInstances(list, geos.palmTrunk, mats.trunk, (m, it) => m.compose(v.set(it.x, it.h - 0.1, it.z), q.identity(), sc.set(it.s, 6.5 * it.s, it.s))),
      useInstances(list, geos.crown, mats.frond, (m, it) => m.compose(v.set(it.x, it.h + 6.4 * it.s, it.z), q.setFromEuler(e.set(0, it.r, 0)), sc.set(it.s, it.s, it.s))),
    );
  });
  trees.forEach((list) => {
    meshes.push(
      useInstances(list, geos.trunk, mats.bark, (m, it) => m.compose(v.set(it.x, it.h - 0.1, it.z), q.identity(), sc.set(it.s, 4.5 * it.s, it.s))),
      useInstances(
        list,
        geos.canopy,
        mats.leaf,
        (m, it) => m.compose(v.set(it.x, it.h + 5.6 * it.s, it.z), q.setFromEuler(e.set(0, it.r, 0)), sc.set(3.4 * it.s, 2.6 * it.s, 3.4 * it.s)),
        (c, it) => c.setHSL(0.27 + 0.05 * Math.sin(it.r * 3), 0.45, 0.22 + 0.06 * Math.cos(it.r * 5)),
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
    </>
  );
}

