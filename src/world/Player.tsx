// The operator on foot: coverall, hi-vis vest and helmet, a simple walk cycle. WASD relative to the camera, Shift to
// run, Space to hop; steps over low things, walks around solid ones, follows the ground.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { axis, held } from './input';
import { collide, groundH } from './physics';
import { look, player, useWorld } from './state';
import { SEA_Y } from './terrain';
import { angleDiff } from './util';

const WALK = 1.7;
const RUN = 5.2;

export function stepPlayer(dt: number, frame: number) {
  const f = axis(['s', 'arrowdown'], ['w', 'arrowup']);
  const r = axis(['a', 'arrowleft'], ['d', 'arrowright']);
  const run = held.has('shift');
  let want = 0;
  if (f || r) {
    // camera-relative: the camera looks along player yaw + look.yaw
    const camYaw = look.yaw;
    const dir = Math.atan2(-r, f) + camYaw;
    const turn = angleDiff(dir, player.yaw);
    player.yaw += turn * Math.min(1, dt * 10);
    want = run ? RUN : WALK;
  }
  player.speed += (want - player.speed) * Math.min(1, dt * 8);
  const ox = player.x;
  const oz = player.z;
  player.x += Math.sin(player.yaw) * player.speed * dt;
  player.z += Math.cos(player.yaw) * player.speed * dt;
  collide(player, 0.35, player.y, 1.8, 0.45, frame, true);
  // no walking into the sea or off the map
  const g = groundH(player.x, player.z);
  if (g < SEA_Y + 0.2) {
    player.x = ox;
    player.z = oz;
  }
  const ground = groundH(player.x, player.z);
  if (held.has(' ') && player.grounded) {
    player.vy = 3.6;
    player.grounded = false;
  }
  player.vy -= 9.81 * dt;
  player.y += player.vy * dt;
  if (player.y <= ground) {
    player.y = ground;
    player.vy = 0;
    player.grounded = true;
  } else if (player.grounded && player.y - ground < 0.5) {
    player.y = ground; // walking down a slope or a step
    player.vy = 0;
  } else player.grounded = false;
  player.phase += player.speed * dt * (run ? 1.45 : 2.6);
}

export function Operator({ visible }: { visible: boolean }) {
  const root = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const m = useMemo(
    () => ({
      suit: new THREE.MeshStandardMaterial({ color: '#2b3f63', roughness: 0.85 }),
      vest: new THREE.MeshStandardMaterial({ color: '#f26a1b', roughness: 0.7 }),
      strip: new THREE.MeshStandardMaterial({ color: '#d8d8d0', roughness: 0.3, metalness: 0.4 }),
      skin: new THREE.MeshStandardMaterial({ color: '#b07a55', roughness: 0.7 }),
      hat: new THREE.MeshStandardMaterial({ color: '#f5f5f0', roughness: 0.4 }),
      boot: new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.8 }),
    }),
    [],
  );
  useFrame(() => {
    const g = root.current!;
    g.position.set(player.x, player.y, player.z);
    g.rotation.y = player.yaw;
    const s = Math.sin(player.phase) * Math.min(1, player.speed / 1.5) * 0.7;
    legL.current!.rotation.x = s;
    legR.current!.rotation.x = -s;
    armL.current!.rotation.x = -s * 0.8;
    armR.current!.rotation.x = s * 0.8;
    g.position.y += Math.abs(Math.cos(player.phase)) * 0.04 * Math.min(1, player.speed / 1.5);
  });
  const leg = (ref: React.RefObject<THREE.Group>, x: number) => (
    <group ref={ref} position={[x, 0.92, 0]}>
      <mesh material={m.suit} position={[0, -0.42, 0]} castShadow>
        <boxGeometry args={[0.17, 0.84, 0.2]} />
      </mesh>
      <mesh material={m.boot} position={[0, -0.86, 0.05]} castShadow>
        <boxGeometry args={[0.18, 0.12, 0.3]} />
      </mesh>
    </group>
  );
  const arm = (ref: React.RefObject<THREE.Group>, x: number) => (
    <group ref={ref} position={[x, 1.42, 0]}>
      <mesh material={m.suit} position={[0, -0.32, 0]} castShadow>
        <boxGeometry args={[0.12, 0.62, 0.14]} />
      </mesh>
      <mesh material={m.skin} position={[0, -0.68, 0]}>
        <boxGeometry args={[0.1, 0.12, 0.11]} />
      </mesh>
    </group>
  );
  return (
    <group ref={root} visible={visible}>
      {leg(legL, -0.1)}
      {leg(legR, 0.1)}
      <mesh material={m.suit} position={[0, 1.18, 0]} castShadow>
        <boxGeometry args={[0.42, 0.56, 0.24]} />
      </mesh>
      <mesh material={m.vest} position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[0.44, 0.46, 0.26]} />
      </mesh>
      {[1.06, 1.3].map((y) => (
        <mesh key={y} material={m.strip} position={[0, y, 0]}>
          <boxGeometry args={[0.45, 0.04, 0.27]} />
        </mesh>
      ))}
      {arm(armL, -0.28)}
      {arm(armR, 0.28)}
      <mesh material={m.skin} position={[0, 1.6, 0.01]} castShadow>
        <boxGeometry args={[0.2, 0.24, 0.22]} />
      </mesh>
      <mesh material={m.hat} position={[0, 1.74, 0.01]} castShadow>
        <sphereGeometry args={[0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh material={m.hat} position={[0, 1.74, 0.06]}>
        <cylinderGeometry args={[0.17, 0.17, 0.02, 12]} />
      </mesh>
    </group>
  );
}
