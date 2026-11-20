// The delivery truck that links the zones: a 6×4 flatbed with a day cab. Simple car physics (bicycle model) that
// follows the ground and stops against walls. W/S gas and brake (S reverses once stopped), A/D steer, Space handbrake,
// H horn. During the genset mission the genset rides on the deck.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { axis, held } from './input';
import { collide, groundH } from './physics';
import { daylight } from './Sky';
import type { ZoneModule } from '../zones/types';
import { ZONES, distToZone, type ZoneId } from './map';
import { truck, useWorld } from './state';
import { SEA_Y } from './terrain';
import { KitMesh, TRAKNUS, TruckWheel, buildCab, buildChassis, buildFlatbed } from '@forklift/scene/truckKit';

const WB = 4.6; // wheelbase, m
const VMAX = 22; // 80 km/h
const HALF = { x: 1.25, z: 4.6 };
/** Front axle and the tandem axles (truck frame, z forward from the centre). */
const AXLE_F = 3.3;
const REAR = [-4.9, -6.3];

/** The truck's solid boxes (truck frame: x across, z forward from the centre): cab, deck, headboard, deck load. */
const BOXES = [
  { x: 0, z: 3.45, hx: 1.25, hz: 1.15, y0: 0.15, y1: 3.2 },
  { x: 0, z: -1.6, hx: 1.25, hz: 3.3, y0: 0.15, y1: 1.4 },
  { x: 0, z: 1.6, hx: 1.25, hz: 0.12, y0: 1.3, y1: 2.95 },
];
const LOAD = { x: 0, z: -1.6, hx: 1.05, hz: 3.1, y0: 1.38, y1: 3.8 };

/**
 * Hand the truck to the mounted zone's simulator as solid boxes in its own coordinates, so its machine and what it
 * carries stop against the truck instead of passing through it. Empty when the truck is away from the zone.
 */
export function truckSolids(m: ZoneModule | null | undefined, id: ZoneId | null) {
  const list = m?.solids;
  if (!list || !id) return;
  list.length = 0;
  const d = ZONES[id];
  if (distToZone(d, truck.x, truck.z) > 15) return;
  const s = Math.sin(truck.yaw);
  const c = Math.cos(truck.yaw);
  for (const b of truck.cargo ? [...BOXES, LOAD] : BOXES)
    list.push({
      id: 'truk',
      x: truck.x - d.x + b.x * c + b.z * s,
      z: truck.z - d.z - b.x * s + b.z * c,
      hx: b.hx,
      hz: b.hz,
      yaw: truck.yaw,
      y0: truck.y + b.y0,
      y1: truck.y + b.y1,
    });
}

export function stepTruck(dt: number, frame: number, driving: boolean) {
  const t = truck;
  const gas = driving ? Math.max(0, axis(['s', 'arrowdown'], ['w', 'arrowup'])) : 0;
  const back = driving ? Math.max(0, axis(['w', 'arrowup'], ['s', 'arrowdown'])) : 0;
  const steerIn = driving ? axis(['d', 'arrowright'], ['a', 'arrowleft']) : 0;
  const hand = !driving || held.has(' ');
  t.horn = driving && held.has('h');
  // S brakes while rolling forward, reverses once (nearly) stopped
  let acc = 0;
  if (gas) acc = t.v < -0.3 ? 7 : 2.4 * (1 - Math.max(0, t.v) / VMAX);
  else if (back) acc = t.v > 0.3 ? -7 : -1.6 * (1 + t.v / 6);
  if (hand) acc = -Math.sign(t.v) * Math.min(Math.abs(t.v) / dt, 8);
  acc -= t.v * 0.04 + Math.sign(t.v) * 0.15; // drag and rolling resistance
  const nv = t.v + acc * dt;
  t.v = !gas && !back && Math.sign(nv) !== Math.sign(t.v) ? 0 : nv;
  t.gas = gas;
  t.brake = back && t.v > 0 ? 1 : hand ? 1 : 0;
  // steering: slower and smaller at speed
  const maxSteer = 0.6 / (1 + Math.abs(t.v) / 9);
  t.steer += (steerIn * maxSteer - t.steer) * Math.min(1, dt * 3);
  t.yaw += (t.v / WB) * Math.tan(t.steer) * dt;
  const ox = t.x;
  const oz = t.z;
  t.x += Math.sin(t.yaw) * t.v * dt;
  t.z += Math.cos(t.yaw) * t.v * dt;
  // walls: test a few circles along the body
  const fx = Math.sin(t.yaw);
  const fz = Math.cos(t.yaw);
  let hit = false;
  for (const k of [-3.4, -1.2, 1.2, 3.4]) {
    const p = { x: t.x + fx * k, z: t.z + fz * k };
    if (collide(p, HALF.x, t.y, 3, 0.35, frame)) hit = true;
  }
  if (hit || groundH(t.x, t.z) < SEA_Y + 0.3) {
    t.x = ox;
    t.z = oz;
    t.v *= -0.15;
  }
  // stand on the ground: front and rear axle heights give the pitch, the sides the roll
  const hf = groundH(t.x + fx * 3, t.z + fz * 3);
  const hr = groundH(t.x - fx * 3, t.z - fz * 3);
  const hl = groundH(t.x + fz * 1.1, t.z - fx * 1.1);
  const hrt = groundH(t.x - fz * 1.1, t.z + fx * 1.1);
  t.y = (hf + hr + hl + hrt) / 4;
  t.pitch = Math.atan2(hf - hr, 6);
  t.roll = Math.atan2(hl - hrt, 2.2);
  t.wheel += (t.v / 0.52) * dt;
}

