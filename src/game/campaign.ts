import { DISTRICTS } from '../data/districts';
import {
  EQUIPMENT,
  MAX_EQUIPMENT_LEVEL,
  equipmentAtLevel,
  equipmentById,
  upgradeCost,
} from '../data/equipment';
import { TARGETS, targetById } from '../data/targets';
import { APPROACHES } from '../data/approaches';
import { generateMarket } from './generation';
import { generateNewsReport } from './news';
import { Stream, seedFrom } from './rng';
import { buyIntel, intelCost, sourceById } from './intel';
import type { Plan } from './calc';
import type {
  ApproachId,
  Attribute,
  Campaign,
  CrewMember,
  CrewRecord,
  District,
  HeistResult,
  RunState,
  Target,
} from './types';

/**
 * Everything that happens between jobs.
 *
 * The campaign is a plain object and every function here is
 * `(campaign, args) => campaign`. Nothing in this file knows that React
 * exists, which is what lets the whole progression be tested in a terminal.
 */

export const SAVE_VERSION = 3;
export const STARTING_BANKROLL = 50000;

export const HEAT_TIERS = [
  { min: 0, max: 20, label: 'Unknown', line: 'Nobody in this city knows your name.' },
  { min: 21, max: 40, label: 'Police interest', line: 'A detective has started a folder.' },
  { min: 41, max: 60, label: 'Active investigation', line: 'They are working it. They are not close.' },
  { min: 61, max: 80, label: 'Major task force', line: 'Someone senior has been given your jobs.' },
  { min: 81, max: 100, label: 'Manhunt', line: 'Your face is on a wall in a room you have never been in.' },
];

export function heatTier(heat: number) {
  return HEAT_TIERS.find((t) => heat >= t.min && heat <= t.max) ?? HEAT_TIERS[0];
}

export function newCampaign(seed: number, handle: string): Campaign {
  return {
    version: SAVE_VERSION,
    seed,
    day: 1,
    bankroll: STARTING_BANKROLL,
    heat: 0,
    score: 0,
    crew: {},
    market: generateMarket(seed, 1),
    ownedEquipment: [],
    equipmentLevels: {},
    contacts: {},
    seenEventIds: [],
    intel: {},
    scouted: {},
    hits: {},
    completed: [],
    news: [],
    reports: [],
    handle,
  };
}

/**
 * Heat is not a health bar; it is the city paying attention. It makes every
 * building harder and every professional more expensive, and it is the reason
 * a run of loud successes eventually has to stop.
 *
 * The curve is deliberately convex. A linear multiplier meant that a player
 * sitting at 89 Heat — a manhunt, in fiction — was running 99% jobs, because
 * a flat +36% security was cancelled out by one piece of intel. Gentle below
 * 40, punishing above 70, which is the shape the fiction already claimed.
 */
export function heatSecurityMultiplier(heat: number): number {
  return 1 + Math.pow(heat / 100, 1.5) * 0.75;
}

/**
 * Heat fades on its own, because attention does. Without this the campaign has
 * no valve at all: Heat only ever went up between jobs, so a headless campaign
 * pinned at 100 by job ten and every building in the city became unopenable.
 * Days are the currency that buys it back, and days are what scouting, laying
 * low and the jobs themselves all spend.
 */
export const PASSIVE_DECAY_PER_DAY = 1.5;

/**
 * What a permanent crew costs to keep.
 *
 * This is the other half of the retention bargain. Freelancers are paid per
 * job and go home; retained crew stay, and staying costs money every day
 * whether or not there is work. Without it, waiting is free — Heat fades and
 * targets grow back on their own, so a headless campaign that simply sat still
 * whenever the board looked thin won 95% of the time and never went broke.
 * Days have to cost something, and a payroll is the honest thing for them to
 * cost.
 */
export const UPKEEP_RATE = 0.02;

export function dailyUpkeep(campaign: Campaign): number {
  return Object.values(campaign.crew ?? {})
    .filter((r) => r.retained)
    .reduce((sum, r) => sum + r.member.cost * UPKEEP_RATE, 0);
}

