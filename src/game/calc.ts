import { TRAITS } from '../data/traits';
import { STAGE_LIST, STAGE_PROFILES } from './stages';
import type {
  Approach,
  Attribute,
  CrewMember,
  CrewRole,
  CrewRunState,
  Equipment,
  Intel,
  StageId,
  Target,
} from './types';

/**
 * Every number the player is shown comes from this file.
 *
 * The one rule that matters here: estimates are computed from what the player
 * *believes*, and resolution is computed from what is *true*. Those are two
 * different functions on purpose — buying bad intel should move the number on
 * the planning board, because otherwise the lie is not a lie, it is just a
 * dead purchase.
 */

export interface Plan {
  target: Target;
  approach: Approach;
  crew: CrewMember[];
  equipment: Equipment[];
  intel: Intel[];
  /** Live run modifiers. Absent while planning. */
  runStates?: Record<string, CrewRunState>;
  deadKitIds?: string[];
  noise?: number;
  alarm?: boolean;
  policeOnSite?: boolean;
}

export const CREW_MIN = 2;
/**
 * Four. Headless campaigns showed a crew of five strictly dominating three and
 * four — the cut alone was a tax the player simply paid, not a decision they
 * made — so the friction starts one body earlier, and crew size now costs Heat
 * as well as money. Five is still the right answer for a big job; it should
 * just cost something to say so.
 */
export const CREW_SOFT_MAX = 4;
/** Peak of the roll applied to every stage check. */
export const SWING = 22;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** Injury and rattled nerves both come off a member's contribution, not off
 * the team's total — the specific person is worse tonight, and it shows at the
 * stage they were meant to own. */
function effectiveStat(
  member: CrewMember,
  attr: Attribute,
  runStates?: Record<string, CrewRunState>,
): number {
  const state = runStates?.[member.id];
  if (state && (state.separated || state.caught)) return 0;
  let value = member.stats[attr];
  if (state) {
    value -= (100 - state.composure) * 0.3;
    if (state.injured) value -= 12;
  }
  return Math.max(0, value);
}

/**
 * One person does the work and the others help. Taking the best plus a
 * fraction of the next two is what makes a specialist worth hiring and a
 * seventh body worth nothing.
 */
export function crewScoreFor(
  attr: Attribute,
  crew: CrewMember[],
  runStates?: Record<string, CrewRunState>,
): { score: number; actorId?: string } {
  const ranked = crew
    .map((m) => ({ id: m.id, value: effectiveStat(m, attr, runStates) }))
    .sort((a, b) => b.value - a.value);
  if (ranked.length === 0) return { score: 0 };
  const score =
    ranked[0].value + (ranked[1]?.value ?? 0) * 0.2 + (ranked[2]?.value ?? 0) * 0.08;
  return { score, actorId: ranked[0].id };
}

/**
 * Cohesion, as a flat modifier on every check.
 *
 * Three things move it: crew size (a two-hander is tight, a seven-hander is a
 * committee), the spread of greed in the room, and how many people brought
 * traits that grate. It is small by design — cohesion should colour a plan,
 * not decide it.
 */
export function calculateCrewSynergy(crew: CrewMember[]): {
  value: number;
  notes: string[];
} {
  if (crew.length === 0) return { value: 0, notes: [] };
  const notes: string[] = [];
  let value = 0;

  if (crew.length <= 3) {
    value += 4;
    notes.push('Small crew, few moving parts.');
  }
  if (crew.length > CREW_SOFT_MAX) {
    const over = crew.length - CREW_SOFT_MAX;
    value -= over * 5;
    notes.push(`${crew.length} people is a crowd. Everyone is in someone's way.`);
  }

  const greeds = crew.map((m) => m.greed);
  const spread = Math.max(...greeds) - Math.min(...greeds);
  if (spread > 45) {
    value -= 5;
    notes.push('The split is going to be an argument.');
  }

  const hotheads = crew.filter((m) => m.traits.includes('hothead')).length;
  const pros = crew.filter((m) => m.traits.includes('professional')).length;
  if (hotheads >= 2) {
    value -= 4;
    notes.push('Two tempers in one room.');
  }
  if (pros >= 2) {
    value += 3;
    notes.push('Two professionals set the tone for everyone else.');
  }
  if (crew.some((m) => m.traits.includes('paranoid')) && crew.some((m) => m.traits.includes('reckless'))) {
    value -= 3;
    notes.push('One of them checks the exits; one of them does not believe in them.');
  }

  const loyalty = crew.reduce((sum, m) => sum + m.loyalty, 0) / crew.length;
  value += (loyalty - 50) / 10;
  if (loyalty < 35) notes.push('Nobody here owes you anything yet.');
  if (loyalty > 75) notes.push('This crew has been through something together.');

  return { value: Math.round(value), notes };
}

