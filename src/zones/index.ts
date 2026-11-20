// Each simulator is loaded only when the player comes near its zone (a separate chunk per simulator).
import type { ZoneId } from '../world/map';
import type { ZoneModule } from './types';

export const LOADERS: Partial<Record<ZoneId, () => Promise<{ default: ZoneModule }>>> = {
  port: () => import('./port'),
  crane: () => import('./crane'),
  excavator: () => import('./excavator'),
  tractor: () => import('./tractor'),
  gedung: () => import('./gedung'),
  plant: () => import('./plant'),
  bengkel: () => import('./bengkel'),
};

export const loaded: Partial<Record<ZoneId, ZoneModule>> = {};

export async function loadZone(id: ZoneId) {
  if (loaded[id]) return loaded[id]!;
  const f = LOADERS[id];
  if (!f) return null;
  const m = (await f()).default;
  loaded[id] = m;
  return m;
}

if (import.meta.env.DEV) Object.assign(globalThis, { zones: loaded });
