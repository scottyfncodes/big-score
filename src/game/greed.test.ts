import { describe, expect, it } from 'vitest';
import { buildPlan, type SimOptions } from './sim';
import {
  GREED_MAX,
  declineGreed,
  goBackIn,
  greedOffer,
  playOut,
  projectedTake,
  resolveStage,
  startRun,
  pendingEventFor,
  chooseEventOption,
} from './resolve';
import { MARKS } from './marks';
import type { RunState } from './types';
import type { Plan } from './calc';

/**
 * Going back in, and rhythm. Both are rewards that sit on top of the balanced
 * engine: neither changes a check the player did not choose to make.
 */

const jeweller: SimOptions = {
  targetId: 'argent_vine',
  approachId: 'stealth',
  crewRoles: ['scout', 'safecracker', 'driver', 'hacker'],
  equipmentIds: ['comms', 'bypass', 'drill'],
  experienceBias: 1,
};

/** Play steady until the run reaches extraction (or ends). */
function toExtraction(plan: Plan, seed: number): RunState {
  let run = startRun(plan, seed);
  let guard = 0;
  while (!run.outcome && run.stageIndex < 4 && guard++ < 40) {
    if (run.pending) {
      const p = pendingEventFor(plan, run)!;
      run = chooseEventOption(plan, run, p.event.choices.filter((c) => !c.when || c.when(p.ctx) ).filter((c) => c.id !== 'abort')[0].id);
    } else run = resolveStage(plan, run);
  }
  return run;
}

describe('going back in', () => {
  it('is offered after the objective and never before it', () => {
    const plan = buildPlan(jeweller, 7);
    const fresh = startRun(plan, 7);
    expect(greedOffer(plan, fresh)).toBeUndefined();
    let offered = 0;
    for (let i = 0; i < 40; i++) {
      const seed = 100 + i * 31;
      const p = buildPlan(jeweller, seed);
      const run = toExtraction(p, seed);
      if (greedOffer(p, run)) offered++;
    }
    expect(offered).toBeGreaterThan(20);
  });

  it('is deterministic, adds money when it lands, and stops at two trips', () => {
    let landedOnce = false;
    for (let i = 0; i < 60; i++) {
      const seed = 900 + i * 13;
      const plan = buildPlan(jeweller, seed);
      let run = toExtraction(plan, seed);
      if (!greedOffer(plan, run)) continue;
      const before = projectedTake(plan, run);
      const a = goBackIn(plan, run);
      expect(goBackIn(plan, run)).toEqual(a);
      if (a.greed![0].outcome === 'success' || a.greed![0].outcome === 'critical') {
        landedOnce = true;
        expect(projectedTake(plan, a)).toBeGreaterThan(before);
      }
      run = a;
      for (let k = 0; k < 4; k++) run = goBackIn(plan, run);
      expect((run.greed ?? []).length).toBeLessThanOrEqual(GREED_MAX);
      expect(greedOffer(plan, declineGreed(a))).toBeUndefined();
    }
    expect(landedOnce).toBe(true);
  });

  it('pays on average, and costs something when it goes wrong', () => {
    let bank = 0;
    let stay = 0;
    let blewIt = 0;
    for (let i = 0; i < 200; i++) {
      const seed = 5000 + i * 101;
      const plan = buildPlan(jeweller, seed);
      const run = toExtraction(plan, seed);
      if (!greedOffer(plan, run)) continue;
      const greedy = goBackIn(plan, run);
      if (greedy.greed![0].outcome === 'failure') {
        blewIt++;
        expect(greedy.alarm).toBe(true);
      }
      const pick = (e: { choices: { id: string }[] }) => e.choices[0].id;
      bank += playOut(plan, seed, pick as never).outcome!.net;
      // Finish the greedy run the same way.
      let r = greedy;
      let guard = 0;
      while (!r.outcome && guard++ < 40) {
        if (r.pending) {
          const p = pendingEventFor(plan, r)!;
          r = chooseEventOption(plan, r, p.event.choices.filter((c) => (!c.when || c.when(p.ctx)) && c.id !== 'abort')[0].id);
        } else r = resolveStage(plan, r);
      }
      stay += r.outcome!.net;
    }
    expect(stay).toBeGreaterThan(bank);
    expect(blewIt).toBeGreaterThan(0);
  });
});

describe('rhythm', () => {
  it('builds on clean stages and pays into the take', () => {
    let best = 0;
    for (let i = 0; i < 80; i++) {
      const seed = 300 + i * 17;
      const plan = buildPlan(jeweller, seed);
      const run = playOut(plan, seed, ((e: { choices: { id: string }[] }) => e.choices[0].id) as never);
      best = Math.max(best, run.bestStreak ?? 0);
      expect(run.outcome!.bestStreak).toBe(run.bestStreak ?? 0);
    }
    expect(best).toBeGreaterThanOrEqual(4);
  });
});

describe('marks', () => {
  it('have unique ids and rumours that do not just state the rule', () => {
    expect(new Set(MARKS.map((m) => m.id)).size).toBe(MARKS.length);
    for (const m of MARKS) expect(m.rumour).not.toEqual(m.line);
  });
});