export function equipmentBonusFor(
  stage: StageId,
  equipment: Equipment[],
  deadKitIds: string[] = [],
): number {
  return equipment
    .filter((e) => !deadKitIds.includes(e.id))
    .reduce((sum, e) => sum + (e.bonus[stage] ?? 0), 0);
}

function equipmentAttrBonus(
  attr: Attribute,
  equipment: Equipment[],
  deadKitIds: string[] = [],
): number {
  return equipment
    .filter((e) => !deadKitIds.includes(e.id))
    .reduce((sum, e) => sum + (e.attrBonus?.[attr] ?? 0), 0);
}

/** Which attribute a stage tests under a given approach. */
export function attrForStage(stage: StageId, approach: Approach): Attribute {
  return approach.attrFor?.[stage] ?? STAGE_PROFILES[stage].attr;
}

/** Intel the player holds for a stage, read at face value. */
export function believedIntelBonus(plan: Plan, stage: StageId): number {
  return plan.intel.reduce((sum, held) => {
    const topic = plan.target.topics.find((t) => t.id === held.topicId);
    if (!topic || topic.stage !== stage) return sum;
    return sum + topic.value * (held.confidence === 'rumored' ? 0.75 : 1);
  }, 0);
}

/** What that intel is actually worth on the night. */
export function trueIntelBonus(plan: Plan, stage: StageId): number {
  return plan.intel.reduce((sum, held) => {
    const topic = plan.target.topics.find((t) => t.id === held.topicId);
    if (!topic || topic.stage !== stage) return sum;
    if (held.confidence === 'confirmed') return sum + topic.value;
    if (held.confidence === 'rumored') return sum + topic.value * 0.6;
    // False intel is worse than no intel: the crew planned around it.
    return sum - topic.value * 0.5;
  }, 0);
}

/** Missing the role an approach leans on hurts the stages that role owns. */
export function roleGapPenalty(plan: Plan, stage: StageId): number {
  const owner = STAGE_PROFILES[stage].role;
  const have = new Set(plan.crew.map((m) => m.role));
  let penalty = 0;
  if (!have.has(owner)) penalty += 8;
  for (const role of plan.approach.keyRoles) {
    if (!have.has(role) && isRoleRelevant(role, stage)) penalty += 10;
  }
  return penalty;
}

function isRoleRelevant(role: CrewRole, stage: StageId): boolean {
  const map: Record<CrewRole, StageId[]> = {
    driver: ['escape'],
    hacker: ['security'],
    safecracker: ['objective'],
    face: ['approach', 'entry', 'extraction'],
    scout: ['approach'],
    engineer: ['entry', 'objective'],
    muscle: ['extraction'],
    insideman: ['approach', 'entry', 'security'],
  };
  return map[role].includes(stage);
}

/**
 * Security ratings run 20-85 across the whole city; crew scores run 60-120.
 * Those two scales have to be made comparable somewhere, and this is the
 * somewhere. The floor is what any job costs you even when the building is
 * soft; the slope is how much harder a hard building actually is.
 *
 * Tuned against `balance.test.ts`: a prepared veteran crew should walk a
 * tier 1 job, sweat a tier 2 and be genuinely exposed on tier 3.
 */
export const OPPOSITION_FLOOR = 40;
export const OPPOSITION_SLOPE = 0.75;
export const POLICE_PENALTY = 22;
export const ALARM_PENALTY = 16;

export function stageOpposition(plan: Plan, stage: StageId, believed: boolean): number {
  const profile = STAGE_PROFILES[stage];
  const raw = profile.against(plan.target.security);
  let opposition = OPPOSITION_FLOOR + raw * OPPOSITION_SLOPE;
  opposition *= plan.approach.oppositionMul?.[stage] ?? 1;
  opposition -= believed ? believedIntelBonus(plan, stage) : trueIntelBonus(plan, stage);
  if (plan.alarm) opposition += ALARM_PENALTY;
  if (plan.policeOnSite) opposition += POLICE_PENALTY;
  if (plan.noise) {
    // Noise past the point where everyone already knows adds nothing further.
    const heard = Math.min(plan.noise, 60);
    opposition += heard * (stage === 'escape' || stage === 'extraction' ? 0.2 : 0.08);
  }
  return Math.max(5, opposition);
}

