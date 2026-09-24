import { CALLS, GESTURES, INTEL_HOLDS, LEAD_LINES, LIE_FOUND, PLACES, START_MINUTES, type LeadMood } from '../data/scenes';
import { TAG_LABELS } from '../data/equipment';
import { ARCHETYPES } from '../data/crew';
import { sourceById } from './intel';
import { randAt } from './rng';
import { STAGE_PROFILES } from './stages';
import { OUTCOME_BANDS, pAtLeast, stageOpposition, stageScore, type Plan } from './calc';
import { TACTICS, canAbort, livePlan, stageRevelations } from './resolve';
import type { CrewMember, RunState, StageId, StageTactic } from './types';
import { STAGE_ORDER } from './types';

/**
 * The night, staged.
 *
 * Everything here is a pure read of the run: it draws nothing from the
 * stream and changes nothing, so the same state always stages the same way
 * and a reload mid-heist puts the player back in exactly the same room. It
 * exists to answer, before every stage, the five things the player needs:
 * what is happening, why, what it means, what they can do, and roughly what
 * each of those will cost.
 */

export type Read = 'solid' | 'likely' | 'even' | 'thin' | 'grim';

export const READ_WORDS: Record<Read, string> = {
  solid: 'Solid',
  likely: 'Likely',
  even: 'Even money',
  thin: 'Thin',
  grim: 'Grim',
};

/** A chance, in words. The number is still one tap away on the planning board. */
export function readFor(chance: number): Read {
  if (chance >= 85) return 'solid';
  if (chance >= 65) return 'likely';
  if (chance >= 42) return 'even';
  if (chance >= 22) return 'thin';
  return 'grim';
}

export interface SceneFact {
  tone: 'good' | 'bad' | 'awful' | 'neutral';
  text: string;
}

export interface SceneCall {
  tactic: StageTactic;
  label: string;
  hint: string;
  read: Read;
  /** Chance the stage lands at partial or better with this call. */
  chance: number;
}

export interface Scene {
  stage: StageId;
  index: number;
  time: string;
  place: string;
  lead?: CrewMember;
  mood: LeadMood;
  gesture: string;
  quote: string;
  facts: SceneFact[];
  calls: SceneCall[];
  canAbort: boolean;
}

