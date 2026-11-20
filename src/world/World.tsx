// The world inside the canvas: sky, land, the operator and the truck in the shifted world group, the mounted zone at
// the render origin, the follow camera, and the controller that walks, drives, loads zones and runs the clock.
import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { loadZone, loaded } from '../zones';
import { Impostors } from './Impostors';
import { held, onKey } from './input';
import { ZONES, ZONE_LIST, distToZone, type ZoneId } from './map';
import { tickMissions } from './missions';
import { stepPlayer, Operator } from './Player';
import { RainDrops, daylight } from './Sky';
import { groundH } from './physics';
import { look, origin, player, save, toast, truck, useWorld } from './state';
import { Land, hole } from './Land';
import { TruckModel, stepTruck } from './Truck';
import { WorldSky } from './Sky';
import { truckSound } from './sound';

const LOAD = 95; // start loading a zone this close to its footprint
const UNLOAD = 170; // drop it again this far away

let frame = 0;
let switching = false;
let lastSave = 0;
let wasNight: boolean | null = null;

function stationOf(): { zone: ZoneId; id: string } | null {
  const s = useWorld.getState().station;
  if (!s) return null;
  const [zone, id] = s.split(':') as [ZoneId, string];
  return { zone, id };
}

/** Make `id` the mounted zone: move the render origin to it (shifting the camera with it) and cut its hole. */
function mount(id: ZoneId, camera: THREE.Camera) {
  const d = ZONES[id];
  camera.position.x += origin.x - d.x;
  camera.position.z += origin.z - d.z;
  origin.x = d.x;
  origin.z = d.z;
  const [x0, z0, x1, z1] = d.rect;
  hole.value.set(x0 + 0.4, z0 + 0.4, x1 - 0.4, z1 - 0.4);
  const s = useWorld.getState();
  const m = loaded[id]!;
  wasNight = daylight(s.time) < 0.3;
  m.setNight?.(wasNight);
  m.setRain?.(s.rain);
  s.set({ zone: id });
}

function unmount() {
  const s = useWorld.getState();
  if (!s.zone) return;
  loaded[s.zone]?.unmount();
  hole.value.set(1e7, 1e7, 1e7, 1e7);
  s.set({ zone: null });
}

export function enterStation(zone: ZoneId, id: string) {
  const m = loaded[zone];
  if (!m) return;
  m.enter(id);
  held.clear();
  useWorld.getState().set({ mode: 'drive', station: `${zone}:${id}`, prompt: '' });
}

export function leaveStation() {
  const st = stationOf();
  if (!st) return;
  const m = loaded[st.zone];
  const d = ZONES[st.zone];
  const s = m?.stations.find((x) => x.id === st.id);
  m?.leave(st.id);
  if (s) {
    const [x, z, yaw] = s.exit();
    player.x = x + d.x;
    player.z = z + d.z;
    player.yaw = yaw;
    player.y = groundH(player.x, player.z);
  }
  look.yaw = player.yaw;
  look.dist = 5.5;
  useWorld.getState().set({ mode: 'walk', station: null });
}

function enterTruck() {
  useWorld.getState().set({ mode: 'truck', prompt: '' });
  look.dist = 15;
  look.pitch = 0.3;
  look.yaw = truck.yaw;
}

function leaveTruck() {
  if (Math.abs(truck.v) > 1.5) {
    toast('Hentikan truk dulu sebelum turun.');
    return;
  }
  truck.v = 0;
  const lx = Math.cos(truck.yaw);
  const lz = -Math.sin(truck.yaw);
  player.x = truck.x + lx * 2.2 + Math.sin(truck.yaw) * 3;
  player.z = truck.z + lz * 2.2 + Math.cos(truck.yaw) * 3;
  player.yaw = truck.yaw + Math.PI / 2;
  player.y = groundH(player.x, player.z);
  look.yaw = player.yaw;
  look.dist = 5.5;
  useWorld.getState().set({ mode: 'walk' });
}

