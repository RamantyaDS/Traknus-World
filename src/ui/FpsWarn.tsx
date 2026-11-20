// Mode penuh on a computer that cannot carry it: after the scene has settled, if the frame rate stays under 40 fps
// the player is told once and offered the light mode. Nothing switches by itself (a mid-session quality switch froze
// integrated GPUs before); the choice stays the player's.
import { useEffect, useState } from 'react';
import { FULL, setQuality } from '../world/quality';

export function FpsWarn() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    if (!FULL) return;
    let id = 0;
    let frames = 0;
    let t0 = 0;
    let low = 0;
    const start = performance.now();
    const tick = (now: number) => {
      if (now - start > 8000) {
        if (!t0) t0 = now;
        frames++;
        if (now - t0 >= 2000) {
          const f = (frames * 1000) / (now - t0);
          low = f < 40 ? low + 1 : 0;
          frames = 0;
          t0 = now;
          if (low >= 3) {
            setFps(Math.round(f));
            return;
          }
        }
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
  if (!fps) return null;
  return (
    <div className="fpswarn" role="alert">
      <span>
        Mode penuh terlalu berat untuk komputer ini (±{fps} fps), makanya terasa tersendat. Grafis ringan memakai model dan tekstur yang sama, hanya tanpa efek layar
        penuh.
      </span>
      <button onClick={() => setQuality(false)}>Pakai grafis ringan</button>
      <button className="x" onClick={() => setFps(0)} aria-label="Tutup">
        ×
      </button>
    </div>
  );
}
