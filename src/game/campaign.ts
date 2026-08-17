import { DISTRICTS } from '../data/districts';
import { EQUIPMENT, equipmentById } from '../data/equipment';
import { TARGETS, targetById } from '../data/targets';
import { APPROACHES } from '../data/approaches';
import { generateMarket } from './generation';
import { generateNewsReport } from './news';
import { Stream, seedFrom } from './rng';
import { buyIntel, intelCost, sourceById } from './intel';
import type { Plan } from './calc';
import type {
  ApproachId,
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

export const SAVE_VERSION = 1;
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
    intel: {},
    scouted: {},
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
 */
export function heatSecurityMultiplier(heat: number): number {
  return 1 + heat / 250;
}

export function targetUnderHeat(target: Target, heat: number): Target {
  const mul = heatSecurityMultiplier(heat);
  return {
    ...target,
    security: {
      guards: Math.min(99, Math.round(target.security.guards * mul)),
      cameras: Math.min(99, Math.round(target.security.cameras * mul)),
      alarm: Math.min(99, Math.round(target.security.alarm * mul)),
      accessControl: Math.min(99, Math.round(target.security.accessControl * mul)),
      responseTime: Math.round(target.security.responseTime / mul),
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

export function hireCost(member: CrewMember, campaign: Campaign): number {
  return Math.round((member.cost * crewPriceMultiplier(campaign.heat)) / 100) * 100;
}

export function hire(campaign: Campaign, memberId: string): Campaign {
  const member = campaign.market.find((m) => m.id === memberId);
  if (!member) return campaign;
  const cost = hireCost(member, campaign);
  if (campaign.bankroll < cost) return campaign;

  return {
    ...campaign,
    bankroll: campaign.bankroll - cost,
    market: campaign.market.filter((m) => m.id !== memberId),
    crew: {
      ...campaign.crew,
      [member.id]: {
        member: { ...member, hiredOnDay: campaign.day },
        condition: 'ready',
        availableOnDay: campaign.day,
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

export function ownedEquipment(campaign: Campaign) {
  return EQUIPMENT.filter((e) => campaign.ownedEquipment.includes(e.id));
}

export function scoutPasses(campaign: Campaign, targetId: string): number {
  return campaign.scouted[targetId] ?? 0;
}

export function scout(campaign: Campaign, targetId: string, cost: number): Campaign {
  if (campaign.bankroll < cost) return campaign;
  return {
    ...campaign,
    bankroll: campaign.bankroll - cost,
    day: campaign.day + 1,
    heat: Math.max(0, campaign.heat - 2),
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
    target: targetUnderHeat(target, campaign.heat),
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

  for (const member of plan.crew) {
    const record = crew[member.id];
    if (!record) continue;
    const state = run.crewRun[member.id];
    const loyalty = Math.max(
      0,
      Math.min(100, record.member.loyalty + (result.loyaltyDeltas[member.id] ?? 0)),
    );
    crew[member.id] = {
      ...record,
      jobsRun: record.jobsRun + 1,
      condition: state?.caught ? 'arrested' : state?.injured ? 'injured' : 'ready',
      availableOnDay: state?.injured ? campaign.day + 4 : campaign.day + 1,
      member: {
        ...record.member,
        loyalty,
        // Every third job together is worth a level, to a cap of veteran.
        experience: Math.min(3, record.member.experience + ((record.jobsRun + 1) % 3 === 0 ? 1 : 0)),
      },
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

  const day = campaign.day + 2;
  return {
    ...campaign,
    day,
    bankroll: campaign.bankroll + result.net,
    heat: Math.min(100, campaign.heat + result.heat),
    score: campaign.score + result.gross,
    crew,
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
export const LIE_LOW_HEAT = 14;

export function lieLow(campaign: Campaign): Campaign {
  const day = campaign.day + LIE_LOW_DAYS;
  return {
    ...campaign,
    day,
    heat: Math.max(0, campaign.heat - LIE_LOW_HEAT),
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
  return {
    ...campaign,
    bankroll: campaign.bankroll - EVIDENCE_COST,
    day: campaign.day + 1,
    heat: Math.max(0, campaign.heat - EVIDENCE_HEAT),
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
