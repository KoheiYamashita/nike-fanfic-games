import seedrandom from 'seedrandom';
import { CONTAINER, Level, SPAWN_WEIGHTS } from '../config';

export class Spawner {
  rng: seedrandom.PRNG;
  x: number = 0;
  z: number = 0;
  constructor(seed: string | number | undefined) {
    const s = seed ?? Math.random().toString(36).slice(2);
    this.rng = seedrandom(String(s));
  }

  setXZAbsolute(x: number, z: number) {
    const R = CONTAINER.innerDiameter / 2 - 0.05;
    const len = Math.hypot(x, z);
    if (len > R) {
      const s = R / len;
      this.x = x * s;
      this.z = z * s;
    } else {
      this.x = x;
      this.z = z;
    }
  }

  nudge(dx: number, dz: number) {
    this.setXZAbsolute(this.x + dx, this.z + dz);
  }

  nextLevel(): Level {
    const r = this.rng.quick();
    let acc = 0;
    for (const { level, w } of SPAWN_WEIGHTS) {
      acc += w;
      if (r <= acc) return level;
    }
    return SPAWN_WEIGHTS[SPAWN_WEIGHTS.length - 1].level;
  }
}