export function advanceDays(campaign: Campaign, days: number): Campaign {
  const owed = Math.round(dailyUpkeep(campaign) * days);
  const paid = Math.min(owed, campaign.bankroll);
  const short = owed - paid;

  // Missing the retainer is noticed immediately and costs more than the money.
  const crew = short > 0
    ? Object.fromEntries(
        Object.entries(campaign.crew).map(([id, record]) => [
          id,
          record.retained
            ? { ...record, member: { ...record.member, loyalty: Math.max(0, record.member.loyalty - 4) } }
            : record,
        ]),
      )
    : campaign.crew;

  return {
    ...campaign,
    day: campaign.day + days,
    bankroll: campaign.bankroll - paid,
    crew,
    heat: Math.max(0, Math.round(campaign.heat - days * PASSIVE_DECAY_PER_DAY)),
  };
}

/**
 * What a target is worth on its Nth robbery.
 *
 * A jeweller that has been done eight times does not still have the same
 * safe. Without this the optimal campaign is one target on repeat, which is
 * exactly what the first headless campaign run did: eight consecutive jobs on
 * the same shop, then seven on the same gallery. Value collapses on a hit and
 * recovers over weeks, so the city — and the tier ladder — is the thing that
 * keeps a campaign moving.
 */
export const HIT_VALUE_FLOOR = 0.12;
export const HIT_RECOVERY_PER_DAY = 0.02;

export function targetHits(campaign: Campaign, targetId: string) {
  return campaign.hits?.[targetId] ?? { count: 0, lastDay: 0 };
}

/**
 * A robbed target grows back, but never all the way.
 *
 * The ceiling matters more than the recovery rate. When a target could return
 * to full value given enough days, infinite patience became infinite money: a
 * headless campaign that simply waited whenever the board looked thin reached
 * tier 3 in 98% of runs and produced one catastrophe in five hundred jobs.
 * Somewhere permanent has to be lost each time, so that the city is a finite
 * resource and climbing the tiers is the only way to keep earning.
 */
export function recoveryCeiling(count: number): number {
  return Math.max(0.25, 1 - count * 0.18);
}

export function targetValueMultiplier(campaign: Campaign, targetId: string): number {
  const { count, lastDay } = targetHits(campaign, targetId);
  if (count === 0) return 1;
  const emptied = Math.pow(0.35, count);
  const recovered = emptied + (campaign.day - lastDay) * HIT_RECOVERY_PER_DAY;
  return Math.max(HIT_VALUE_FLOOR, Math.min(recoveryCeiling(count), recovered));
}

/**
 * Somebody fixes the thing you exploited. Every hit hardens the building —
 * but only so far. There is a limit to what a jeweller can install, and
 * uncapped hardening stacked on top of Heat turned a corner shop into
 * something harder than the casino.
 */
export const MAX_HARDENING_HITS = 3;

export function targetHardening(campaign: Campaign, targetId: string): number {
  return 1 + Math.min(targetHits(campaign, targetId).count, MAX_HARDENING_HITS) * 0.13;
}

/**
 * Heat and hardening are separate pressures and they must not multiply away.
 * The cap is the promise that no job is ever arithmetically impossible — a
 * plan can be a terrible idea, but it always has to be an idea.
 */
export const MAX_SECURITY_MULTIPLIER = 1.9;

/** The target as the crew will actually find it: Heat, plus its own history. */
export function targetAsFound(campaign: Campaign, target: Target): Target {
  const mul = Math.min(
    MAX_SECURITY_MULTIPLIER,
    heatSecurityMultiplier(campaign.heat) * targetHardening(campaign, target.id),
  );
  return {
    ...target,
    value: Math.round(target.value * targetValueMultiplier(campaign, target.id)),
    security: {
      guards: Math.min(99, Math.round(target.security.guards * mul)),
      cameras: Math.min(99, Math.round(target.security.cameras * mul)),
      alarm: Math.min(99, Math.round(target.security.alarm * mul)),
      accessControl: Math.min(99, Math.round(target.security.accessControl * mul)),
      responseTime: Math.max(120, Math.round(target.security.responseTime / mul)),
    },
  };
}

