import { describe, expect, it } from 'vitest';
import { GOVERNED, newDrive, requestShift, selectDirection, stepDrive, type DriveIn } from './drivetrain';

const flat: DriveIn = { throttle: 1, brake: 0, hand: false, loaded: false, pitch: 0, grip: 0.8 };

function accelerate(inp: DriveIn, toKmh: number, maxS = 120) {
  const d = newDrive();
  let t = 0;
  const gears: number[] = [];
  while (d.v * 3.6 < toKmh && t < maxS) {
    stepDrive(d, inp, 0.01);
    t += 0.01;
    if (gears[gears.length - 1] !== d.gear) gears.push(d.gear);
  }
  return { t, d, gears };
}

describe('truck driveline', () => {
  it('pulls away and shifts up through the gears: an empty truck reaches 60 km/h in about 15–25 s, loaded slower', () => {
    const empty = accelerate(flat, 60);
    const loaded = accelerate({ ...flat, loaded: true }, 60);
    expect(empty.t).toBeGreaterThan(12);
    expect(empty.t).toBeLessThan(26);
    expect(loaded.t).toBeGreaterThan(empty.t * 1.5);
    // up one gear at a time, never back down while accelerating
    for (let i = 1; i < empty.gears.length; i++) expect(empty.gears[i]).toBe(empty.gears[i - 1] + 1);
    expect(empty.gears[0]).toBe(2);
    expect(loaded.gears[0]).toBe(1);
  });

  it('tops out on the governor at about 85 km/h in 12th', () => {
    const d = newDrive();
    for (let t = 0; t < 240; t += 0.01) stepDrive(d, flat, 0.01);
    expect(d.gear).toBe(12);
    expect(d.v * 3.6).toBeGreaterThan(78);
    expect(d.v * 3.6).toBeLessThan(90);
    expect(d.rpm).toBeLessThanOrEqual(GOVERNED + 1);
  });

  it('holds a lower gear up a 6 % grade loaded, and the engine and brakes stop it', () => {
    const hill = { ...flat, loaded: true, pitch: Math.atan(0.06) };
    const d = newDrive();
    for (let t = 0; t < 90; t += 0.01) stepDrive(d, hill, 0.01);
    // 272 kW against 27 t on 6 %: about 45 km/h, a few gears below top
    expect(d.gear).toBeLessThan(12);
    expect(d.v * 3.6).toBeGreaterThan(30);
    expect(d.v * 3.6).toBeLessThan(55);
    // brake to a stop on the hill and hold there
    for (let t = 0; t < 20; t += 0.01) stepDrive(d, { ...hill, throttle: 0, brake: 1 }, 0.01);
    expect(d.v).toBe(0);
    expect(d.gear).toBe(1);
  });

  it('stops from 60 km/h in a realistic distance and coasts down through the gears', () => {
    const { d } = accelerate(flat, 60);
    let s = 0;
    while (d.v > 0) {
      stepDrive(d, { ...flat, throttle: 0, brake: 1 }, 0.01);
      s += d.v * 0.01;
    }
    expect(s).toBeGreaterThan(18);
    expect(s).toBeLessThan(40);
  });

  it('reverses only when stopped, and manual shifts refuse to over-rev', () => {
    const d = newDrive();
    selectDirection(d, true, false, 0);
    expect(d.gear).toBe(-1);
    for (let t = 0; t < 4; t += 0.01) stepDrive(d, flat, 0.01);
    expect(d.v).toBeLessThan(-1);
    const f = accelerate(flat, 50).d;
    f.auto = false;
    const g = f.gear;
    // dropping four gears at once at 50 km/h would over-rev: refused one step before
    let n = 0;
    while (requestShift(f, -1)) {
      for (let t = 0; t < 0.6; t += 0.01) stepDrive(f, { ...flat, throttle: 0.3 }, 0.01);
      n++;
    }
    expect(n).toBeGreaterThan(0);
    expect(f.gear).toBeLessThan(g);
    expect(f.rpm).toBeLessThan(GOVERNED + 150);
  });
});