/** The nearest thing to use within reach: a zone station or the truck. */
function nearest(): { label: string; act: () => void } | null {
  const s = useWorld.getState();
  if (Math.hypot(player.x - truck.x, player.z - truck.z) < 4.6) return { label: truck.cargo ? 'Naik truk (genset di bak)' : 'Naik truk', act: enterTruck };
  if (!s.zone) return null;
  const m = loaded[s.zone];
  const d = ZONES[s.zone];
  for (const st of m?.stations ?? []) {
    const [x, z] = st.pos();
    if (Math.hypot(player.x - x - d.x, player.z - z - d.z) < st.r) {
      const zone = s.zone;
      return { label: st.label, act: () => enterStation(zone, st.id) };
    }
  }
  return null;
}

function Controller() {
  const camera = useThree((s) => s.camera);
  const shift = useRef<THREE.Group | null>(null);
  useEffect(() => {
    onKey('e', () => {
      const s = useWorld.getState();
      if (s.map || s.menu) return;
      if (s.mode === 'truck') leaveTruck();
      else if (s.mode === 'walk') nearest()?.act();
    });
    onKey('escape', () => {
      const s = useWorld.getState();
      if (s.map || s.menu || s.missions) s.set({ map: false, menu: false, missions: false });
      else if (s.mode === 'drive') leaveStation();
      else if (s.mode === 'truck') leaveTruck();
    });
    onKey('m', () => {
      const s = useWorld.getState();
      if (s.mode !== 'drive') s.set({ map: !s.map });
    });
  }, []);
  useFrame((state, raw) => {
    const dt = Math.min(raw, 0.05);
    frame++;
    const s = useWorld.getState();
    if (!shift.current) shift.current = state.scene.getObjectByName('world-shift') as THREE.Group;
    // the clock: one game hour per real minute
    if (s.timeRun && s.started) useWorld.setState({ time: (s.time + dt / 60) % 24 });
    const frozen = s.map || s.menu || !s.started;
    if (s.mode === 'walk' && !frozen) stepPlayer(dt, frame);
    stepTruck(dt, frame, s.mode === 'truck' && !frozen);
    if (s.mode === 'truck') {
      player.x = truck.x;
      player.z = truck.z;
      player.y = truck.y;
    } else if (s.mode === 'drive') {
      const st = stationOf();
      const m = st && loaded[st.zone];
      const p = m?.stations.find((x) => x.id === st!.id)?.pos();
      if (st && p) {
        player.x = p[0] + ZONES[st.zone].x;
        player.z = p[1] + ZONES[st.zone].z;
      }
    }
    truckSound(s.mode === 'truck', Math.hypot(camera.position.x - truck.x + origin.x, camera.position.y - truck.y - 1.5, camera.position.z - truck.z + origin.z));

    // zones: keep the current one while near, otherwise load the nearest within reach
    if (!switching && s.mode !== 'drive') {
      const cur = s.zone;
      const curD = cur ? distToZone(ZONES[cur], player.x, player.z) : Infinity;
      let best: ZoneId | null = null;
      let bestD = LOAD;
      for (const d of ZONE_LIST) {
        const dd = distToZone(d, player.x, player.z);
        if (dd < bestD) {
          bestD = dd;
          best = d.id;
        }
      }
      if (cur && curD > UNLOAD && (!best || best === cur)) unmount();
      else if (best && best !== cur && (curD > LOAD || bestD < curD - 40)) {
        const id = best;
        switching = true;
        s.set({ loading: true });
        loadZone(id)
          .then((m) => {
            if (!m) return;
            unmount();
            mount(id, camera);
          })
          .catch((err) => {
            console.error(err);
            toast(`Gagal memuat ${ZONES[id].name}.`);
          })
          .finally(() => {
            switching = false;
            // let the new zone compile its shaders before hiding the notice
            setTimeout(() => useWorld.getState().set({ loading: false }), 900);
          });
      }
    }
    if (shift.current) shift.current.position.set(-origin.x, 0, -origin.z);

    // what can be used here
    if (s.mode === 'walk') {
      const n = nearest();
      const p = n ? n.label : '';
      if (p !== s.prompt) s.set({ prompt: p });
    }
    // the mounted zone switches its own night lighting when the world's clock crosses dusk or dawn
    const night = daylight(s.time) < 0.3;
    if (night !== wasNight && s.zone) {
      wasNight = night;
      loaded[s.zone]?.setNight?.(night);
    }
    tickMissions(dt);
    if (performance.now() - lastSave > 5000) {
      lastSave = performance.now();
      if (s.started) save();
    }
  }, -1);
  return null;
}