/** Kept for tests and callers that only want the Heat half of the picture. */
export function targetUnderHeat(target: Target, heat: number): Target {
  const mul = heatSecurityMultiplier(heat);
  return {
    ...target,
    security: {
      guards: Math.min(99, Math.round(target.security.guards * mul)),
      cameras: Math.min(99, Math.round(target.security.cameras * mul)),
      alarm: Math.min(99, Math.round(target.security.alarm * mul)),
      accessControl: Math.min(99, Math.round(target.security.accessControl * mul)),
      responseTime: Math.max(120, Math.round(target.security.responseTime / mul)),
    },
  };
}

export function crewPriceMultiplier(heat: number): number {
  return 1 + heat / 160;
}

export function unlockedDistricts(campaign: Campaign): District[] {
  return DISTRICTS.filter((d) => campaign.score >= d.unlockAtScore);
}

export function availableTargets(campaign: Campaign): Target[] {
  const open = new Set(unlockedDistricts(campaign).map((d) => d.id));
  return TARGETS.filter(
    (t) => open.has(t.districtId) && campaign.score >= t.unlockAtScore,
  );
}

export function nextUnlock(campaign: Campaign): { name: string; at: number } | undefined {
  const locked = [...DISTRICTS, ...TARGETS]
    .map((entry) => ({
      name: entry.name,
      at: 'unlockAtScore' in entry ? entry.unlockAtScore : 0,
    }))
    .filter((entry) => entry.at > campaign.score)
    .sort((a, b) => a.at - b.at);
  return locked[0];
}

export function activeCrew(campaign: Campaign): CrewMember[] {
  return Object.values(campaign.crew)
    .filter((r) => r.condition === 'ready' && r.availableOnDay <= campaign.day)
    .map((r) => r.member);
}

export function crewRecords(campaign: Campaign): CrewRecord[] {
  return Object.values(campaign.crew);
}

/**
 * Loyalty, and who is actually yours.
 *
 * Below the line, everyone on the payroll is a freelancer: they take the fee,
 * they take the cut, and after the job they go home. You hire them again next
 * time, and they remember you — loyalty carries across every rehire, so the
 * climb to a permanent crew is the campaign's real progression. Above the
 * line, they stay, and they stop being a line item you re-pay every job.
 */
export const LOYALTY_RETAIN = 60;

export function isRetained(member: CrewMember): boolean {
  return member.loyalty >= LOYALTY_RETAIN;
}

export function hireCost(member: CrewMember, campaign: Campaign): number {
  // Somebody who has worked for you before, and liked it, asks for less.
  const known = campaign.contacts?.[member.id];
  const familiarity = known ? 1 - Math.min(0.55, member.loyalty / 140) : 1;
  return (
    Math.round((member.cost * crewPriceMultiplier(campaign.heat) * familiarity) / 100) * 100
  );
}

/** People you have worked with who are not currently on the payroll. */
export function contactsAvailable(campaign: Campaign): CrewMember[] {
  return Object.values(campaign.contacts ?? {})
    .filter((m) => !campaign.crew[m.id])
    .sort((a, b) => b.loyalty - a.loyalty);
}

export function hire(campaign: Campaign, memberId: string): Campaign {
  const member =
    campaign.market.find((m) => m.id === memberId) ?? campaign.contacts?.[memberId];
  if (!member || campaign.crew[memberId]) return campaign;
  const cost = hireCost(member, campaign);
  if (campaign.bankroll < cost) return campaign;

  return {
    ...campaign,
    bankroll: campaign.bankroll - cost,
    market: campaign.market.filter((m) => m.id !== memberId),
    contacts: { ...campaign.contacts, [member.id]: member },
    crew: {
      ...campaign.crew,
      [member.id]: {
        member: { ...member, hiredOnDay: campaign.day },
        condition: 'ready',
        availableOnDay: campaign.day,
        retained: isRetained(member),
        jobsRun: 0,
        bonds: {},
      },
    },
  };
}

export function release(campaign: Campaign, memberId: string): Campaign {
  const crew = { ...campaign.crew };
  delete crew[memberId];
  return { ...campaign, crew };
}

