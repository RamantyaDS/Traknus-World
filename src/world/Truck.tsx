// The delivery truck that links the zones: a 6×4 flatbed with a day cab. Simple car physics (bicycle model) that
// follows the ground and stops against walls. W/S gas and brake (S reverses once stopped), A/D steer, Space handbrake,
// H horn. During the genset mission the genset rides on the deck.
import { useFrame } from '@react-three/fiber';
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { axis, held } from './input';
import { TRUCK_BOXES, collide, groundH } from './physics';
import { daylight } from './Sky';
import type { ZoneModule } from '../zones/types';
import { ZONES, distToZone, type ZoneId } from './map';
import { toast, truck, useWorld } from './state';
import { SEA_Y } from './terrain';
import { KitMesh, TM, TRAKNUS, TruckWheel, buildCab, buildChassis, buildFlatbed } from '@forklift/scene/truckKit';

const WB = 4.6; // wheelbase, m
const VMAX = 22; // 80 km/h
const HALF = { x: 1.25, z: 4.6 };
/** Front axle and the tandem axles (truck frame, z forward from the centre). */
const AXLE_F = 3.3;
const REAR = [-4.9, -6.3];

/** The truck's solid boxes (truck frame: x across, z forward from the centre): cab, deck, headboard, deck load. */
const DECK_TOP = 1.38;
const BOXES = TRUCK_BOXES;
/** The deck as a surface to set a load on (top at DECK_TOP, the headboard ahead of it). */
const DECK = { x: 0, z: -1.65, hx: 1.2, hz: 3.15, y0: DECK_TOP - 0.2, y1: DECK_TOP };
/**
 * Two timber bearers across the deck, under the ends of a 5.9 m set: the load sits on them, so forks can be drawn
 * out underneath, and a crane sets it down level on both.
 */
const TIMBER_Z = [0.95, -4.25];
const TIMBERS = TIMBER_Z.map((z) => ({ x: 0, z, hx: 1.2, hz: 0.15, y0: DECK_TOP, y1: DECK_TOP + 0.2 }));
const LOAD = { x: 0, z: -1.65, hx: 1.1, hz: 2.95, y0: DECK_TOP + 0.2, y1: 3.8 };

/** Is the genset on the deck drawn by the mounted zone's simulator (so the truck leaves its own copy out)? */
export const deckView = { byZone: false };

/**
 * Hand the truck to the mounted zone's simulator: solid boxes (its machine and what it carries stop against the
 * truck), the deck and timbers as surfaces to set a load on, and the genset on the deck, which the zone takes over
 * while the truck is there, so a forklift or crane can lift it off, or set one down that then rides away. All in the
 * zone's own coordinates; nothing when the truck is away from the zone.
 */
export function truckSolids(m: ZoneModule | null | undefined, id: ZoneId | null) {
  const list = m?.solids;
  if (!m || !list || !id) {
    deckView.byZone = false;
    return;
  }
  list.length = 0;
  if (m.supports) m.supports.length = 0;
  const d = ZONES[id];
  const near = distToZone(d, truck.x, truck.z) <= 15;
  const s = Math.sin(truck.yaw);
  const c = Math.cos(truck.yaw);
  const local = (b: typeof LOAD) => ({
    id: 'truk',
    x: truck.x - d.x + b.x * c + b.z * s,
    z: truck.z - d.z - b.x * s + b.z * c,
    hx: b.hx,
    hz: b.hz,
    yaw: truck.yaw,
    y0: truck.y + b.y0,
    y1: truck.y + b.y1,
  });
  if (near && m.supports) m.supports.push(local(DECK), ...TIMBERS.map(local));
  if (m.cargo) {
    const top = local(TIMBERS[0]).y1;
    const deck = near ? { ...local(DECK), top, loadYaw: truck.yaw - Math.PI / 2 } : null;
    const had = truck.cargo;
    const r = m.cargo(deck, had);
    truck.cargo = r.has;
    deckView.byZone = r.shown;
    if (r.has && !had) toast('Genset sudah di bak truk Traknus — truk siap jalan.', 6000);
    if (!r.has && had) toast('Genset terangkat dari bak truk.', 4000);
  } else deckView.byZone = false;
  if (!near) return;
  // a load the zone does not draw is the truck's own: solid too
  for (const b of truck.cargo && !deckView.byZone ? [...BOXES, LOAD] : BOXES) list.push(local(b));
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

/** The genset on the deck (the forklift simulator's model), fetched when first needed. */
const DeckGenset = lazy(() => import('./DeckGenset'));

export function TruckModel() {
  const root = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Object3D[]>([]);
  const front = useRef<THREE.Object3D[]>([]);
  const cargo = useRef<THREE.Group>(null);
  const [hasCargo, setHasCargo] = useState(false);
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
    cargo.current!.visible = truck.cargo && !deckView.byZone;
    if (truck.cargo && !hasCargo) setHasCargo(true);
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
            for (const z of TIMBER_Z) k.box(TM.wood2, [2.3, 0.2, 0.3], [0, DECK_TOP + 0.1, z - AXLE_F]);
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
        {hasCargo && (
          <Suspense fallback={null}>
            <DeckGenset y={DECK_TOP + 0.2} z={-1.65} />
          </Suspense>
        )}
      </group>
      <spotLight ref={head} position={[0, 1.0, 4.6]} angle={0.55} penumbra={0.5} distance={70} decay={1.4} color="#fff3d6" />
      <object3D ref={aim} position={[0, 0, 30]} />
    </group>
  );
}