export function stageScore(
  plan: Plan,
  stage: StageId,
): { score: number; actorId?: string; attr: Attribute } {
  const attr = attrForStage(stage, plan.approach);
  const { score, actorId } = crewScoreFor(attr, plan.crew, plan.runStates);
  const synergy = calculateCrewSynergy(plan.crew).value;
  const total =
    score +
    synergy +
    equipmentBonusFor(stage, plan.equipment, plan.deadKitIds) +
    equipmentAttrBonus(attr, plan.equipment, plan.deadKitIds) -
    roleGapPenalty(plan, stage);
  return { score: Math.max(0, total), actorId, attr };
}

/**
 * Probability that a triangular roll of half-width `span` lands at or above
 * `-margin`. This is the exact distribution `Stream.swing` produces, so the
 * number on the planning board is the number the engine will roll against.
 */
export function pAtLeast(margin: number, span = SWING): number {
  if (margin >= span) return 1;
  if (margin <= -span) return 0;
  if (margin >= 0) return 1 - (span - margin) ** 2 / (2 * span * span);
  return (span + margin) ** 2 / (2 * span * span);
}

export const OUTCOME_BANDS = {
  critical: 22,
  success: 0,
  partial: -12,
  complication: -30,
};

/**
 * The headline percentage. It is the chance every stage lands at `partial` or
 * better — that is, the chance the night goes to plan rather than becoming a
 * story. It is computed from believed intel, so it can be confidently wrong.
 */
export function calculateSuccessChance(plan: Plan): number {
  if (plan.crew.length === 0) return 0;
  let p = 1;
  for (const profile of STAGE_LIST) {
    const { score } = stageScore(plan, profile.id);
    const opposition = stageOpposition(plan, profile.id, true);
    // `partial or better` is margin >= OUTCOME_BANDS.partial, so shift and ask
    // for the chance of clearing zero.
    p *= pAtLeast(score - opposition - OUTCOME_BANDS.partial);
  }
  return clamp(Math.round(p * 100), 1, 99);
}

/**
 * The second number, and the one that stops the first from being useless.
 *
 * `calculateSuccessChance` is the product of six stages going to plan, so it
 * saturates near 1% and a long shot becomes indistinguishable from suicide.
 * This asks a different and much flatter question: does everyone get out with
 * something? A messy job still pays and still comes home, and the whole design
 * rests on failure being interesting rather than terminal — so the player is
 * owed a read on it before they commit.
 */
export function calculateGetawayChance(plan: Plan): number {
  if (plan.crew.length === 0) return 0;
  let p = 1;
  for (const profile of STAGE_LIST) {
    const { score } = stageScore(plan, profile.id);
    const opposition = stageOpposition(plan, profile.id, true);
    // Anything above an outright collapse still ends with a van and a bag.
    p *= pAtLeast(score - opposition - OUTCOME_BANDS.complication);
  }
  return clamp(Math.round(p * 100), 3, 99);
}

/** A word for the shape of the plan, because a percentage alone is not one. */
export function planVerdict(hold: number, getaway: number): string {
  if (hold >= 75) return 'Routine';
  if (hold >= 45) return 'Workable';
  if (hold >= 20) return 'Rough';
  if (getaway >= 60) return 'Long shot';
  return 'Suicide';
}

/** Per-stage odds, for the weak-point readout on the planning board. */
export function stageOdds(plan: Plan): {
  stage: StageId;
  margin: number;
  chance: number;
  attr: Attribute;
  actorId?: string;
}[] {
  return STAGE_LIST.map((profile) => {
    const { score, actorId, attr } = stageScore(plan, profile.id);
    const margin = score - stageOpposition(plan, profile.id, true);
    return {
      stage: profile.id,
      margin: Math.round(margin),
      // Never show a certainty in either direction. 100% next to a plan that
      // reads 61% looks broken, and 0% claims a stage is impossible when the
      // engine guarantees no stage ever is — the roll can always surprise you.
      chance: clamp(Math.round(pAtLeast(margin - OUTCOME_BANDS.partial) * 100), 1, 99),
      attr,
      actorId,
    };
  });
}

