// The truck's driveline: a GH11-class 11 L diesel (1 460 Nm from 1 000 to 1 500 rpm, governed at 2 100), a 12-speed
// automated manual gearbox (ESCOT-style: the clutch slips to move off, torque is cut for each shift, the computer
// shifts up and down by engine speed and throttle, or the driver does in manual), 4.875 final drive, 11R22.5 tyres.
// Forces: tractive effort limited by the grip of the driven tandem, service and parking brakes, engine braking,
// rolling and air resistance, and the slope. An empty truck weighs 12.5 t, with the genset 27.3 t.

export const RATIOS = [14.94, 11.73, 9.04, 7.09, 5.54, 4.35, 3.44, 2.7, 2.08, 1.63, 1.27, 1.0];
export const REVERSE = 13.1;
export const FINAL = 4.875;
export const TYRE_R = 0.53;
export const IDLE = 600;
export const GOVERNED = 2100;
const EFF = 0.88;
const SHIFT_S = 0.5; // torque interruption per shift
const MASS_EMPTY = 12500;
const MASS_GENSET = 14800;
const G = 9.81;

/** Full-load engine torque (Nm) at an engine speed. */
export function torqueAt(rpm: number) {
  if (rpm < 500) return 0;
  if (rpm < 1000) return 900 + ((rpm - 500) / 500) * 560;
  if (rpm <= 1500) return 1460;
  if (rpm <= GOVERNED) return 1460 - ((rpm - 1500) / 600) * 300;
  return 0; // governor cuts fuel
}

export interface Drive {
  v: number; // m/s along the truck's heading (negative backwards)
  gear: number; // 1…12 forward, −1 reverse
  rpm: number;
  shift: number; // seconds left in a shift (no torque)
  next: number; // gear being shifted into
  auto: boolean;
  clutch: number; // 0 open … 1 locked (moving off)
  shifts: number; // count, for the shift sound
}

export const newDrive = (): Drive => ({ v: 0, gear: 2, rpm: IDLE, shift: 0, next: 2, auto: true, clutch: 0, shifts: 0 });

export interface DriveIn {
  throttle: number; // 0…1
  brake: number; // 0…1 service brake
  hand: boolean;
  loaded: boolean;
  pitch: number; // nose up positive, rad
  grip: number; // tyre–road friction (0.8 dry asphalt … 0.45 loose ground)
}

const ratio = (gear: number) => (gear < 0 ? REVERSE : RATIOS[gear - 1]) * FINAL;
/** Engine speed the wheels turn it at in a gear. */
export const wheelRpm = (v: number, gear: number) => ((Math.abs(v) / TYRE_R) * 60 * ratio(gear)) / (2 * Math.PI);
const startGear = (loaded: boolean, pitch: number) => (loaded || pitch > 0.04 ? 1 : 2);

function beginShift(d: Drive, to: number) {
  if (to === d.gear || to < 1 || to > 12) return;
  d.next = to;
  d.shift = SHIFT_S;
  d.shifts++;
}

/** Driver's shift request in manual (or an override in automatic). Refused if the engine would over- or under-rev. */
export function requestShift(d: Drive, dir: 1 | -1) {
  if (d.gear < 0 || d.shift > 0) return false;
  const to = d.gear + dir;
  if (to < 1 || to > 12) return false;
  const r = wheelRpm(d.v, to);
  if (dir < 0 && r > GOVERNED + 100) return false; // would over-rev
  if (dir > 0 && Math.abs(d.v) > 0.5 && r < 700) return false; // would lug
  beginShift(d, to);
  return true;
}

