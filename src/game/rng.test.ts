import { describe, expect, it } from 'vitest';
import { Stream, randAt, seedFrom } from './rng';

describe('randomness', () => {
  it('is a pure function of seed and cursor', () => {
    expect(randAt(1234, 7)).toBe(randAt(1234, 7));
    expect(randAt(1234, 7)).not.toBe(randAt(1234, 8));
    expect(randAt(1234, 7)).not.toBe(randAt(1235, 7));
  });

  it('resumes mid-stream from a saved cursor', () => {
    const a = new Stream(99, 0);
    const first = [a.next(), a.next(), a.next()];
    const saved = a.cursor;

    const b = new Stream(99, saved);
    const resumed = [b.next(), b.next()];

    const c = new Stream(99, 0);
    const straight = [c.next(), c.next(), c.next(), c.next(), c.next()];

    expect([...first, ...resumed]).toEqual(straight);
  });

  it('spreads uniformly enough to balance against', () => {
    const s = new Stream(seedFrom('uniformity'), 0);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 100000; i++) buckets[Math.floor(s.next() * 10)]++;
    for (const b of buckets) expect(b).toBeGreaterThan(9000);
  });

  it('peaks the swing at zero and respects the span', () => {
    const s = new Stream(seedFrom('swing'), 0);
    let near = 0;
    let min = 99;
    let max = -99;
    for (let i = 0; i < 20000; i++) {
      const v = s.swing(20);
      if (Math.abs(v) <= 5) near++;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(near / 20000).toBeGreaterThan(0.4);
    expect(min).toBeGreaterThanOrEqual(-20);
    expect(max).toBeLessThanOrEqual(20);
  });
});