export function weakestStage(plan: Plan): { stage: StageId; chance: number } {
  const odds = stageOdds(plan).slice().sort((a, b) => a.chance - b.chance);
  return { stage: odds[0].stage, chance: odds[0].chance };
}

export function calculateExpectedTake(plan: Plan): number {
  const base = plan.target.value * plan.approach.takeMul;
  const chance = calculateSuccessChance(plan) / 100;
  // A botched job still carries something out; a clean one carries a little
  // more than the headline. The range is what the player is really choosing.
  return Math.round(base * (0.55 + 0.5 * chance));
}

export function crewCutFraction(crew: CrewMember[]): number {
  return crew.reduce((sum, m) => sum + m.cut, 0);
}

export function calculateHeat(plan: Plan): number {
  let heat = plan.approach.heatBase;
  heat += plan.equipment.reduce((sum, e) => sum + (e.heat ?? 0), 0);
  heat += Math.round(plan.target.tier * 2);
  // Every extra body is another face, another car, another person who was
  // somewhere they cannot explain. Big crews are louder to the city, not just
  // dearer to pay.
  heat += Math.max(0, plan.crew.length - 3) * 3;
  return heat;
}

/**
 * The chance a stage throws an event even when the check goes well. Traits are
 * the biggest term here, which is the point of traits.
 */
export function calculateComplicationChance(plan: Plan): number {
  let chance = 0.16;
  for (const member of plan.crew) {
    for (const traitId of member.traits) {
      chance *= TRAITS[traitId]?.complicationMul ?? 1;
    }
  }
  chance *= plan.approach.noiseMul > 1 ? 1.2 : 1;
  if (plan.noise) chance += plan.noise / 400;
  return Math.min(0.75, chance);
}

export interface PlanAnalysis {
  successChance: number;
  getawayChance: number;
  verdict: string;
  expectedTake: number;
  heat: number;
  upfrontCost: number;
  crewCut: number;
  weakPoint: { stage: StageId; chance: number };
  synergy: { value: number; notes: string[] };
  coverage: { stage: StageId; covered: boolean; role: CrewRole }[];
  warnings: string[];
  recommendation: string;
}

export function analysePlan(plan: Plan): PlanAnalysis {
  const successChance = calculateSuccessChance(plan);
  const synergy = calculateCrewSynergy(plan.crew);
  const weakPoint = weakestStage(plan);
  const have = new Set(plan.crew.map((m) => m.role));
  const coverage = STAGE_LIST.map((profile) => ({
    stage: profile.id,
    role: profile.role,
    covered: have.has(profile.role),
  }));

  const warnings: string[] = [];
  if (plan.crew.length < CREW_MIN) warnings.push('You cannot run this alone.');
  for (const role of plan.approach.keyRoles) {
    if (!have.has(role)) {
      warnings.push(`No ${role} — the ${plan.approach.name} approach leans on one.`);
    }
  }
  if (plan.crew.length > CREW_SOFT_MAX) {
    warnings.push('More bodies than the job needs. The cut is bigger and so is the noise.');
  }
  const rumoured = plan.intel.filter((i) => i.confidence !== 'confirmed').length;
  if (rumoured > 0) {
    warnings.push(`${rumoured} piece${rumoured > 1 ? 's' : ''} of intel is unconfirmed.`);
  }
  if (plan.equipment.length === 0) warnings.push('No equipment. Everything rests on the crew.');

  const weakName = STAGE_PROFILES[weakPoint.stage].name;
  const weakRole = STAGE_PROFILES[weakPoint.stage].role;
  const recommendation = have.has(weakRole)
    ? `${weakName} is the thin part of this plan. Better kit or better intel would hold it.`
    : `${weakName} is the thin part of this plan, and you have no ${weakRole}.`;

  const getawayChance = calculateGetawayChance(plan);

  return {
    successChance,
    getawayChance,
    verdict: planVerdict(successChance, getawayChance),
    expectedTake: calculateExpectedTake(plan),
    heat: calculateHeat(plan),
    upfrontCost: plan.crew.reduce((sum, m) => sum + m.cost, 0),
    crewCut: crewCutFraction(plan.crew),
    weakPoint,
    synergy,
    coverage,
    warnings,
    recommendation,
  };
}