/** The genset on the deck (outline of the open 2250 kVA set on its skid). */
function DeckGenset() {
  return (
    <group position={[0, 1.42, -1.6]}>
      <mesh position={[0, 0.08, 0]} castShadow>
        <boxGeometry args={[2.1, 0.16, 6.2]} />
        <meshStandardMaterial color="#2d2f31" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.15, 1.0]} castShadow>
        <boxGeometry args={[1.7, 1.9, 3.4]} />
        <meshStandardMaterial color="#e9b00c" roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[0, 1.2, -1.75]} castShadow>
        <boxGeometry args={[1.9, 2.0, 2.1]} />
        <meshStandardMaterial color="#2f4f7a" roughness={0.45} metalness={0.3} />
      </mesh>
      <mesh position={[0, 1.3, 2.95]} castShadow>
        <boxGeometry args={[2.0, 2.3, 0.4]} />
        <meshStandardMaterial color="#3a3d40" roughness={0.6} />
      </mesh>
      {[-2.6, 0, 2.6].map((z) => (
        <mesh key={z} position={[0, 1.3, z]}>
          <boxGeometry args={[2.16, 0.05, 0.08]} />
          <meshStandardMaterial color="#e05a1a" />
        </mesh>
      ))}
    </group>
  );
}

export function TruckModel() {
  const root = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Object3D[]>([]);
  const front = useRef<THREE.Object3D[]>([]);
  const cargo = useRef<THREE.Group>(null);
  const head = useRef<THREE.SpotLight>(null);
  const aim = useRef<THREE.Object3D>(null);
  // the beam points at a spot ahead of the truck that moves with it
  useEffect(() => {
    head.current!.target = aim.current!;
  }, []);
  // this truck's own lamp lenses (the shared kit lamps stay as they are)
  const lamps = useMemo(
    () => ({
      head: new THREE.MeshStandardMaterial({ color: '#fbfbf6', metalness: 0.2, roughness: 0.08, emissive: '#fff3d6', emissiveIntensity: 0.25 }),
      tail: new THREE.MeshStandardMaterial({ color: '#6a0b0b', metalness: 0.1, roughness: 0.25, emissive: '#ff2a1a', emissiveIntensity: 0.2 }),
    }),
    [],
  );
  useFrame(() => {
    // headlights from dusk to dawn while someone drives; brake lights glow when braking
    const s = useWorld.getState();
    const dark = daylight(s.time) < 0.35;
    const on = dark && s.mode === 'truck';
    head.current!.intensity = on ? 260 : 0;
    lamps.head.emissiveIntensity = on ? 3 : 0.25;
    lamps.tail.emissiveIntensity = truck.brake ? 2.2 : dark ? 0.6 : 0.1;
    const g = root.current!;
    g.position.set(truck.x, truck.y, truck.z);
    g.rotation.set(0, 0, 0);
    g.rotateY(truck.yaw);
    g.rotateX(-truck.pitch);
    g.rotateZ(truck.roll);
    // each wheel group sits at its hub: steer about y first, then spin about the axle
    for (const w of wheels.current) {
      w.rotation.order = 'YXZ';
      w.rotation.x = truck.wheel;
      w.rotation.y = front.current.includes(w) ? truck.steer : 0;
    }
    cargo.current!.visible = truck.cargo;
  });
  const reg = (o: THREE.Object3D | null, isFront: boolean) => {
    if (!o) return;
    if (!wheels.current.includes(o)) wheels.current.push(o);
    if (isFront && !front.current.includes(o)) front.current.push(o);
  };
  return (
    <group ref={root}>
      {/* UD-class 6×4 cab-over with a flatbed; the kit's origin is under the front axle */}
      <group position={[0, 0, AXLE_F]}>
        <KitMesh
          build={(k) => {
            buildCab(k, TRAKNUS, { head: lamps.head });
            buildChassis(k, { end: -8.15, rear: REAR, fuelZ: -2.3, batteryZ: -2.1, sideGuard: true });
            buildFlatbed(k, { z0: -1.6, z1: -8.2, firstAxle: REAR[0], lastAxle: REAR[1], lv: TRAKNUS, tail: lamps.tail });
          }}
        />
        {([1, -1] as const).map((s) => (
          <group key={s} position={[s * 1.03, 0.52, 0]} ref={(o) => reg(o, true)}>
            <TruckWheel side={s} />
          </group>
        ))}
        {REAR.flatMap((z) =>
          ([1, -1] as const).map((s) => (
            <group key={`${z}${s}`} position={[s * 0.93, 0.52, z]} ref={(o) => reg(o, false)}>
              <TruckWheel dual side={s} />
            </group>
          )),
        )}
      </group>
      <group ref={cargo}>
        <DeckGenset />
      </group>
      <spotLight ref={head} position={[0, 1.0, 4.6]} angle={0.55} penumbra={0.5} distance={70} decay={1.4} color="#fff3d6" />
      <object3D ref={aim} position={[0, 0, 30]} />
    </group>
  );
}
