/**
 * Counter-based randomness.
 *
 * A closure-based PRNG cannot be saved, and a run that cannot be saved cannot
 * be reproduced from a bug report. So the stream here is a pure function of
 * `(seed, cursor)`: the run holds an integer, every draw increments it, and
 * replaying the same seed with the same decisions replays the same night.
 *
 * `Math.random()` must never appear anywhere else in `src/game`.
 */

export function seedFrom(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** One draw from the stream. Deterministic, stateless, in [0, 1). */
export function randAt(seed: number, cursor: number): number {
  let t = (seed + Math.imul(cursor + 1, 0x9e3779b9)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * A cursor you can carry through pure code. `next()` mutates the local count
 * only; the caller writes the final cursor back into the run state, so the
 * stream stays intact across a save, a reload, and a decision made an hour
 * later.
 */
export class Stream {
  constructor(
    public readonly seed: number,
    public cursor: number,
  ) {}

  next(): number {
    return randAt(this.seed, this.cursor++);
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  bool(chance: number): boolean {
    return this.next() < chance;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /**
   * Triangular roll in [-span, span], peaked at zero. A flat roll makes every
   * plan feel like a coin flip; a peaked one means preparation usually shows
   * and the tails are where the stories live.
   */
  swing(span: number): number {
    return Math.round((this.next() - this.next()) * span);
  }

  weighted<T extends { weight: number }>(items: readonly T[]): T | undefined {
    const total = items.reduce((sum, i) => sum + i.weight, 0);
    if (total <= 0) return undefined;
    let roll = this.next() * total;
    for (const item of items) {
      roll -= item.weight;
      if (roll <= 0) return item;
    }
    return items[items.length - 1];
  }

  /** Fisher-Yates on a copy. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}