/** Advance the driveline and the truck's speed by dt. */
export function stepDrive(d: Drive, inp: DriveIn, dt: number) {
  const m = MASS_EMPTY + (inp.loaded ? MASS_GENSET : 0);
  const dir = d.gear < 0 ? -1 : 1;
  // shifting: torque cut, the engine speed falls (or is blipped) towards the new gear
  let engaged = true;
  if (d.shift > 0) {
    d.shift -= dt;
    engaged = false;
    const target = Math.max(IDLE, wheelRpm(d.v, d.next));
    d.rpm += (target - d.rpm) * Math.min(1, dt * 9);
    if (d.shift <= 0) {
      d.gear = d.next;
      d.shift = 0;
    }
  }
  const locked = wheelRpm(d.v, d.gear);
  let engineT = 0;
  if (engaged) {
    const want = Math.max(850, IDLE + inp.throttle * 700);
    if (locked < want) {
      // moving off: the clutch slips (until the gearbox side catches up with the engine), the engine runs up with
      // the throttle and passes its torque through
      d.clutch = Math.min(0.99, locked / want);
      d.rpm += (Math.max(want, locked) - d.rpm) * Math.min(1, dt * 6);
      engineT = inp.throttle > 0.02 ? torqueAt(d.rpm) * inp.throttle * (0.55 + 0.45 * Math.min(1, inp.throttle * 1.4)) : 0;
    } else {
      d.clutch = 1;
      d.rpm = locked;
      engineT = torqueAt(d.rpm) * inp.throttle;
      // off the throttle in gear: engine braking (and the exhaust brake) holds the truck back
      if (inp.throttle < 0.02) engineT = -(120 + 260 * (d.rpm / GOVERNED));
    }
  } else d.clutch = 0;
  // tractive force, limited by what the driven tandem (about 70 % of the weight) can put down
  let F = (engineT * ratio(d.gear) * EFF) / TYRE_R;
  const gripMax = inp.grip * 0.7 * m * G;
  F = Math.max(-gripMax, Math.min(gripMax, F)) * dir;
  // resistances that only ever oppose motion
  const brake = inp.hand ? 0.55 * m * G : inp.brake * 0.62 * m * G * Math.min(1, inp.grip / 0.6);
  const roll = 0.0075 * m * G;
  const air = 0.5 * 1.2 * 0.85 * 8.2 * d.v * d.v;
  const slope = -m * G * Math.sin(inp.pitch); // nose up pulls back
  let a = (F + slope) / m;
  const oppose = (brake + roll + air) / m;
  if (Math.abs(d.v) < 0.05 && Math.abs(a) <= oppose) {
    d.v = 0; // held by brakes / rolling resistance
    a = 0;
  } else {
    const sv = d.v !== 0 ? Math.sign(d.v) : Math.sign(a);
    const nv = d.v + (a - sv * oppose) * dt;
    d.v = Math.sign(nv) !== sv && Math.abs(a) <= oppose ? 0 : nv;
  }
  // the computer's shift schedule
  if (d.auto && d.gear > 0 && d.shift === 0 && d.clutch === 1) {
    const up = 1300 + 600 * inp.throttle;
    const down = 800 + 150 * inp.throttle;
    if (d.rpm > up && d.gear < 12 && wheelRpm(d.v, d.gear + 1) > 1000) beginShift(d, d.gear + 1);
    else if (d.rpm < down && d.gear > 1) beginShift(d, d.gear - 1);
  }
  // stopped: back to the gear it moves off in
  if (d.gear > 0 && d.shift === 0 && Math.abs(d.v) < 0.3) {
    const s = startGear(inp.loaded, inp.pitch);
    if (d.gear !== s && (inp.throttle < 0.05 || d.gear > s)) d.gear = d.next = s;
  }
  if (d.clutch < 1 && inp.throttle < 0.02) d.rpm += (IDLE - d.rpm) * Math.min(1, dt * 4);
  return d;
}

/** Into reverse or back into drive (only when stopped). */
export function selectDirection(d: Drive, reverse: boolean, loaded: boolean, pitch: number) {
  if (Math.abs(d.v) > 0.3) return;
  d.gear = d.next = reverse ? -1 : startGear(loaded, pitch);
  d.shift = 0;
}
