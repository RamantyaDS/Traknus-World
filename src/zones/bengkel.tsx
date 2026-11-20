// Bengkel Traknus: the Genset Simulator's engine test cell (Perkins 4016 on a dynamometer), as a zone. The world adds
// the rest of the workshop around the cell: the front wall with a roller door, the roof and the lamps.
import { EMBED } from '@genset/embed';
import { BengkelHud } from '@genset/bengkel/BengkelApp';
import '@genset/bengkel/bengkel.css';
import { BengkelContent } from '@genset/bengkel/BengkelScene';
import { input } from '@genset/bengkel/store';
import { initSound, updateSound } from '@genset/sound';
import { useUI } from '@genset/store';
import '@genset/ui/styles.css';
import { useEffect } from 'react';
import type { Blocker, ZoneModule } from './types';

function Shell() {
  const wall = <meshStandardMaterial color="#d9d4c8" roughness={0.85} />;
  return (
    <group>
      {/* front wall either side of a 6 m roller door, the door rolled up, the roof */}
      {[-5.5, 5.5].map((x) => (
        <mesh key={x} position={[x, 3, 6]} castShadow receiveShadow>
          <boxGeometry args={[5, 6, 0.3]} />
          {wall}
        </mesh>
      ))}
      <mesh position={[0, 5.4, 6]} castShadow>
        <boxGeometry args={[6, 1.2, 0.3]} />
        {wall}
      </mesh>
      <mesh position={[0, 5.4, 6.25]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.35, 0.35, 6, 16]} />
        <meshStandardMaterial color="#8a9096" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 6.15, 0.5]} castShadow>
        <boxGeometry args={[16.8, 0.3, 11.6]} />
        <meshStandardMaterial color="#e05a1a" roughness={0.7} />
      </mesh>
      {[-8, 8].map((x) => (
        <mesh key={x} position={[x, 3, 5.6]} castShadow>
          <boxGeometry args={[0.3, 6, 1.2]} />
          {wall}
        </mesh>
      ))}
      {[-4, 4].map((x) => (
        <pointLight key={x} position={[x, 5.4, 0]} intensity={30} distance={16} decay={1.6} color="#fff3dc" />
      ))}
    </group>
  );
}

function Content({ drive }: { drive: boolean }) {
  useEffect(() => useUI.getState().set({ mode: 'bengkel' }), []);
  return (
    <>
      <BengkelContent drive={drive} />
      <Shell />
    </>
  );
}

const box = (x: number, z: number, w: number, d: number, h: number): Blocker => ({ x, z, hx: w / 2, hz: d / 2, yaw: 0, y0: 0, y1: h });
const SOLID: Blocker[] = [box(0, -5, 16, 0.3, 6), box(-8, 0.5, 0.3, 11, 6), box(8, 0.5, 0.3, 11, 6), box(-5.5, 6, 5, 0.3, 6), box(5.5, 6, 5, 0.3, 6), box(0, 0, 5.5, 2.2, 2.5)];

const zone: ZoneModule = {
  Content,
  Hud: () => <BengkelHud />,
  stations: [{ id: 'dyno', label: 'Pakai dyno mesin Perkins 4016', pos: () => [0, 2.5], r: 3.5, exit: () => [0, 3.6, Math.PI] }],
  blockers: () => SOLID,
  enter() {
    void initSound();
    EMBED.input = true;
  },
  leave() {
    EMBED.input = false;
    input.held = false;
  },
  unmount() {
    input.held = false;
    updateSound(1e4, false);
  },
};
export default zone;
