import type { FC } from 'react';

/** A solid box in the zone's own coordinates (same shape as the simulators' Obb). */
export interface Blocker {
  x: number;
  z: number;
  hx: number;
  hz: number;
  yaw: number;
  y0: number;
  y1: number;
}

/** Something the player can drive or operate in a zone. */
export interface Station {
  id: string;
  /** Prompt verb + name, e.g. "Naik forklift Toyota 4FD240". */
  label: string;
  /** Where it is now (local x, z) and how close the player must be. */
  pos(): [number, number];
  r: number;
  /** Where the player stands after getting off (local x, z, yaw). */
  exit(): [number, number, number];
}

/** What each simulator gives the world when it is mounted as a zone. */
export interface ZoneModule {
  /** The scene (no sky or lights). drive: the player is at the controls of this zone's station. */
  Content: FC<{ drive: boolean; station: string | null }>;
  /** The simulator's own on-screen panels, shown while driving or operating. */
  Hud: FC<{ station: string }>;
  stations: Station[];
  /** Ground height where the zone has its own terrain (local). */
  groundAt?: (x: number, z: number) => number;
  /** Solid things the player walks around (local). */
  blockers(): Blocker[];
  enter(station: string): void;
  leave(station: string): void;
  /** The zone is unmounted: silence its sounds. */
  unmount(): void;
  /** The sun casts no shadows while this zone is mounted (the plant: hundreds of parts, as in its own simulator). */
  noShadows?: boolean;
  setNight?(on: boolean): void;
  setRain?(on: boolean): void;
  /** The simulator's list of world solids (its EMBED.solids): the world puts the truck there, in zone coordinates. */
  solids?: (Blocker & { id: string })[];
  /** Surfaces a load may be set down on (its EMBED.supports): the world puts the truck's deck there. */
  supports?: (Blocker & { id: string })[];
  /**
   * The genset on the truck's deck, shared with this zone's simulator. Called every frame with the deck (zone
   * coordinates, `top` = where a load sits, `loadYaw` = a load lengthwise on it; null when the truck is away) and
   * whether the truck has the set. The zone puts its own set there while it is, notices it lifted off, or one set
   * down there, and answers whether the truck has it now and whether the zone is drawing it.
   */
  cargo?(deck: (Blocker & { id: string; top: number; loadYaw: number }) | null, has: boolean): { has: boolean; shown: boolean };
  /** Progress the world's missions read: named flags/values. */
  status?(): Record<string, number | boolean | string>;
  /** Mission hooks: prepare the zone for a mission step. */
  prepare?(what: string): void;
}
