import { APPROACHES } from '../data/approaches';
import { EQUIPMENT } from '../data/equipment';
import { ROLE_ORDER } from '../data/crew';
import { STAGE_PROFILES } from './stages';
import * as C from './campaign';
import { analysePlan, stageOdds, type Plan } from './calc';
import { playOut } from './resolve';
import { seedFrom } from './rng';
import { intelCost } from './intel';
import type { ApproachId, Campaign, CrewRole, Grade, EventContext, GameEvent } from './types';

/**
 * A whole campaign, played headlessly by a policy.
 *
 * The single-heist harness in `sim.ts` answers "is one job interesting". This
 * answers the questions that only appear over fifteen jobs: does the bankroll
 * grow or stall, does Heat spiral past the point of return, does the player
 * ever actually reach tier 2 and 3, and is a bigger crew simply better.
 *
 * The policy below is a deliberately competent-but-not-optimal player. If a
 * plain-sensible strategy cannot make progress, the economy is wrong; if it
 * cannot fail, the game is.
 */

export interface CampaignPolicy {
  /** How many people the policy will put on a job. */
  crewSize: number;
  /** Buy intel while it costs less than this share of the bankroll. */
  intelBudget: number;
  /** Scout before running. */
  scout: boolean;
  /** Lie low above this Heat. */
  heatCeiling: number;
  /** Hire to cover the plan's weakest stage rather than the cheapest body. */
  hireForWeakness: boolean;
  /** Buy equipment when it is affordable. */
  buyKit: boolean;
}

export const DEFAULT_POLICY: CampaignPolicy = {
  crewSize: 4,
  intelBudget: 0.35,
  scout: true,
  heatCeiling: 62,
  hireForWeakness: true,
  buyKit: true,
};

export interface JobRecord {
  day: number;
  targetId: string;
  tier: number;
  approach: string;
  crew: number;
  estimate: number;
  grade: Grade;
  gross: number;
  net: number;
  heatAfter: number;
  bankrollAfter: number;
  arrests: number;
}

export interface CampaignReport {
  jobs: JobRecord[];
  finalBankroll: number;
  finalHeat: number;
  finalScore: number;
  peakTier: number;
  days: number;
  bankrupt: boolean;
  /** Jobs the policy wanted to run but could not afford a crew for. */
  stalled: number;
}

const choosePolicy = (event: GameEvent, ctx: EventContext): string => {
  const usable = event.choices.filter((c) => !c.when || c.when(ctx));
  // Never abort, prefer a choice with a check the crew can actually pass,
  // otherwise take the certain option.
  const real = usable.filter((c) => c.id !== 'abort');
  const passable = real.find((c) => c.check && ctx.scoreFor(c.check.attr) > c.check.dc + 10);
  return (passable ?? real[0] ?? usable[0]).id;
};

/** Best affordable job, by expected value against what the crew can bring. */
function pickTarget(campaign: Campaign, policy: CampaignPolicy) {
  const crew = C.activeCrew(campaign);
  if (crew.length < 2) return undefined;
  const crewIds = crew.slice(0, policy.crewSize).map((m) => m.id);

  let best: { targetId: string; approachId: ApproachId; score: number } | undefined;
  for (const target of C.availableTargets(campaign)) {
    for (const approachId of C.approachesFor(campaign, target)) {
      const plan = C.planFor(campaign, target.id, approachId, crewIds, campaign.ownedEquipment);
      if (!plan) continue;
      const analysis = analysePlan(plan);
      // Expected value, discounted by the Heat the approach will cost.
      const score = analysis.expectedTake * (analysis.successChance / 100) - analysis.heat * 3000;
      if (!best || score > best.score) best = { targetId: target.id, approachId, score };
    }
  }
  return best;
}

/** The role that covers the thinnest stage of the plan the policy would run. */
function neededRole(campaign: Campaign, policy: CampaignPolicy): CrewRole | undefined {
  const pick = pickTarget(campaign, policy);
  const have = new Set(C.activeCrew(campaign).map((m) => m.role));
  if (!pick) {
    return ROLE_ORDER.find((role) => !have.has(role));
  }
  const crewIds = C.activeCrew(campaign).slice(0, policy.crewSize).map((m) => m.id);
  const plan = C.planFor(campaign, pick.targetId, pick.approachId, crewIds, campaign.ownedEquipment);
  if (!plan) return undefined;
  const weakest = stageOdds(plan).slice().sort((a, b) => a.chance - b.chance)[0];
  const wanted = STAGE_PROFILES[weakest.stage].role;
  return have.has(wanted) ? ROLE_ORDER.find((r) => !have.has(r)) : wanted;
}