export function buyEquipment(campaign: Campaign, equipmentId: string): Campaign {
  const item = equipmentById(equipmentId);
  if (!item || campaign.ownedEquipment.includes(equipmentId)) return campaign;
  if (campaign.bankroll < item.cost) return campaign;
  return {
    ...campaign,
    bankroll: campaign.bankroll - item.cost,
    ownedEquipment: [...campaign.ownedEquipment, equipmentId],
  };
}

/** Owned kit, resolved to the level the player has paid for. */
export function ownedEquipment(campaign: Campaign) {
  return EQUIPMENT.filter((e) => campaign.ownedEquipment.includes(e.id)).map((e) =>
    equipmentAtLevel(e, equipmentLevel(campaign, e.id)),
  );
}

export function equipmentLevel(campaign: Campaign, id: string): number {
  return campaign.equipmentLevels?.[id] ?? 1;
}

export function canUpgradeEquipment(campaign: Campaign, id: string): boolean {
  return (
    campaign.ownedEquipment.includes(id) && equipmentLevel(campaign, id) < MAX_EQUIPMENT_LEVEL
  );
}

export function equipmentUpgradeCost(campaign: Campaign, id: string): number {
  const item = equipmentById(id);
  if (!item) return 0;
  return upgradeCost(item, equipmentLevel(campaign, id));
}

/**
 * Better kit is bought, not found. The upgrade buys two things at once: a
 * bigger bonus, and a tool that is far likelier to work at all on the night —
 * which is the half that actually changes how a plan feels to commit to.
 */
export function upgradeEquipment(campaign: Campaign, id: string): Campaign {
  if (!canUpgradeEquipment(campaign, id)) return campaign;
  const cost = equipmentUpgradeCost(campaign, id);
  if (campaign.bankroll < cost) return campaign;
  return {
    ...campaign,
    bankroll: campaign.bankroll - cost,
    equipmentLevels: {
      ...campaign.equipmentLevels,
      [id]: equipmentLevel(campaign, id) + 1,
    },
  };
}

/* ---------------------------------------------------------------- training */

export const TRAINING_STEP = 5;
export const TRAINING_CAP = 95;

/**
 * Paying somebody to get better at the thing they already do.
 *
 * Cost climbs steeply with the stat, so raising a specialist's best attribute
 * is a real investment and rounding out a weak one is cheap. That is the shape
 * that makes the planning board's per-stage attributes matter: you can either
 * hire the person who covers the gap, or make one of yours cover it.
 */
export function trainingCost(member: CrewMember, attr: Attribute): number {
  const current = member.stats[attr];
  return Math.round((900 + Math.pow(current / 10, 2.6) * 42) / 100) * 100;
}

export function canTrain(member: CrewMember, attr: Attribute): boolean {
  return member.stats[attr] < TRAINING_CAP;
}

export function train(campaign: Campaign, memberId: string, attr: Attribute): Campaign {
  const record = campaign.crew[memberId];
  if (!record || !canTrain(record.member, attr)) return campaign;
  const cost = trainingCost(record.member, attr);
  if (campaign.bankroll < cost) return campaign;

  const next = advanceDays(campaign, 1);
  const member: CrewMember = {
    ...record.member,
    stats: {
      ...record.member.stats,
      [attr]: Math.min(TRAINING_CAP, record.member.stats[attr] + TRAINING_STEP),
    },
    trained: (record.member.trained ?? 0) + 1,
    // Time and money spent on somebody is noticed.
    loyalty: Math.min(100, record.member.loyalty + 2),
  };

  return {
    ...next,
    bankroll: next.bankroll - cost,
    crew: { ...next.crew, [memberId]: { ...record, member } },
    contacts: { ...next.contacts, [memberId]: member },
  };
}

export function scoutPasses(campaign: Campaign, targetId: string): number {
  return campaign.scouted[targetId] ?? 0;
}

export function scout(campaign: Campaign, targetId: string, cost: number): Campaign {
  if (campaign.bankroll < cost) return campaign;
  const next = advanceDays(campaign, 1);
  return {
    ...next,
    bankroll: next.bankroll - cost,
    scouted: { ...campaign.scouted, [targetId]: scoutPasses(campaign, targetId) + 1 },
  };
}

