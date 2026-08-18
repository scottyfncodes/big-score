import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY, runCampaign, summarise, type CampaignPolicy } from './campaignSim';
import { newCampaign, targetValueMultiplier, completeHeist, planFor, hire, activeCrew } from './campaign';
import { playOut } from './resolve';
import { seedFrom } from './rng';

/**
 * Campaign-level balance.
 *
 * `balance.test.ts` asks whether one job is interesting. These ask the
 * questions that only appear over a dozen of them, and every one of them was
 * written because the headless campaign harness found the opposite. The first
 * run of it produced a campaign that robbed the same jeweller eight times in a
 * row at 99%, then the same gallery seven times, finishing on $2.6M with Heat
 * pinned at 96 and no consequence attached to either.
 */

const sweep = (over: Partial<CampaignPolicy>, n = 40, jobs = 14) =>
  summarise(
    Array.from({ length: n }, (_, i) => runCampaign(500 + i * 37, jobs, { ...DEFAULT_POLICY, ...over })),
  );

describe('progression', () => {
  it('a target is worth much less the second time and recovers slowly', () => {
    let c = newCampaign(seedFrom('deplete'), 'T');
    expect(targetValueMultiplier(c, 'argent_vine')).toBe(1);

    c = { ...c, hits: { argent_vine: { count: 1, lastDay: c.day } } };
    const once = targetValueMultiplier(c, 'argent_vine');
    expect(once).toBeLessThan(0.5);

    c = { ...c, hits: { argent_vine: { count: 3, lastDay: c.day } } };
    expect(targetValueMultiplier(c, 'argent_vine')).toBeLessThan(once);

    // Weeks later, the same shop is worth robbing again.
    const later = { ...c, day: c.day + 40, hits: { argent_vine: { count: 1, lastDay: c.day } } };
    expect(targetValueMultiplier(later, 'argent_vine')).toBeGreaterThan(once);
  });

  it('intel does not survive the job it was bought for', () => {
    let c = newCampaign(seedFrom('intel-expiry'), 'T');
    for (const recruit of c.market.slice(0, 3)) c = hire(c, recruit.id);
    c = { ...c, intel: { argent_vine: [{ topicId: 'vault', sourceId: 'ledger', confidence: 'confirmed', reading: '', boughtOnDay: 1 }] } };

    const plan = planFor(c, 'argent_vine', 'stealth', activeCrew(c).map((m) => m.id), [])!;
    const run = playOut(plan, 4321, (e, ctx) => e.choices.filter((ch) => !ch.when || ch.when(ctx))[0].id);
    c = completeHeist(c, run, plan);

    expect(c.intel.argent_vine).toBeUndefined();
    expect(c.hits.argent_vine.count).toBe(1);
  });

  it('a competent campaign climbs the tiers without running away with it', () => {
    const s = sweep({});
    expect(s.reachedTier2, 'should reach tier 2 most campaigns').toBeGreaterThan(55);
    expect(s.reachedTier3, 'tier 3 should be an achievement').toBeGreaterThan(25);
    expect(s.reachedTier3, 'tier 3 should not be automatic').toBeLessThan(90);
    // Money should grow, but a fourteen-job campaign is not meant to end the
    // economy. The first version of this reached $2.6M and stopped mattering.
    expect(s.meanBankroll).toBeGreaterThan(150000);
    expect(s.meanBankroll).toBeLessThan(2000000);
  });

  it('never traps a campaign in an unwinnable state', () => {
    const s = sweep({});
    expect(s.bankruptRate, 'a sensible player should not go broke').toBeLessThan(15);
    expect(s.meanStalled, 'jobs the player could not mount at all').toBeLessThan(3);
    // The death-spiral check: Heat must not pin at the ceiling forever.
    expect(s.meanHeat).toBeLessThan(90);
  });

  it('failure stays on the table for the whole campaign', () => {
    const s = sweep({});
    const jobs = Object.values(s.gradeMix).reduce((a, b) => a + b, 0);
    const bad = (s.gradeMix.botched + s.gradeMix.catastrophic) / jobs;
    const good = (s.gradeMix.perfect + s.gradeMix.clean) / jobs;
    expect(bad, 'nights that go wrong').toBeGreaterThan(0.06);
    expect(good, 'nights that go right').toBeGreaterThan(0.3);
    expect(good, 'but never a formality').toBeLessThan(0.8);
  });

  it('covering the plan’s weak stage is worth more than hiring cheap', () => {
    const smart = sweep({ hireForWeakness: true });
    const cheap = sweep({ hireForWeakness: false });
    expect(smart.meanBankroll).toBeGreaterThan(cheap.meanBankroll * 1.1);
  });

  it('crew size is a decision, not a slider to maximise', () => {
    const three = sweep({ crewSize: 3 });
    const four = sweep({ crewSize: 4 });
    const six = sweep({ crewSize: 6 });
    // Four should be the sweet spot: better than a thin crew, and better than
    // simply bringing everybody, or the cut is a tax rather than a trade.
    expect(four.meanBankroll).toBeGreaterThan(three.meanBankroll);
    expect(four.meanBankroll).toBeGreaterThan(six.meanBankroll);
  });

  it('buying intel beats buying none', () => {
    const withIntel = sweep({ intelBudget: 0.15 });
    const without = sweep({ intelBudget: 0 });
    const jobsOf = (s: ReturnType<typeof sweep>) =>
      Object.values(s.gradeMix).reduce((a, b) => a + b, 0);
    const goodRate = (s: ReturnType<typeof sweep>) =>
      (s.gradeMix.perfect + s.gradeMix.clean) / jobsOf(s);

    // It has to pay in outcomes, and it must not cost money to do so — a
    // system the optimal player skips is a trap, not a decision.
    expect(goodRate(withIntel)).toBeGreaterThan(goodRate(without));
    expect(withIntel.meanBankroll).toBeGreaterThan(without.meanBankroll * 0.95);
  });

  it('managing heat pays, and ignoring it does not', () => {
    const careful = sweep({ heatCeiling: 40 });
    const reckless = sweep({ heatCeiling: 200 });
    expect(careful.meanBankroll).toBeGreaterThan(reckless.meanBankroll);
    expect(careful.meanHeat).toBeLessThan(reckless.meanHeat);
  });
});
