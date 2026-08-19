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
  /** Buy the kit the job actually asks for, rather than the cheapest thing. */
  buyForJob: boolean;
  /** Put money into levelling the kit already owned. */
  upgradeKit: boolean;
  /** Put money into crew stats. */
  train: boolean;
  /**
   * Refuse a job whose expected value does not cover the cost of mounting it,
   * and wait for targets to recover instead.
   */
  minJobValue: number;
}

export const DEFAULT_POLICY: CampaignPolicy = {
  crewSize: 4,
  intelBudget: 0.35,
  scout: true,
  heatCeiling: 62,
  hireForWeakness: true,
  buyKit: true,
  buyForJob: true,
  upgradeKit: true,
  train: true,
  minJobValue: 18000,
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
  /** Turns spent waiting for targets to grow back or Heat to fade. */
  waited: number;
  /** Every event id the campaign produced, in order, for repetition checks. */
  eventsFired: string[];
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
  let waited = 0;
  const eventsFired: string[] = [];
  let peakTier = 0;

  for (let job = 0; job < jobs; job++) {
    if (campaign.heat > policy.heatCeiling) campaign = C.lieLow(campaign);

    // Hire until the crew is the size the policy wants. People you have worked
    // with before come first: they are cheaper, they already trust you a
    // little, and rehiring them is how loyalty ever reaches the line where
    // they stop going home after every job.
    let guard = 0;
    while (C.activeCrew(campaign).length < policy.crewSize && guard++ < 10) {
      const wanted = policy.hireForWeakness ? neededRole(campaign, policy) : undefined;
      // Below two people there is nothing to be prudent about: a player with
      // no crew cannot run anything at all, so they spend what it takes to
      // reach a pair and worry about the rest afterwards.
      const share = C.activeCrew(campaign).length < 2 ? 0.9 : 0.3;
      const pool = [...C.contactsAvailable(campaign), ...campaign.market].filter(
        (m) => C.hireCost(m, campaign) <= campaign.bankroll * share,
      );
      const known = pool.filter((m) => campaign.contacts[m.id]);
      const pick =
        (wanted && known.find((m) => m.role === wanted)) ??
        (wanted && pool.find((m) => m.role === wanted)) ??
        known.sort((a, b) => b.loyalty - a.loyalty)[0] ??
        pool.sort((a, b) => a.cost - b.cost)[0];
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

    let choice = pickTarget(campaign, policy);
    if (!choice) {
      stalled++;
      campaign = C.lieLow(campaign);
      continue;
    }

    // Robbing a shop you have already emptied costs days, Heat and a fresh
    // round of hiring fees to bring home almost nothing. When nothing on the
    // board clears the bar the policy waits — but only briefly. Modelling a
    // player with infinite patience makes the game look easier than it is,
    // because sitting still is where all the free recovery lives.
    let patience = 0;
    while (choice.score < policy.minJobValue && patience++ < 2) {
      campaign = C.lieLow(campaign);
      waited++;
      choice = pickTarget(campaign, policy) ?? choice;
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
      // Buy against what this job actually asks for, cheapest qualifying item
      // first, before falling back to filling out the toolbox in general.
      const owned = new Set(campaign.ownedEquipment);
      const carriedTags = new Set(
        EQUIPMENT.filter((e) => owned.has(e.id)).map((e) => e.tag),
      );
      const wantedTags = policy.buyForJob
        ? target.needs.filter((n) => !carriedTags.has(n.tag)).map((n) => n.tag)
        : [];

      const candidates = [...EQUIPMENT]
        .filter((e) => !owned.has(e.id) && e.cost <= campaign.bankroll * 0.3)
        .sort((a, b) => a.cost - b.cost);
      const pick =
        candidates.find((e) => wantedTags.includes(e.tag)) ??
        (policy.buyForJob && wantedTags.length ? undefined : candidates[0]);
      if (pick) campaign = C.buyEquipment(campaign, pick.id);

      if (policy.upgradeKit && campaign.bankroll > 120000) {
        const upgradable = campaign.ownedEquipment
          .filter((id) => C.canUpgradeEquipment(campaign, id))
          .sort((a, b) => C.equipmentUpgradeCost(campaign, a) - C.equipmentUpgradeCost(campaign, b));
        if (upgradable[0]) campaign = C.upgradeEquipment(campaign, upgradable[0]);
      }
    }

    if (policy.train && campaign.bankroll > 90000) {
      // Spend on the person who leads the thinnest stage, in the attribute
      // that stage actually tests.
      const crewNow = C.activeCrew(campaign);
      const preview = C.planFor(
        campaign,
        target.id,
        choice.approachId,
        crewNow.map((m) => m.id),
        campaign.ownedEquipment,
      );
      if (preview && preview.crew.length) {
        const thin = stageOdds(preview).slice().sort((a, b) => a.chance - b.chance)[0];
        const lead = preview.crew.find((m) => m.id === thin.actorId) ?? preview.crew[0];
        if (C.canTrain(lead, thin.attr)) campaign = C.train(campaign, lead.id, thin.attr);
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
    const run = playOut(plan, runSeed, choosePolicy, campaign.seenEventIds);
    campaign = C.completeHeist(campaign, run, plan);

    eventsFired.push(...run.firedEventIds);
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
    waited,
    eventsFired,
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
    meanWaited: mean((r) => r.waited),
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