export function heldIntel(campaign: Campaign, targetId: string) {
  return campaign.intel[targetId] ?? [];
}

export function purchaseIntel(
  campaign: Campaign,
  targetId: string,
  topicId: string,
  sourceId: string,
): Campaign {
  const target = targetById(targetId);
  const source = sourceById(sourceId);
  const topic = target?.topics.find((t) => t.id === topicId);
  if (!target || !source || !topic) return campaign;
  if (heldIntel(campaign, targetId).some((i) => i.topicId === topicId)) return campaign;

  const crew = activeCrew(campaign);
  const cost = intelCost(topic, source, crew);
  if (campaign.bankroll < cost) return campaign;

  const stream = new Stream(
    campaign.seed,
    seedFrom(`${targetId}:${topicId}:${sourceId}:${campaign.day}`) % 100000,
  );
  const intel = buyIntel(stream, topic, source, campaign.day, crew);

  return {
    ...campaign,
    bankroll: campaign.bankroll - cost,
    intel: {
      ...campaign.intel,
      [targetId]: [...heldIntel(campaign, targetId), intel],
    },
  };
}

/** The plan as the engine will read it, with Heat already applied. */
export function planFor(
  campaign: Campaign,
  targetId: string,
  approachId: ApproachId,
  crewIds: string[],
  equipmentIds: string[],
): Plan | undefined {
  const target = targetById(targetId);
  if (!target) return undefined;
  const crew = activeCrew(campaign).filter((m) => crewIds.includes(m.id));
  return {
    target: targetAsFound(campaign, target),
    approach: APPROACHES[approachId],
    crew,
    equipment: ownedEquipment(campaign).filter((e) => equipmentIds.includes(e.id)),
    intel: heldIntel(campaign, targetId),
  };
}

export function approachesFor(campaign: Campaign, target: Target): ApproachId[] {
  const held = new Set(heldIntel(campaign, target.id).map((i) => i.topicId));
  return target.approaches.filter((id) => {
    const requires = APPROACHES[id].requiresTopic;
    return !requires || held.has(requires);
  });
}

/** Applies a finished run to the campaign: money, Heat, crew, paper, day. */
export function completeHeist(campaign: Campaign, run: RunState, plan: Plan): Campaign {
  const result: HeistResult = run.outcome!;
  const crew = { ...campaign.crew };

  const contacts = { ...campaign.contacts };
  const walkedAway: string[] = [];

  for (const member of plan.crew) {
    const record = crew[member.id];
    if (!record) continue;
    const state = run.crewRun[member.id];
    const loyalty = Math.max(
      0,
      Math.min(100, record.member.loyalty + (result.loyaltyDeltas[member.id] ?? 0)),
    );
    const updated: CrewMember = {
      ...record.member,
      loyalty,
      jobsWithYou: (record.member.jobsWithYou ?? 0) + 1,
      // Every third job together is worth a level, to a cap of veteran.
      experience: Math.min(3, record.member.experience + ((record.jobsRun + 1) % 3 === 0 ? 1 : 0)),
    };

    // Whatever happens, you now know them and they now know you.
    contacts[member.id] = updated;

    const held = state?.caught;
    const retained = record.retained || isRetained(updated);

    // A freelancer who has not been won over goes home after the job. They can
    // be hired back — with the loyalty they left with — which is what makes
    // repeat work the way a crew is actually built. Anyone in custody stays on
    // the books, because somebody has to decide whether to post their bail.
    if (!retained && !held) {
      delete crew[member.id];
      walkedAway.push(member.id);
      continue;
    }

    crew[member.id] = {
      ...record,
      jobsRun: record.jobsRun + 1,
      retained,
      condition: held ? 'arrested' : state?.injured ? 'injured' : 'ready',
      availableOnDay: state?.injured ? campaign.day + 4 : campaign.day + 1,
      member: updated,
    };
  }

  const story = generateNewsReport({
    result,
    target: plan.target,
    crew: plan.crew,
    day: campaign.day,
    seed: run.seed,
    cursor: run.cursor + 3,
  });

  // The job itself takes two days, and the payroll runs on both of them.
  const paidUp = advanceDays(campaign, 2);
  const day = paidUp.day;

  // Intel about a target does not survive robbing it. The rotation changes,
  // the inside man is questioned or resigns, the locks are replaced. Keeping
  // it made the Inside Job a permanent 99% on any target you had ever bought
  // an insider for; discarding it puts the intel decision back on every run.
  const intel = { ...campaign.intel };
  delete intel[plan.target.id];

  const previous = targetHits(campaign, plan.target.id);

  return {
    ...campaign,
    day,
    bankroll: paidUp.bankroll + result.net,
    heat: Math.max(0, Math.min(100, campaign.heat + result.heat - 2 * PASSIVE_DECAY_PER_DAY)),
    score: campaign.score + result.gross,
    intel,
    hits: {
      ...campaign.hits,
      [plan.target.id]: { count: previous.count + 1, lastDay: day },
    },
    crew,
    contacts,
    walkedAway,
    seenEventIds: [...new Set([...(campaign.seenEventIds ?? []), ...run.firedEventIds])],
    market: generateMarket(
      campaign.seed,
      day,
      6,
      result.gross > 200000 ? 1 : 0,
      Object.values(crew).map((r) => r.member.name.split(' ')[0]),
    ),
    completed: [...campaign.completed, plan.target.id],
    news: [story, ...campaign.news].slice(0, 20),
    reports: [result, ...campaign.reports].slice(0, 20),
    lastReport: result,
    run: undefined,
  };
}