/** Third-person camera for walking and the truck: drag to look around, wheel to zoom. */
function FollowCam() {
  const camera = useThree((s) => s.camera as THREE.PerspectiveCamera);
  const gl = useThree((s) => s.gl);
  const mode = useWorld((s) => s.mode);
  const tmp = useRef({ t: new THREE.Vector3(), want: new THREE.Vector3(), dragAt: 0 });
  useEffect(() => {
    camera.fov = 55;
    camera.updateProjectionMatrix();
    const el = gl.domElement;
    let down = false;
    const dn = (e: PointerEvent) => {
      down = true;
      el.setPointerCapture?.(e.pointerId);
    };
    const up = () => (down = false);
    const mv = (e: PointerEvent) => {
      if (!down) return;
      look.yaw -= e.movementX * 0.005;
      look.pitch = Math.max(-0.25, Math.min(1.3, look.pitch + e.movementY * 0.004));
      tmp.current.dragAt = performance.now();
    };
    const wheel = (e: WheelEvent) => {
      const [a, b] = useWorld.getState().mode === 'truck' ? [8, 40] : [2.2, 14];
      look.dist = Math.max(a, Math.min(b, look.dist * (1 + Math.sign(e.deltaY) * 0.1)));
    };
    el.addEventListener('pointerdown', dn);
    addEventListener('pointerup', up);
    el.addEventListener('pointermove', mv);
    el.addEventListener('wheel', wheel, { passive: true });
    return () => {
      el.removeEventListener('pointerdown', dn);
      removeEventListener('pointerup', up);
      el.removeEventListener('pointermove', mv);
      el.removeEventListener('wheel', wheel);
    };
  }, [camera, gl, mode]);
  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    const c = tmp.current;
    const inTruck = mode === 'truck';
    if (inTruck) {
      c.t.set(truck.x, truck.y + 2.6, truck.z);
      // swing back behind the truck a moment after the mouse lets go
      if (performance.now() - c.dragAt > 2500 && Math.abs(truck.v) > 1) {
        const d = Math.atan2(Math.sin(truck.yaw - look.yaw), Math.cos(truck.yaw - look.yaw));
        look.yaw += d * Math.min(1, dt * 1.5);
      }
    } else c.t.set(player.x, player.y + 1.55, player.z);
    const h = Math.cos(look.pitch) * look.dist;
    c.want.set(c.t.x - Math.sin(look.yaw) * h, c.t.y + Math.sin(look.pitch) * look.dist, c.t.z - Math.cos(look.yaw) * h);
    const g = groundH(c.want.x, c.want.z) + 0.4;
    if (c.want.y < g) c.want.y = g;
    c.want.x -= origin.x;
    c.want.z -= origin.z;
    camera.position.lerp(c.want, 1 - Math.exp(-dt * (inTruck ? 6 : 12)));
    camera.lookAt(c.t.x - origin.x, c.t.y, c.t.z - origin.z);
  });
  return null;
}

/** The mounted zone, at the render origin. */
function ZoneScene() {
  const zone = useWorld((s) => s.zone);
  const mode = useWorld((s) => s.mode);
  const station = useWorld((s) => s.station);
  if (!zone) return null;
  const m = loaded[zone];
  if (!m) return null;
  const st = station && station.startsWith(`${zone}:`) ? station.slice(zone.length + 1) : null;
  return (
    <Suspense fallback={null}>
      <m.Content key={zone} drive={mode === 'drive' && !!st} station={st} />
    </Suspense>
  );
}

function WorldRain() {
  const rain = useWorld((s) => s.rain);
  const zone = useWorld((s) => s.zone);
  const own = zone ? !!loaded[zone]?.setRain : false;
  return rain && !own ? <RainDrops /> : null;
}

/** Development: the renderer and scene reachable from the console and headless checks. */
function DevInfo() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(globalThis, { gl, scene });
  }, [gl, scene]);
  return null;
}

export function WorldScene() {
  const mode = useWorld((s) => s.mode);
  return (
    <>
      <WorldSky />
      <group name="world-shift">
        <Land />
        <Impostors />
        <Operator visible={mode === 'walk'} />
        <TruckModel />
      </group>
      <ZoneScene />
      {mode !== 'drive' && <FollowCam />}
      <WorldRain />
      <Controller />
      <DevInfo />
    </>
  );
}
