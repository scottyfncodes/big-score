import { describe, expect, it } from 'vitest';
import {
  STARTING_BANKROLL,
  activeCrew,
  availableTargets,
  buyEquipment,
  completeHeist,
  heatTier,
  hire,
  hireCost,
  lieLow,
  newCampaign,
  planFor,
  purchaseIntel,
  scout,
  targetUnderHeat,
} from './campaign';
import { playOut } from './resolve';
import { seedFrom } from './rng';
import { targetById } from '../data/targets';

const fresh = () => newCampaign(seedFrom('campaign-test'), 'Test');

describe('campaign', () => {
  it('starts with a bankroll, no crew and three open districts', () => {
    const c = fresh();
    expect(c.bankroll).toBe(STARTING_BANKROLL);
    expect(activeCrew(c)).toHaveLength(0);
    expect(availableTargets(c).length).toBeGreaterThanOrEqual(3);
    // One tier 2 job is visible from day one on purpose: the campaign needs a
    // stretch target in view before the player can afford it.
    expect(availableTargets(c).filter((t) => t.tier === 1).length).toBeGreaterThanOrEqual(3);
    expect(availableTargets(c).some((t) => t.tier >= 3)).toBe(false);
  });

  it('hiring spends money and puts someone on the payroll', () => {
    let c = fresh();
    const recruit = c.market[0];
    const cost = hireCost(recruit, c);
    c = hire(c, recruit.id);
    expect(c.bankroll).toBe(STARTING_BANKROLL - cost);
    expect(activeCrew(c).map((m) => m.id)).toContain(recruit.id);
    expect(c.market.map((m) => m.id)).not.toContain(recruit.id);
  });

  it('will not sell you anything you cannot afford', () => {
    const c = { ...fresh(), bankroll: 100 };
    expect(buyEquipment(c, 'drill')).toBe(c);
    expect(scout(c, 'argent_vine', 5000)).toBe(c);
    expect(purchaseIntel(c, 'argent_vine', 'vault', 'ledger')).toBe(c);
  });

  it('intel is bought once, from a named source, and can be a lie', () => {
    let c = fresh();
    const before = c.bankroll;
    c = purchaseIntel(c, 'argent_vine', 'vault', 'street');
    expect(c.intel.argent_vine).toHaveLength(1);
    expect(c.bankroll).toBeLessThan(before);
    const again = purchaseIntel(c, 'argent_vine', 'vault', 'ledger');
    expect(again.intel.argent_vine).toHaveLength(1);
    expect(again.bankroll).toBe(c.bankroll);
  });

  it('the street sells more lies than the ledger does', () => {
    let confirmedFromLedger = 0;
    let confirmedFromStreet = 0;
    for (let i = 0; i < 120; i++) {
      const c = newCampaign(seedFrom(`lies-${i}`), 'T');
      const a = purchaseIntel(c, 'argent_vine', 'vault', 'ledger');
      const b = purchaseIntel(c, 'argent_vine', 'vault', 'street');
      if (a.intel.argent_vine[0].confidence === 'confirmed') confirmedFromLedger++;
      if (b.intel.argent_vine[0].confidence === 'confirmed') confirmedFromStreet++;
    }
    expect(confirmedFromLedger).toBeGreaterThan(confirmedFromStreet);
  });

  it('heat hardens every building in the city', () => {
    const target = targetById('argent_vine')!;
    const hot = targetUnderHeat(target, 80);
    expect(hot.security.guards).toBeGreaterThan(target.security.guards);
    expect(hot.security.responseTime).toBeLessThan(target.security.responseTime);
    expect(heatTier(80).label).toBe('Major task force');
    expect(heatTier(0).label).toBe('Unknown');
  });

  it('laying low costs days and buys quiet', () => {
    const c = { ...fresh(), heat: 40 };
    const after = lieLow(c);
    expect(after.heat).toBeLessThan(c.heat);
    expect(after.day).toBeGreaterThan(c.day);
  });

  it('runs a whole job and banks the result', () => {
    let c = fresh();
    for (const recruit of c.market.slice(0, 4)) c = hire(c, recruit.id);
    const crewIds = activeCrew(c).map((m) => m.id);
    const plan = planFor(c, 'argent_vine', 'stealth', crewIds, [])!;
    const run = playOut(plan, 1234, (event, ctx) => {
      const usable = event.choices.filter((ch) => !ch.when || ch.when(ctx));
      return usable[0].id;
    });
    expect(run.outcome).toBeDefined();

    const before = c.bankroll;
    c = completeHeist(c, run, plan);
    expect(c.bankroll).toBe(before + run.outcome!.net);
    expect(c.heat).toBe(run.outcome!.heat);
    expect(c.news).toHaveLength(1);
    expect(c.news[0].headline.length).toBeGreaterThan(5);
    expect(c.day).toBeGreaterThan(1);
    expect(c.score).toBe(run.outcome!.gross);
  });

  it('the same seed and the same decisions produce the same night', () => {
    let c = fresh();
    for (const recruit of c.market.slice(0, 4)) c = hire(c, recruit.id);
    const plan = planFor(c, 'argent_vine', 'stealth', activeCrew(c).map((m) => m.id), [])!;
    const policy = (event: { choices: { id: string }[] }) => event.choices[0].id;
    const a = playOut(plan, 77, policy as never);
    const b = playOut(plan, 77, policy as never);
    expect(a.outcome).toEqual(b.outcome);
    expect(a.log).toEqual(b.log);
  });
});
