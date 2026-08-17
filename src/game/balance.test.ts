import { describe, expect, it } from 'vitest';
import { formatReport, simulate, type SimReport } from './sim';
import type { Grade } from './types';

/**
 * Balance is asserted, not eyeballed.
 *
 * These tests do two jobs. They print a distribution table (run
 * `npm run sim`) so the game can be tuned from a terminal, and they fail if
 * the shape of the game changes — if a plan becomes a guaranteed win, or a
 * reasonable plan starts losing the crew every time, that is a regression
 * whether or not anyone noticed it in the interface.
 */

const share = (r: SimReport, g: Grade) => r.grades[g] / r.runs;

describe('balance', () => {
  it('a thin plan on a tier 1 target is survivable but rarely clean', () => {
    const r = simulate({
      targetId: 'argent_vine',
      approachId: 'stealth',
      crewRoles: ['scout', 'safecracker'],
      policy: 'cautious',
      runs: 400,
    });
    console.log(formatReport(r));
    expect(share(r, 'perfect') + share(r, 'clean')).toBeLessThan(0.6);
    expect(share(r, 'catastrophic')).toBeLessThan(0.35);
  });

  it('a prepared plan on the same target is usually good and never certain', () => {
    const r = simulate({
      targetId: 'argent_vine',
      approachId: 'stealth',
      crewRoles: ['scout', 'safecracker', 'driver', 'hacker'],
      equipmentIds: ['comms', 'bypass', 'drill'],
      intelTopics: ['rotation', 'cameras', 'vault', 'response'],
      experienceBias: 1,
      policy: 'cautious',
      runs: 400,
    });
    console.log(formatReport(r));
    expect(share(r, 'perfect') + share(r, 'clean')).toBeGreaterThan(0.45);
    expect(share(r, 'perfect')).toBeLessThan(0.7);
    expect(share(r, 'messy') + share(r, 'botched') + share(r, 'catastrophic')).toBeGreaterThan(0.1);
  });

  it('the aggressive approach trades heat and arrests for money', () => {
    const quiet = simulate({
      targetId: 'port_argent_savings',
      approachId: 'technical',
      crewRoles: ['hacker', 'safecracker', 'driver', 'scout'],
      equipmentIds: ['comms', 'jammer', 'drill'],
      experienceBias: 1,
      runs: 300,
    });
    const loud = simulate({
      targetId: 'port_argent_savings',
      approachId: 'aggressive',
      crewRoles: ['muscle', 'driver', 'safecracker', 'face'],
      equipmentIds: ['comms', 'torch', 'vehicle'],
      experienceBias: 1,
      runs: 300,
    });
    console.log(formatReport(quiet));
    console.log(formatReport(loud));
    expect(loud.meanHeat).toBeGreaterThan(quiet.meanHeat + 8);
    expect(loud.policeRate).toBeGreaterThan(quiet.policeRate);
  });

  it('false intel costs the player something real', () => {
    const truth = simulate({
      targetId: 'kestrel_gallery',
      approachId: 'stealth',
      crewRoles: ['scout', 'safecracker', 'hacker', 'driver'],
      intelTopics: ['cameras', 'vault', 'access'],
      equipmentIds: ['comms', 'bypass'],
      runs: 300,
    });
    const lies = simulate({
      targetId: 'kestrel_gallery',
      approachId: 'stealth',
      crewRoles: ['scout', 'safecracker', 'hacker', 'driver'],
      intelTopics: ['cameras', 'vault', 'access'],
      falseIntelTopics: ['vault'],
      equipmentIds: ['comms', 'bypass'],
      runs: 300,
    });
    console.log(formatReport(truth));
    console.log(formatReport(lies));
    expect(lies.medianTake).toBeLessThan(truth.medianTake);
  });

  it('the estimate on the planning board tracks what actually happens', () => {
    for (const targetId of ['argent_vine', 'kestrel_gallery', 'port_argent_savings']) {
      const r = simulate({
        targetId,
        approachId: 'stealth',
        crewRoles: ['scout', 'safecracker', 'hacker', 'driver'],
        equipmentIds: ['comms', 'bypass'],
        experienceBias: 1,
        policy: 'cautious',
        runs: 300,
      });
      console.log(formatReport(r));
      const good = (r.grades.perfect + r.grades.clean) / r.runs * 100;
      // The estimate is the chance every stage goes to plan, so it should sit
      // near the clean-or-better rate rather than predicting the take.
      expect(Math.abs(good - r.estimatedChance)).toBeLessThan(30);
    }
  });

  it('produces the occasional night worth telling someone about', () => {
    const r = simulate({
      targetId: 'kestrel_gallery',
      approachId: 'stealth',
      crewRoles: ['scout', 'safecracker', 'hacker', 'driver', 'face'],
      equipmentIds: ['comms', 'bypass', 'drill'],
      intelTopics: ['cameras', 'access'],
      policy: 'bold',
      runs: 500,
    });
    console.log(formatReport(r));
    // Walking out with materially more than the job was worth has to be
    // possible, and has to be rare.
    expect(r.bigScoreRate).toBeGreaterThan(1);
    expect(r.bigScoreRate).toBeLessThan(35);
  });

  it('is reproducible from a seed', () => {
    const a = simulate({ seed: 4242, runs: 60 });
    const b = simulate({ seed: 4242, runs: 60 });
    expect(a).toEqual(b);
  });
});
