// Sky, sun and weather for the whole world: the sun moves with the clock (06:00 sunrise in the east, 18:00 sunset),
// night has stars and moonlight and the operator's helmet lamp, rain brings low cloud, closer fog and drops around
// the camera. The shadow-casting sun follows the camera, so every zone gets shadows nearby.
import { Environment, Lightformer, Stars } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { FULL, SHADOW } from './quality';
import { loaded } from '../zones';
import { origin, player, useWorld } from './state';

export function sunDir(time: number, out = new THREE.Vector3()) {
  const a = ((time - 6) / 12) * Math.PI;
  return out.set(Math.cos(a), Math.sin(a), 0.35).normalize();
}
/** 0 at night, 1 in full day, eased through dawn and dusk. */
export const daylight = (time: number) => Math.max(0, Math.min(1, (sunDir(time).y + 0.08) / 0.3));

const DAY_FOG = new THREE.Color('#bccfde');
const DUSK_FOG = new THREE.Color('#d9b08c');
const NIGHT_FOG = new THREE.Color('#070b12');
const RAIN_FOG = new THREE.Color('#8c969d');
const DUSK_SUN = new THREE.Color('#ffb070');

function SunAndFog() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const lamp = useRef<THREE.PointLight>(null);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const tmp = useMemo(() => ({ d: new THREE.Vector3(), f: new THREE.Vector3(), c: new THREE.Color(), r: new THREE.Color(), wet: 0 }), []);
  useLayoutEffect(() => {
    scene.fog = new THREE.Fog(DAY_FOG.clone(), 260, 1500);
    scene.background = DAY_FOG.clone();
  }, [scene]);
  useFrame((_, dt) => {
    const { time, rain, mode, zone } = useWorld.getState();
    tmp.wet += ((rain ? 1 : 0) - tmp.wet) * Math.min(1, dt * 0.5);
    const day = daylight(time);
    const dusk = Math.max(0, 1 - Math.abs(sunDir(time).y) / 0.25) * day;
    sunDir(time, tmp.d);
    const l = sun.current!;
    // shadows around what the camera looks at
    camera.getWorldDirection(tmp.f);
    const tx = camera.position.x + tmp.f.x * 22;
    const tz = camera.position.z + tmp.f.z * 22;
    const dir = tmp.d.y > 0.05 ? tmp.d : tmp.f.set(-0.3, 0.8, 0.4).normalize(); // moon
    l.position.set(tx + dir.x * 90, Math.max(20, dir.y * 90), tz + dir.z * 90);
    l.target.position.set(tx, 0, tz);
    l.target.updateMatrixWorld();
    l.castShadow = !(zone && loaded[zone]?.noShadows);
    l.intensity = (day * 3.0 + (1 - day) * 0.22) * (1 - 0.65 * tmp.wet);
    l.color.set(day > 0.5 ? '#ffe9c8' : '#9fb3ff').lerp(DUSK_SUN, dusk * 0.7);
    hemi.current!.intensity = 0.18 + 0.75 * day;
    hemi.current!.color.set(day > 0.3 ? '#dbe9ff' : '#1c2640');
    const fog = scene.fog as THREE.Fog;
    tmp.c.copy(NIGHT_FOG).lerp(DAY_FOG, day).lerp(DUSK_FOG, dusk * 0.5).lerp(tmp.r.copy(RAIN_FOG).multiplyScalar(0.25 + 0.75 * day), tmp.wet * 0.85);
    fog.color.copy(tmp.c);
    (scene.background as THREE.Color).copy(tmp.c);
    fog.near = 260 - 200 * tmp.wet;
    fog.far = 1500 - 1050 * tmp.wet;
    // helmet lamp at night, only on foot
    const lp = lamp.current!;
    lp.visible = day < 0.3 && mode === 'walk';
    lp.position.set(player.x - origin.x + Math.sin(player.yaw) * 0.3, player.y + 1.9, player.z - origin.z + Math.cos(player.yaw) * 0.3);
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={['#dbe9ff', '#5d5547', 0.9]} />
      <directionalLight
        ref={sun}
        castShadow
        shadow-mapSize={[SHADOW, SHADOW]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-far={260}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <pointLight ref={lamp} intensity={18} distance={22} decay={1.6} color="#fff2d8" />
    </>
  );
}

const ZENITH_DAY = new THREE.Color('#2f6fc4');
const ZENITH_DUSK = new THREE.Color('#34477e');
const ZENITH_NIGHT = new THREE.Color('#010309');
const ZENITH_RAIN = new THREE.Color('#5d666e');
const SUN_GLOW = new THREE.Color('#fff1d0');

/**
 * The sky as a dome around the camera: deep blue overhead fading to the haze at the horizon (the fog's colour, so
 * far hills melt into it), a bright sun with its glow, warm at dusk, near black at night, grey under rain.
 */
function GradientSky() {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const { mesh, u } = useMemo(() => {
    const u = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uGlow: { value: new THREE.Color() },
      uSunAmt: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir;
void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
      fragmentShader: `uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uGlow; uniform float uSunAmt;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.45));
  // below the horizon: the haze
  col = mix(col, uHorizon, smoothstep(0.02, -0.08, d.y));
  float s = max(dot(d, normalize(uSun)), 0.0);
  col += uGlow * (pow(s, 6.0) * 0.28 + pow(s, 60.0) * 0.5) * uSunAmt;
  col = mix(col, uGlow * 3.0, smoothstep(0.9993, 0.9997, s) * uSunAmt);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    return { mesh, u };
  }, []);
  useFrame(() => {
    const { time, rain } = useWorld.getState();
    const day = daylight(time);
    const dusk = Math.max(0, 1 - Math.abs(sunDir(time).y) / 0.25) * day;
    mesh.position.copy(camera.position);
    u.uHorizon.value.copy((scene.fog as THREE.Fog).color);
    u.uZenith.value.copy(ZENITH_NIGHT).lerp(ZENITH_DAY, day).lerp(ZENITH_DUSK, dusk * 0.6);
    if (rain) u.uZenith.value.lerp(ZENITH_RAIN, 0.85).multiplyScalar(0.3 + 0.7 * day);
    sunDir(time, u.uSun.value);
    u.uGlow.value.copy(SUN_GLOW).lerp(DUSK_SUN, dusk);
    u.uSunAmt.value = rain ? 0 : day;
  });
  return <primitive object={mesh} />;
}

function SkyDome() {
  const time = useWorld((s) => Math.round(s.time * 4) / 4);
  const rain = useWorld((s) => s.rain);
  const day = daylight(time);
  return (
    <>
      <GradientSky />
      {day < 0.4 && !rain && <Stars radius={900} depth={100} count={3000} factor={10} fade />}
      <Environment resolution={FULL ? 256 : 128} frames={1} environmentIntensity={0.15 + 0.6 * day}>
        <Lightformer form="rect" intensity={1.6} color="#dceaf7" scale={[60, 20, 1]} position={[0, 18, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <Lightformer form="rect" intensity={1.2} color="#bfd3e6" scale={[40, 6, 1]} position={[0, 4, -30]} />
        <Lightformer form="rect" intensity={0.9} color="#e7dcc8" scale={[40, 6, 1]} position={[0, 4, 30]} rotation={[0, Math.PI, 0]} />
        <Lightformer form="circle" intensity={6} color="#fff0d6" scale={6} position={[30, 14, 22]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.35} color="#6b6458" scale={[80, 80, 1]} position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      </Environment>
    </>
  );
}

const DROPS = 2400;
/** Rain streaks in a ring around the camera (only where the mounted zone has no rain of its own). */
export function RainDrops() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const camera = useThree((s) => s.camera);
  const seeds = useMemo(() => Array.from({ length: DROPS }, () => [Math.random() * Math.PI * 2, 3 + Math.sqrt(Math.random()) * 37, Math.random() * 30]), []);
  const geo = useMemo(() => new THREE.BoxGeometry(0.012, 0.6, 0.012), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame((_, dt) => {
    const mesh = ref.current!;
    for (let i = 0; i < DROPS; i++) {
      const s = seeds[i];
      s[2] -= dt * 14;
      if (s[2] < -4) s[2] += 30;
      m.makeTranslation(camera.position.x + Math.cos(s[0]) * s[1], camera.position.y + s[2] - 8, camera.position.z + Math.sin(s[0]) * s[1]);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geo, undefined, DROPS]} frustumCulled={false}>
      <meshBasicMaterial color="#b9c6d0" transparent opacity={0.45} depthWrite={false} />
    </instancedMesh>
  );
}

export function WorldSky() {
  return (
    <>
      <SunAndFog />
      <SkyDome />
    </>
  );
}
