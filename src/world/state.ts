// World state. The player, the truck and the render origin change every frame and live in plain mutable objects;
// the zustand store holds what the screen shows.
import { create } from 'zustand';
import { SPAWN, TRUCK_SPAWN, type ZoneId } from './map';

export type Mode = 'walk' | 'drive' | 'truck';

/** The operator on foot, in world coordinates. */
export const player = { x: SPAWN.x, y: 0, z: SPAWN.z, yaw: SPAWN.yaw, vy: 0, speed: 0, phase: 0, grounded: true };

/** The delivery truck (world coordinates). `cargo`: the genset rides on the deck during the mission. */
export const truck = { x: TRUCK_SPAWN.x, y: 0, z: TRUCK_SPAWN.z, yaw: TRUCK_SPAWN.yaw, v: 0, steer: 0, pitch: 0, roll: 0, gas: 0, brake: 0, horn: false, cargo: false, wheel: 0 };

/**
 * The world offset of the render frame. The mounted zone always sits at the render origin, so each simulator's own
 * camera and physics run in its own coordinates; the rest of the world is drawn shifted by −origin.
 */
export const origin = { x: 0, z: 0 };

/** Camera look offsets for walking and the truck (mouse drag, wheel). */
export const look = { yaw: 0, pitch: 0.28, dist: 5.5 };

export interface MissionState {
  id: string;
  step: number;
  done: boolean;
}

interface WS {
  started: boolean;
  mode: Mode;
  /** Zone whose scene is mounted (the player is in or near it). */
  zone: ZoneId | null;
  loading: boolean;
  /** What the player drives or operates: `${zone}:${station}`. */
  station: string | null;
  prompt: string;
  map: boolean;
  menu: boolean;
  missions: boolean;
  time: number; // hour of day, 0–24
  timeRun: boolean;
  rain: boolean;
  mission: MissionState | null;
  toast: string;
  toastUntil: number;
  tick: number;
  set: (p: Partial<Omit<WS, 'set'>>) => void;
}

export const useWorld = create<WS>((set) => ({
  started: false,
  mode: 'walk',
  zone: null,
  loading: false,
  station: null,
  prompt: '',
  map: false,
  menu: false,
  missions: false,
  time: 9,
  timeRun: true,
  rain: false,
  mission: null,
  toast: '',
  toastUntil: 0,
  tick: 0,
  set: (p) => set(p),
}));

export function toast(msg: string, ms = 5000) {
  useWorld.getState().set({ toast: msg, toastUntil: performance.now() + ms });
}

// ---- saving: where you are, the truck, the clock, the weather and the mission (the machines restart fresh) ----
const KEY = 'traknus-world-save';

export function save() {
  const s = useWorld.getState();
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        player: { x: player.x, z: player.z, yaw: player.yaw },
        truck: { x: truck.x, z: truck.z, yaw: truck.yaw, cargo: truck.cargo },
        time: s.time,
        timeRun: s.timeRun,
        rain: s.rain,
        mission: s.mission,
      }),
    );
  } catch {
    /* private mode */
  }
}

export function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!d) return false;
    Object.assign(player, d.player);
    Object.assign(truck, d.truck);
    useWorld.getState().set({ time: d.time ?? 9, timeRun: d.timeRun ?? true, rain: !!d.rain, mission: d.mission ?? null });
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

// development and headless checks
if (import.meta.env.DEV) Object.assign(globalThis, { player, truck, origin, look, useWorld });
