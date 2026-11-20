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

/** Called every frame: engine pitch from road speed and throttle, quieter with the camera farther away. */
export function truckSound(driving: boolean, distance: number) {
  if (!ctx || !eng || !horn) return;
  const t = ctx.currentTime;
  const rpm = 650 + Math.min(1, Math.abs(truck.v) / 22) * 1300 * (0.6 + 0.4 * truck.gas) + truck.gas * 250;
  const f = rpm / 20;
  eng.osc.frequency.setTargetAtTime(f, t, 0.08);
  eng.osc2.frequency.setTargetAtTime(f / 2, t, 0.08);
  eng.filt.frequency.setTargetAtTime(260 + truck.gas * 700 + Math.abs(truck.v) * 10, t, 0.1);
  // the engine is switched off when the driver gets out
  const vol = driving ? 0.16 * Math.min(1, 14 / Math.max(1, distance)) : 0;
  eng.gain.gain.setTargetAtTime(vol * (0.7 + 0.5 * truck.gas), t, 0.1);
  horn.gain.gain.setTargetAtTime(truck.horn ? 0.12 : 0, t, 0.02);
}
