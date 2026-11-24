// Grass tufts all around the camera, done on the GPU: a fixed set of tufts in a 64 m square that wraps with the camera
// (each tuft keeps its place on the ground as the square moves, so nothing pops), standing on the terrain's height
// and tinted with its colour from two small maps made with the terrain, thinned out where the ground is road, sand
// or a zone, fading out towards the edge, and swaying in the wind. One draw call, no work per frame on the CPU.
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { origin } from './state';
import { canvasTexture } from './util';

/** Height + grass amount (RG, half float) and ground colour (RGBA8) over the map, filled in by the terrain. */
export const groundMaps: { height: THREE.DataTexture | null; color: THREE.DataTexture | null; min: THREE.Vector2; size: THREE.Vector2 } = {
  height: null,
  color: null,
  min: new THREE.Vector2(),
  size: new THREE.Vector2(1, 1),
};

const PATCH = 64;
const SPACING = 0.5;

function tuftGeometry() {
  // three crossed blades-cards, 0.55 m wide, 0.5 m tall; normals up, so a tuft lights like the ground under it
  const g = new THREE.BufferGeometry();
  const pos: number[] = [];
  const uv: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI;
    const cx = Math.cos(a) * 0.275;
    const cz = Math.sin(a) * 0.275;
    const b = pos.length / 3;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx, 0.5, cz, -cx, 0.5, -cz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let i = 0; i < 4; i++) nrm.push(0, 1, 0);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

export function Grass() {
  const camera = useThree((s) => s.camera);
  const { mesh, uniforms } = useMemo(() => {
    const base = tuftGeometry();
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    for (const k of ['position', 'uv', 'normal']) geo.setAttribute(k, base.getAttribute(k));
    // a jittered grid over the patch: x, z offset and a seed per tuft
    const n = Math.floor(PATCH / SPACING);
    const off = new Float32Array(n * n * 3);
    let i = 0;
    for (let a = 0; a < n; a++)
      for (let b = 0; b < n; b++) {
        off[i++] = (a + Math.random()) * SPACING;
        off[i++] = (b + Math.random()) * SPACING;
        off[i++] = Math.random();
      }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
    geo.instanceCount = n * n;
    const tex = canvasTexture(128, 128, (g) => {
      g.clearRect(0, 0, 128, 128);
      for (let k = 0; k < 46; k++) {
        const x = 6 + Math.random() * 116;
        const h = 60 + Math.random() * 66;
        const lean = (Math.random() - 0.5) * 34;
        const w = 2.2 + Math.random() * 2.6;
        const l = 26 + Math.random() * 34;
        g.fillStyle = `hsl(${70 + Math.random() * 22}, ${22 + Math.random() * 20}%, ${l}%)`;
        g.beginPath();
        g.moveTo(x - w, 128);
        g.quadraticCurveTo(x + lean * 0.4, 128 - h * 0.6, x + lean, 128 - h);
        g.quadraticCurveTo(x + lean * 0.4 + w * 0.3, 128 - h * 0.6, x + w, 128);
        g.fill();
      }
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const uniforms = {
      uCenter: { value: new THREE.Vector2() },
      uCam: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uHeight: { value: groundMaps.height },
      uColor: { value: groundMaps.color },
      uMin: { value: groundMaps.min },
      uSize: { value: groundMaps.size },
    };
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.95 });
    mat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, uniforms);
      s.vertexShader = s.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute vec3 aOff;
uniform vec2 uCenter; uniform vec2 uCam; uniform float uTime;
uniform sampler2D uHeight; uniform sampler2D uColor; uniform vec2 uMin; uniform vec2 uSize;
varying vec3 vTint;`,
        )
        .replace(
          '#include <begin_vertex>',
          `const float P = ${PATCH.toFixed(1)};
vec2 wp = uCenter + mod(aOff.xy - uCenter + 0.5 * P, P) - 0.5 * P;
vec2 tuv = (wp - uMin) / uSize;
vec4 hg = texture2D(uHeight, tuv);
float d = length(wp - uCam);
float s = hg.g * smoothstep(0.5 * P, 0.5 * P - 14.0, d) * (0.65 + 0.7 * aOff.z);
float r = aOff.z * 6.2832;
vec3 transformed = vec3(position.x * cos(r) - position.z * sin(r), position.y, position.x * sin(r) + position.z * cos(r)) * s;
transformed.xz += vec2(sin(uTime * 1.6 + wp.x * 0.37 + wp.y * 0.21), cos(uTime * 1.3 + wp.y * 0.31)) * 0.07 * uv.y * s;
transformed += vec3(wp.x, hg.r - 0.03, wp.y);
vTint = texture2D(uColor, tuv).rgb * (0.82 + 0.36 * aOff.z);`,
        );
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTint;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= vTint * 1.45;')
        // both sides of a blade face the sky: no dark backs
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    return { mesh, uniforms };
  }, []);
  useFrame((_, dt) => {
    const cx = camera.position.x + origin.x;
    const cz = camera.position.z + origin.z;
    uniforms.uCam.value.set(cx, cz);
    uniforms.uCenter.value.set(cx, cz);
    uniforms.uTime.value += dt;
    uniforms.uHeight.value = groundMaps.height;
    uniforms.uColor.value = groundMaps.color;
    // only near the ground: from high above, tufts would be pixels
    mesh.visible = !!groundMaps.height && camera.position.y < 60;
  });
  return <primitive object={mesh} />;
}
