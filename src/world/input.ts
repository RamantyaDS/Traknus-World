// Keys for walking and the truck. While the player drives a simulator's machine, that simulator's own keys take
// over; the world then only listens for Esc (get off).
import { useWorld } from './state';

export const held = new Set<string>();
const actions = new Map<string, () => void>();

/** Register what a one-shot key does (e, m, escape, h …). */
export function onKey(k: string, f: () => void) {
  actions.set(k, f);
}

function typing(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}

export function bindWorldKeys() {
  addEventListener('keydown', (e) => {
    if (typing(e)) return;
    const k = e.key.toLowerCase();
    const mode = useWorld.getState().mode;
    if (mode === 'drive') {
      if (k === 'escape') {
        e.stopImmediatePropagation();
        actions.get('escape')?.();
      }
      return;
    }
    if (['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    const act = actions.get(k);
    if (act) {
      // the simulators listen on the same window: the key that gets you on a machine must not also work its controls
      e.stopImmediatePropagation();
      if (!held.has(k)) act();
    }
    held.add(k);
  });
  addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
  addEventListener('blur', () => held.clear());
}

export const axis = (neg: string[], pos: string[]) => (pos.some((k) => held.has(k)) ? 1 : 0) - (neg.some((k) => held.has(k)) ? 1 : 0);
