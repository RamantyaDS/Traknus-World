// Lahan galian: the Excavator Simulator (Komatsu PC800) as a zone. Its diggable terrain is the ground the player
// walks on.
import { EMBED } from '@excavator/embed';
import { bindKeys } from '@excavator/input';
import { ZoneContent } from '@excavator/scene/Experience';
import { setRain } from '@excavator/sim/excavator';
import { heightAt } from '@excavator/sim/terrain';
import { ensureAudio, updateSound } from '@excavator/sound';
import { ex, useUI } from '@excavator/store';
import { Hud } from '@excavator/ui/App';
import '@excavator/ui/styles.css';
import * as THREE from 'three';
import type { Blocker, ZoneModule } from './types';

bindKeys();

const fwd = new THREE.Vector3();
const heading = () => {
  fwd.set(0, 0, 1).applyQuaternion(ex.q);
  return Math.atan2(fwd.x, fwd.z);
};

const zone: ZoneModule = {
  Content: ({ drive }) => <ZoneContent drive={drive} />,
  Hud: () => <Hud />,
  stations: [
    {
      id: 'pc800',
      label: 'Naik excavator Komatsu PC800',
      pos: () => [ex.p.x, ex.p.z],
      r: 5.5,
      exit: () => {
        const h = heading();
        return [ex.p.x + Math.cos(h) * 3.4, ex.p.z - Math.sin(h) * 3.4, h];
      },
    },
  ],
  groundAt: (x, z) => heightAt(ex.terrain, x, z),
  solids: EMBED.solids,
  blockers: () => {
    const h = heading();
    const list: Blocker[] = [{ x: ex.p.x, z: ex.p.z, hx: 2.1, hz: 3.0, yaw: h, y0: ex.p.y, y1: ex.p.y + 4 }];
    for (const t of ex.trucks) list.push({ x: t.x, z: t.z, hx: 2.7, hz: 4.8, yaw: t.heading, y0: heightAt(ex.terrain, t.x, t.z), y1: heightAt(ex.terrain, t.x, t.z) + 4.5 });
    return list;
  },
  enter() {
    void ensureAudio();
    useUI.getState().set({ started: true });
    EMBED.input = true;
  },
  leave() {
    EMBED.input = false;
    ex.locked = true;
  },
  unmount() {
    updateSound(1e4, false);
  },
  setRain: (on) => {
    if (ex.rain !== on) setRain(ex, on);
  },
  status: () => ({ trucksFilled: ex.job === 'truck' ? ex.stats.trucks : 0 }),
  prepare(what) {
    if (what === 'trucks') ex.job = 'truck';
  },
};
export default zone;