export function runCampaign(
  seed: number,
  jobs = 15,
  policy: CampaignPolicy = DEFAULT_POLICY,
): CampaignReport {
  let campaign = C.newCampaign(seed, 'Sim');
  const records: JobRecord[] = [];
  let stalled = 0;
  let peakTier = 0;

  for (let job = 0; job < jobs; job++) {
    if (campaign.heat > policy.heatCeiling) campaign = C.lieLow(campaign);

    // Hire until the crew is the size the policy wants.
    let guard = 0;
    while (C.activeCrew(campaign).length < policy.crewSize && guard++ < 8) {
      const wanted = policy.hireForWeakness ? neededRole(campaign, policy) : undefined;
      const affordable = campaign.market
        .filter((m) => C.hireCost(m, campaign) <= campaign.bankroll * 0.3)
        .sort((a, b) => a.cost - b.cost);
      const pick =
        (wanted && affordable.find((m) => m.role === wanted)) ?? affordable[0];
      if (!pick) break;
      const before = campaign.bankroll;
      campaign = C.hire(campaign, pick.id);
      if (campaign.bankroll === before) break;
    }

    if (C.activeCrew(campaign).length < 2) {
      stalled++;
      campaign = C.lieLow(campaign);
      continue;
    }

    const choice = pickTarget(campaign, policy);
    if (!choice) {
      stalled++;
      campaign = C.lieLow(campaign);
      continue;
    }

    const target = C.availableTargets(campaign).find((t) => t.id === choice.targetId)!;
    peakTier = Math.max(peakTier, target.tier);

    if (policy.scout) {
      const cost = C.scoutPasses(campaign, target.id) === 0 ? 0 : -1;
      if (cost === 0) {
        const scoutCost = Math.round(1500 * (1 + target.tier * 0.4));
        if (campaign.bankroll > scoutCost * 3) campaign = C.scout(campaign, target.id, scoutCost);
      }
    }

    // Buy intel, cheapest useful first, while it stays inside the budget.
    const budget = campaign.bankroll * policy.intelBudget;
    let spent = 0;
    for (const topic of [...target.topics].sort((a, b) => a.cost - b.cost)) {
      const source = topic.cost > 5000 ? 'pawn' : 'ledger';
      const price = intelCost(topic, { id: source, name: '', reliability: 0, costMul: source === 'ledger' ? 1.6 : 1 }, C.activeCrew(campaign));
      if (spent + price > budget) continue;
      const before = campaign.bankroll;
      campaign = C.purchaseIntel(campaign, target.id, topic.id, source);
      spent += before - campaign.bankroll;
    }

    if (policy.buyKit) {
      for (const item of [...EQUIPMENT].sort((a, b) => a.cost - b.cost)) {
        if (campaign.ownedEquipment.includes(item.id)) continue;
        if (item.cost > campaign.bankroll * 0.25) continue;
        campaign = C.buyEquipment(campaign, item.id);
        break;
      }
    }

    // Re-pick with the intel and kit now in hand.
    const final = pickTarget(campaign, policy) ?? choice;
    const crewIds = C.activeCrew(campaign).slice(0, policy.crewSize).map((m) => m.id);
    const plan: Plan | undefined = C.planFor(
      campaign,
      final.targetId,
      final.approachId,
      crewIds,
      campaign.ownedEquipment,
    );
    if (!plan || plan.crew.length < 2) {
      stalled++;
      continue;
    }

    const estimate = analysePlan(plan).successChance;
    const runSeed = seedFrom(`${campaign.seed}:${final.targetId}:${campaign.day}`);
    const run = playOut(plan, runSeed, choosePolicy);
    campaign = C.completeHeist(campaign, run, plan);

    const outcome = run.outcome!;
    records.push({
      day: campaign.day,
      targetId: final.targetId,
      tier: plan.target.tier,
      approach: APPROACHES[final.approachId].name,
      crew: plan.crew.length,
      estimate,
      grade: outcome.grade,
      gross: outcome.gross,
      net: outcome.net,
      heatAfter: campaign.heat,
      bankrollAfter: campaign.bankroll,
      arrests: outcome.arrests,
    });
  }

  return {
    jobs: records,
    finalBankroll: campaign.bankroll,
    finalHeat: campaign.heat,
    finalScore: campaign.score,
    peakTier,
    days: campaign.day,
    bankrupt: campaign.bankroll < 3000,
    stalled,
  };
}

export function summarise(reports: CampaignReport[]) {
  const n = reports.length;
  const mean = (fn: (r: CampaignReport) => number) =>
    Math.round(reports.reduce((s, r) => s + fn(r), 0) / n);
  const grades = reports.flatMap((r) => r.jobs.map((j) => j.grade));
  const tally = (g: Grade) => grades.filter((x) => x === g).length;

  return {
    campaigns: n,
    meanBankroll: mean((r) => r.finalBankroll),
    meanHeat: mean((r) => r.finalHeat),
    meanScore: mean((r) => r.finalScore),
    meanDays: mean((r) => r.days),
    meanJobsRun: mean((r) => r.jobs.length),
    meanStalled: mean((r) => r.stalled),
    bankruptRate: Math.round((reports.filter((r) => r.bankrupt).length / n) * 100),
    reachedTier2: Math.round((reports.filter((r) => r.peakTier >= 2).length / n) * 100),
    reachedTier3: Math.round((reports.filter((r) => r.peakTier >= 3).length / n) * 100),
    gradeMix: {
      perfect: tally('perfect'),
      clean: tally('clean'),
      messy: tally('messy'),
      botched: tally('botched'),
      catastrophic: tally('catastrophic'),
    },
  };
}
