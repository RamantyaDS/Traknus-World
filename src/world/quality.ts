// Graphics quality, fixed for the session like in the simulators: light by default (1× resolution, no ambient
// occlusion or bloom, 1024 shadow map); "Mode penuh" is saved and applied by reloading. Never switched automatically.
const KEY = 'world-quality';
function read() {
  try {
    return localStorage.getItem(KEY) === 'full';
  } catch {
    return false;
  }
}
export const FULL = read();
export const MAX_DPR = FULL ? Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) : 1;
export const SHADOW = FULL ? 2048 : 1024;

export function setQuality(full: boolean) {
  try {
    localStorage.setItem(KEY, full ? 'full' : 'light');
  } catch {
    /* private mode */
  }
  location.reload();
}
