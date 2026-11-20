// The delivery truck that links the zones: a 6×4 flatbed with a day cab. Simple car physics (bicycle model) that
// follows the ground and stops against walls. W/S gas and brake (S reverses once stopped), A/D steer, Space handbrake,
// H horn. During the genset mission the genset rides on the deck.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { axis, held } from './input';
import { collide, groundH } from './physics';
import { daylight } from './Sky';
import { truck, useWorld } from './state';
import { SEA_Y } from './terrain';
import { canvasTexture } from './util';

const WB = 4.6; // wheelbase, m
const VMAX = 22; // 80 km/h
const HALF = { x: 1.25, z: 4.6 };

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

function Wheel({ x, z, dual }: { x: number; z: number; dual?: boolean }) {
  return (
    <group position={[x, 0.52, z]}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.52, 0.52, dual ? 0.62 : 0.32, 18]} />
        <meshStandardMaterial color="#1c1c1c" roughness={0.9} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[x > 0 ? (dual ? 0.32 : 0.17) : dual ? -0.32 : -0.17, 0, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.02, 12]} />
        <meshStandardMaterial color="#c9ccd0" metalness={0.7} roughness={0.35} />
      </mesh>
    </group>
  );
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
  const door = useMemo(
    () =>
      canvasTexture(256, 128, (g) => {
        g.fillStyle = '#f4f4f0';
        g.fillRect(0, 0, 256, 128);
        g.fillStyle = '#e05a1a';
        g.fillRect(0, 84, 256, 14);
        g.fillStyle = '#1d3a5c';
        g.font = 'bold 34px sans-serif';
        g.textAlign = 'center';
        g.fillText('TRAKNUS', 128, 62);
      }),
    [],
  );
  const cargo = useRef<THREE.Group>(null);
  const head = useRef<THREE.SpotLight>(null);
  const aim = useRef<THREE.Object3D>(null);
  // the beam points at a spot ahead of the truck that moves with it
  useEffect(() => {
    head.current!.target = aim.current!;
  }, []);
  const tail = useMemo(() => new THREE.MeshStandardMaterial({ color: '#5a0d0d', emissive: '#ff2a1a', emissiveIntensity: 0.2 }), []);
  useFrame(() => {
    // headlights from dusk to dawn while someone drives; brake lights glow when braking
    const s = useWorld.getState();
    const dark = daylight(s.time) < 0.35;
    head.current!.intensity = dark && s.mode === 'truck' ? 260 : 0;
    tail.emissiveIntensity = truck.brake ? 2.2 : dark ? 0.6 : 0.1;
    const g = root.current!;
    g.position.set(truck.x, truck.y, truck.z);
    g.rotation.set(0, 0, 0);
    g.rotateY(truck.yaw);
    g.rotateX(-truck.pitch);
    g.rotateZ(truck.roll);
    // each Wheel group sits at its hub: steer about y first, then spin about the axle
    for (const w of wheels.current) {
      const hub = w.children[0];
      hub.rotation.order = 'YXZ';
      hub.rotation.x = truck.wheel;
      hub.rotation.y = front.current.includes(w) ? truck.steer : 0;
    }
    cargo.current!.visible = truck.cargo;
  });
  const reg = (o: THREE.Object3D | null, isFront: boolean) => {
    if (!o) return;
    if (!wheels.current.includes(o)) wheels.current.push(o);
    if (isFront && !front.current.includes(o)) front.current.push(o);
  };
  const white = <meshStandardMaterial color="#f4f4f0" roughness={0.45} metalness={0.15} />;
  return (
    <group ref={root}>
      {/* chassis rails and deck */}
      <mesh position={[0, 0.95, -0.6]} castShadow>
        <boxGeometry args={[0.9, 0.28, 8.6]} />
        <meshStandardMaterial color="#202224" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.3, -1.6]} castShadow receiveShadow>
        <boxGeometry args={[2.45, 0.16, 6.6]} />
        <meshStandardMaterial color="#5a4632" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.26, -1.6]}>
        <boxGeometry args={[2.5, 0.12, 6.7]} />
        <meshStandardMaterial color="#e05a1a" roughness={0.6} />
      </mesh>
      {/* day cab */}
      <group position={[0, 0, 3.15]}>
        <mesh position={[0, 1.95, 0]} castShadow>
          <boxGeometry args={[2.4, 2.1, 1.9]} />
          {white}
        </mesh>
        <mesh position={[0, 2.25, 0.96]}>
          <planeGeometry args={[2.2, 0.95]} />
          <meshStandardMaterial color="#1c2a36" roughness={0.1} metalness={0.6} />
        </mesh>
        <mesh position={[0, 1.12, 1.0]} castShadow>
          <boxGeometry args={[2.42, 0.4, 0.2]} />
          <meshStandardMaterial color="#3a3c3f" roughness={0.6} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 1.205, 1.75, 0]} rotation={[0, (s * Math.PI) / 2, 0]}>
            <planeGeometry args={[1.6, 0.8]} />
            <meshStandardMaterial map={door} roughness={0.5} />
          </mesh>
        ))}
        {[-0.85, 0.85].map((x) => (
          <mesh key={x} position={[x, 1.38, 1.02]}>
            <boxGeometry args={[0.36, 0.16, 0.05]} />
            <meshStandardMaterial color="#fff6dc" emissive="#fff1c4" emissiveIntensity={0.4} />
          </mesh>
        ))}
      </group>
      <group ref={(o) => reg(o, true)}>
        <Wheel x={-1.05} z={3.3} />
      </group>
      <group ref={(o) => reg(o, true)}>
        <Wheel x={1.05} z={3.3} />
      </group>
      {[-1.6, -3.0].flatMap((z) =>
        [-0.95, 0.95].map((x) => (
          <group key={`${x}${z}`} ref={(o) => reg(o, false)}>
            <Wheel x={x} z={z} dual />
          </group>
        )),
      )}
      <group ref={cargo}>
        <DeckGenset />
      </group>
      {/* cab back window, exhaust stack, mudflaps, tail lights, headlight beam */}
      <mesh position={[0, 2.35, 2.19]}>
        <planeGeometry args={[1.6, 0.6]} />
        <meshStandardMaterial color="#1c2a36" roughness={0.1} metalness={0.6} side={THREE.BackSide} />
      </mesh>
      <mesh position={[-1.05, 2.6, 2.1]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 2.2, 10]} />
        <meshStandardMaterial color="#9aa0a6" metalness={0.8} roughness={0.3} />
      </mesh>
      {[-0.95, 0.95].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.55, -3.75]}>
            <boxGeometry args={[0.6, 0.6, 0.03]} />
            <meshStandardMaterial color="#151515" roughness={0.9} />
          </mesh>
          <mesh position={[x * 1.1, 1.05, -4.92]} material={tail}>
            <boxGeometry args={[0.3, 0.14, 0.05]} />
          </mesh>
        </group>
      ))}
      <spotLight ref={head} position={[0, 1.4, 4.3]} angle={0.55} penumbra={0.5} distance={70} decay={1.4} color="#fff3d6" />
      <object3D ref={aim} position={[0, 0, 30]} />
    </group>
  );
}
