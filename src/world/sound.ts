// The truck's diesel and horn, made with Web Audio (the simulators bring their own recorded sounds).
import { truck } from './state';

let ctx: AudioContext | null = null;
let eng: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filt: BiquadFilterNode } | null = null;
let horn: { osc: OscillatorNode; gain: GainNode } | null = null;

export function initWorldAudio() {
  if (ctx) {
    void ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
  } catch {
    return;
  }
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 380;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 36;
  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.value = 18;
  const g2 = ctx.createGain();
  g2.gain.value = 0.35;
  osc.connect(filt);
  osc2.connect(g2).connect(filt);
  filt.connect(gain).connect(ctx.destination);
  osc.start();
  osc2.start();
  eng = { osc, osc2, gain, filt };
  const hg = ctx.createGain();
  hg.gain.value = 0;
  const ho = ctx.createOscillator();
  ho.type = 'square';
  ho.frequency.value = 330;
  const ho2 = ctx.createOscillator();
  ho2.type = 'square';
  ho2.frequency.value = 415;
  const hf = ctx.createBiquadFilter();
  hf.type = 'lowpass';
  hf.frequency.value = 1800;
  ho.connect(hf);
  ho2.connect(hf);
  hf.connect(hg).connect(ctx.destination);
  ho.start();
  ho2.start();
  horn = { osc: ho, gain: hg };
}

let lastShifts = 0;

/** A short burst of filtered noise: the gearbox's air valves on each shift. */
function airHiss(vol: number) {
  if (!ctx) return;
  const n = ctx.sampleRate * 0.35;
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp((-i / n) * 5);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 2500;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start();
}

/** Called every frame: the diesel follows the engine speed and load, dips at each shift, quieter farther away. */
export function truckSound(driving: boolean, distance: number) {
  if (!ctx || !eng || !horn) return;
  const t = ctx.currentTime;
  const rpm = Math.max(560, truck.rpm || 600);
  // six-cylinder firing frequency (rpm/20) and a sub-harmonic for the rumble
  const f = rpm / 20;
  eng.osc.frequency.setTargetAtTime(f, t, 0.05);
  eng.osc2.frequency.setTargetAtTime(f / 2, t, 0.05);
  eng.filt.frequency.setTargetAtTime(220 + truck.gas * 900 + (rpm - 600) * 0.25, t, 0.08);
  const near = Math.min(1, 14 / Math.max(1, distance));
  // the engine is switched off when the driver gets out
  const vol = driving ? 0.15 * near : 0;
  eng.gain.gain.setTargetAtTime(vol * (0.55 + 0.6 * truck.gas + 0.15 * ((rpm - 600) / 1500)), t, 0.06);
  if (truck.shifts !== lastShifts) {
    if (driving && truck.shifts > lastShifts) airHiss(0.05 * near);
    lastShifts = truck.shifts;
  }
  horn.gain.gain.setTargetAtTime(truck.horn ? 0.12 : 0, t, 0.02);
}