export const LIE_LOW_DAYS = 3;
export const LIE_LOW_BASE = 10;

/**
 * Relief scales with the Heat it is relieving. A flat number meant that at 90
 * Heat — the point where the player most needs a way back — three days bought
 * almost nothing, and the campaign had no recovery from a bad run of jobs.
 */
export function lieLowRelief(heat: number): number {
  return Math.round(LIE_LOW_BASE + heat * 0.15 + LIE_LOW_DAYS * PASSIVE_DECAY_PER_DAY);
}

export function lieLow(campaign: Campaign): Campaign {
  const next = advanceDays(campaign, LIE_LOW_DAYS);
  const day = next.day;
  return {
    ...next,
    heat: Math.max(0, campaign.heat - lieLowRelief(campaign.heat)),
    market: generateMarket(
      campaign.seed,
      day,
      6,
      0,
      Object.values(campaign.crew).map((r) => r.member.name.split(' ')[0]),
    ),
    crew: Object.fromEntries(
      Object.entries(campaign.crew).map(([id, record]) => [
        id,
        record.availableOnDay <= day && record.condition === 'injured'
          ? { ...record, condition: 'ready' as const }
          : record,
      ]),
    ),
  };
}

export const EVIDENCE_COST = 20000;
export const EVIDENCE_HEAT = 18;

/** Money straight into the fire, in exchange for a quieter city. */
export function destroyEvidence(campaign: Campaign): Campaign {
  if (campaign.bankroll < EVIDENCE_COST) return campaign;
  const next = advanceDays(campaign, 1);
  return {
    ...next,
    bankroll: next.bankroll - EVIDENCE_COST,
    heat: Math.max(0, next.heat - EVIDENCE_HEAT),
  };
}

/** Bail. Expensive, and the only way an arrested crew member comes back. */
export function bailCost(member: CrewMember): number {
  return Math.round((25000 + member.cost * 2) / 500) * 500;
}

export function bailOut(campaign: Campaign, memberId: string): Campaign {
  const record = campaign.crew[memberId];
  if (!record || record.condition !== 'arrested') return campaign;
  const cost = bailCost(record.member);
  if (campaign.bankroll < cost) return campaign;
  return {
    ...campaign,
    bankroll: campaign.bankroll - cost,
    heat: Math.min(100, campaign.heat + 5),
    day: campaign.day + 1,
    crew: {
      ...campaign.crew,
      [memberId]: {
        ...record,
        condition: 'ready',
        availableOnDay: campaign.day + 1,
        member: { ...record.member, loyalty: Math.min(100, record.member.loyalty + 15) },
      },
    },
  };
}