/** On-site seconds as a time of night — "11:42 PM" — for the given approach. */
export function nightClock(approachId: keyof typeof START_MINUTES, seconds: number): string {
  const minutes = (((START_MINUTES[approachId] + Math.floor(seconds / 60)) % 1440) + 1440) % 1440;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function placeFor(targetId: string, stage: StageId): string {
  return (PLACES[targetId] ?? PLACES._default)[stage];
}

/**
 * The live chance for the current stage. Unlike the planning board this reads
 * the truth for the stage in front of the crew — by the time they are standing
 * at the door they can see what kind of door it is.
 */
export function liveStageChance(base: Plan, run: RunState, tactic: StageTactic = 'steady'): number {
  const stage = STAGE_ORDER[Math.min(run.stageIndex, STAGE_ORDER.length - 1)];
  const plan = livePlan(base, run);
  const { score } = stageScore(plan, stage);
  const margin = score + TACTICS[tactic].score - stageOpposition(plan, stage, false);
  return Math.max(1, Math.min(99, Math.round(pAtLeast(margin - OUTCOME_BANDS.partial) * 100)));
}

const first = (m?: CrewMember) => m?.name.split(' ')[0] ?? 'Somebody';

export function stageScene(base: Plan, run: RunState): Scene | undefined {
  if (run.outcome || run.pending || run.stageIndex >= STAGE_ORDER.length) return undefined;
  const stage = STAGE_ORDER[run.stageIndex];
  const plan = livePlan(base, run);
  const { actorId } = stageScore(plan, stage);
  const lead = plan.crew.find((m) => m.id === actorId);
  const state = lead ? run.crewRun[lead.id] : undefined;
  const found = stageRevelations(base, run, stage);
  const chance = liveStageChance(base, run);
  const exposed = run.exposedAt !== null;

  const facts: SceneFact[] = [];

  for (const lie of found.lies) {
    const source = sourceById(lie.sourceId)?.name ?? 'your source';
    facts.push({
      tone: 'awful',
      text: `${LIE_FOUND[lie.topicId] ?? 'The intel was wrong.'} ${source} sold you that.`,
    });
  }
  for (const id of found.deadKit) {
    const item = base.equipment.find((e) => e.id === id);
    facts.push({
      tone: 'bad',
      text: `The ${item?.name ?? 'kit'} is dead in ${first(lead)}’s hands. It is doing nothing tonight.`,
    });
  }

  // Intel that holds, at the stage it was bought for. Hearing that the file
  // was right is how the player learns which fixers to pay again.
  for (const held of base.intel) {
    const topic = base.target.topics.find((t) => t.id === held.topicId);
    if (!topic || topic.stage !== stage || held.confidence === 'false') continue;
    facts.push({
      tone: 'good',
      text:
        held.confidence === 'confirmed'
          ? INTEL_HOLDS[topic.id] ?? 'The intel holds.'
          : `${topic.label}: the rumour was roughly right. Roughly.`,
    });
  }

  const liveTags = new Set(
    base.equipment.filter((e) => !run.deadKitIds.includes(e.id)).map((e) => e.tag),
  );
  for (const need of base.target.needs) {
    if (need.stage !== stage || liveTags.has(need.tag)) continue;
    if (found.deadKit.some((id) => base.equipment.find((e) => e.id === id)?.tag === need.tag)) continue;
    facts.push({
      tone: need.critical ? 'awful' : 'bad',
      text: `Nobody brought ${TAG_LABELS[need.tag].toLowerCase()}. ${need.note}`,
    });
  }

  const owner = STAGE_PROFILES[stage].role;
  if (lead && !plan.crew.some((m) => m.role === owner)) {
    facts.push({
      tone: 'bad',
      text: `There is no ${ARCHETYPES[owner].name.toLowerCase()} on this crew. ${first(lead)} is covering.`,
    });
  }
  if (state?.injured) facts.push({ tone: 'bad', text: `${first(lead)} is hurt, and working through it.` });
  else if (state && state.composure < 45) facts.push({ tone: 'bad', text: `${first(lead)} is rattled.` });

  for (const m of base.crew) {
    if (run.crewRun[m.id]?.separated || run.crewRun[m.id]?.caught) {
      facts.push({ tone: 'bad', text: `${first(m)} is not with you.` });
    }
  }

  if (run.policeOnSite) {
    facts.push({ tone: 'awful', text: 'The police are here.' });
  } else if (exposed) {
    const left = Math.max(0, run.window - (run.clock - (run.exposedAt ?? 0)));
    facts.push({
      tone: left < 120 ? 'awful' : 'bad',
      text: `Somebody is counting. The response is about ${Math.max(1, Math.round(left / 60))} minute${Math.round(left / 60) === 1 ? '' : 's'} out.`,
    });
  } else if (run.noise > 30) {
    facts.push({ tone: 'bad', text: 'Nobody outside is counting yet, but the street is starting to listen.' });
  } else {
    facts.push({ tone: 'neutral', text: 'Nobody outside is counting yet.' });
  }

  const mood: LeadMood = found.lies.length || found.deadKit.length
    ? 'thrown'
    : state?.injured || (state && state.composure < 40)
      ? 'hurt'
      : chance >= 65
        ? 'sure'
        : chance >= 35
          ? 'unsure'
          : 'grim';

  // Pure picks from the seed, off the run's own cursor, so reading a scene
  // never advances the stream the night is resolved from.
  const pick = <T,>(items: T[], salt: number) =>
    items[Math.floor(randAt(run.seed ^ 0x5eed, 50000 + run.stageIndex * 17 + salt) * items.length)];
  const quote = pick(LEAD_LINES[stage][mood], 1);
  const gesture = pick(GESTURES, 2);

  const names = CALLS[stage];
  const who = first(lead);
  const hints: Record<StageTactic, string> = {
    careful: exposed
      ? 'Better odds, but every minute now is a minute closer to the response.'
      : 'Better odds. More time on site, and lingering gets noticed.',
    steady: 'The plan as drawn.',
    push: exposed
      ? 'Out before they arrive. Worse odds, louder.'
      : 'Fast and loud. Worse odds, and the street may hear it.',
  };
  const calls: SceneCall[] = (['careful', 'steady', 'push'] as StageTactic[]).map((tactic) => {
    const c = liveStageChance(base, run, tactic);
    return {
      tactic,
      label: names[tactic].split('{who}').join(who),
      hint: hints[tactic],
      read: readFor(c),
      chance: c,
    };
  });

  return {
    stage,
    index: run.stageIndex,
    time: nightClock(base.approach.id, run.clock),
    place: placeFor(base.target.id, stage),
    lead,
    mood,
    gesture,
    quote,
    facts,
    calls,
    canAbort: canAbort(run),
  };
}
