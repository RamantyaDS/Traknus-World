// The truck's diesel, gearbox and horn with Web Audio: the recorded diesel loops the simulators use (idle and mid
// speed, cross-faded and pitched with the engine speed, deeper for the big six), a turbo whistle under load, the
// starter and shutdown when the driver gets in and out, a dip and an air valve on each shift, and an air horn.
import { truck } from './state';

const BASE = import.meta.env.BASE_URL + 'audio/';

let ctx: AudioContext | null = null;
type Loop = { s: AudioBufferSourceNode; g: GainNode };
let N: {
  bus: GainNode;
  tone: BiquadFilterNode;
  idle: Loop;
  mid: Loop;
  turbo: { o: OscillatorNode; g: GainNode };
  horn: GainNode;
  start: AudioBuffer;
  stop: AudioBuffer;
} | null = null;

async function load(c: AudioContext, name: string) {
  const r = await fetch(BASE + name);
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return c.decodeAudioData(await r.arrayBuffer());
}

function loop(c: AudioContext, buf: AudioBuffer, out: AudioNode): Loop {
  const s = c.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  const g = c.createGain();
  g.gain.value = 0;
  s.connect(g).connect(out);
  s.start();
  return { s, g };
}

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
  const c = ctx;
  void Promise.all(['engine-idle-810rpm.wav', 'engine-mid-1290rpm.wav', 'engine-start.wav', 'engine-stop.wav'].map((n) => load(c, n)))
    .then(([idle, mid, start, stop]) => {
      const bus = c.createGain();
      bus.gain.value = 0;
      // a heavy engine: more body below, the rasp opening up with the throttle
      const body = c.createBiquadFilter();
      body.type = 'lowshelf';
      body.frequency.value = 160;
      body.gain.value = 6;
      const tone = c.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 1200;
      tone.Q.value = 0.5;
      bus.connect(body).connect(tone).connect(c.destination);
      const to = c.createOscillator();
      to.type = 'sine';
      const tg = c.createGain();
      tg.gain.value = 0;
      to.connect(tg).connect(c.destination);
      to.start();
      // air horn: three reedy notes through a horn-like band
      const horn = c.createGain();
      horn.gain.value = 0;
      const hb = c.createBiquadFilter();
      hb.type = 'bandpass';
      hb.frequency.value = 700;
      hb.Q.value = 0.8;
      hb.connect(horn).connect(c.destination);
      for (const f of [277, 349, 415]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.connect(hb);
        o.start();
      }
      N = { bus, tone, idle: loop(c, idle, bus), mid: loop(c, mid, bus), turbo: { o: to, g: tg }, horn, start, stop };
    })
    .catch(() => {
      // no engine sound rather than a broken one
    });
}

function oneShot(buf: AudioBuffer, vol: number, rate = 1) {
  if (!ctx) return;
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = vol;
  s.connect(g).connect(ctx.destination);
  s.start();
}

/** A short burst of filtered noise: the gearbox's air valves on each shift. */
function airHiss(vol: number) {
  if (!ctx) return;
  const n = Math.floor(ctx.sampleRate * 0.3);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp((-i / n) * 6);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 3200;
  f.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start();
}

let lastShifts = 0;
let wasDriving = false;
let dipUntil = 0;

/** Called every frame: the diesel follows the engine speed and load, dips at each shift, quieter farther away. */
export function truckSound(driving: boolean, distance: number) {
  if (!ctx || !N) return;
  const t = ctx.currentTime;
  const k = (p: AudioParam, v: number, tc = 0.05) => p.setTargetAtTime(v, t, tc);
  const near = Math.min(1, 14 / Math.max(4, distance));
  // the engine starts when the driver gets in and stops when they get out
  if (driving !== wasDriving) {
    oneShot(driving ? N.start : N.stop, 0.35 * near, 0.85);
    wasDriving = driving;
  }
  if (truck.shifts !== lastShifts) {
    if (driving && truck.shifts > lastShifts) {
      airHiss(0.035 * near);
      dipUntil = t + 0.28;
    }
    lastShifts = truck.shifts;
  }
  const rpm = Math.max(550, truck.rpm || 600);
  const gas = driving ? truck.gas : 0;
  // the recordings pitched down a little: an 11-litre six turns slower and sounds deeper than the sims' engines
  const x = Math.max(0, Math.min(1, (rpm - 900) / 600));
  k(N.idle.s.playbackRate, (rpm / 810) * 0.8, 0.04);
  k(N.mid.s.playbackRate, (rpm / 1290) * 0.8, 0.04);
  const dip = t < dipUntil ? 0.55 : 1;
  const load = 0.45 + 0.55 * gas;
  k(N.idle.g.gain, (1 - x) * 0.9 * (0.75 + 0.25 * gas));
  k(N.mid.g.gain, x * load * dip);
  k(N.tone.frequency, 500 + gas * 1600 + (rpm - 600) * 0.4, 0.12);
  k(N.bus.gain, driving ? 0.55 * near : 0, driving ? 0.15 : 0.6);
  k(N.turbo.o.frequency, 1800 + 2600 * Math.min(1, rpm / 2100) * (0.5 + 0.5 * gas), 0.4);
  k(N.turbo.g.gain, driving ? near * 0.006 * gas * x * dip : 0, 0.3);
  k(N.horn.gain, truck.horn ? 0.09 : 0, 0.03);
}
