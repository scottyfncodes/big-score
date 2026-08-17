import { EVENTS, eventById } from '../data/events';
import { NARRATION } from '../data/narration';
import { generateNewsReport } from './news';
import { Stream } from './rng';
import { STAGE_PROFILES } from './stages';
import {
  OUTCOME_BANDS,
  SWING,
  calculateComplicationChance,
  crewCutFraction,
  crewScoreFor,
  stageOpposition,
  stageScore,
  type Plan,
} from './calc';
import type {
  Attribute,
  CrewMember,
  CrewRole,
  EventContext,
  EventResolution,
  GameEvent,
  Grade,
  HeistResult,
  RunLogEntry,
  RunState,
  StageId,
  StageOutcome,
  StageResult,
} from './types';
import { STAGE_ORDER } from './types';

/**
 * The night itself.
 *
 * The rules this file exists to enforce:
 *
 * 1. A stage never ends the run. Only the escape does, and only by deciding
 *    who is in the van. Everything else changes the state the crew are in.
 * 2. Time is the scarce thing. Every choice spends it, the response window is
 *    finite, and running out of it does not fail the job — it changes who
 *    else is present for the rest of it.
 * 3. Resolution reads true intel; the planning board reads believed intel.
 *    Where those differ is where the surprises come from.
 */

const OUTCOME_TIME: Record<StageOutcome, number> = {
  critical: 0.7,
  success: 1,
  partial: 1.3,
  complication: 1.2,
  failure: 1.5,
};

const OUTCOME_NOISE: Record<StageOutcome, number> = {
  critical: 0.4,
  success: 1,
  partial: 1.6,
  complication: 1.8,
  failure: 2.6,
};

const TONE: Record<StageOutcome, RunLogEntry['tone']> = {
  critical: 'great',
  success: 'good',
  partial: 'neutral',
  complication: 'bad',
  failure: 'awful',
};

function bandFor(margin: number): StageOutcome {
  if (margin >= OUTCOME_BANDS.critical) return 'critical';
  if (margin >= OUTCOME_BANDS.success) return 'success';
  if (margin >= OUTCOME_BANDS.partial) return 'partial';
  if (margin >= OUTCOME_BANDS.complication) return 'complication';
  return 'failure';
}

/** The base plan plus everything the run has done to it so far. */
export function livePlan(base: Plan, run: RunState): Plan {
  return {
    ...base,
    crew: base.crew.filter((m) => run.crewIds.includes(m.id)),
    runStates: run.crewRun,
    deadKitIds: run.deadKitIds,
    noise: run.noise,
    alarm: run.alarm,
    policeOnSite: run.policeOnSite,
  };
}

export function startRun(base: Plan, seed: number): RunState {
  const stream = new Stream(seed, 0);
  const log: RunLogEntry[] = [];

  // Kit rolls its reliability once, at the start, and nobody finds out until
  // they reach for it.
  const deadKitIds = base.equipment
    .filter((e) => e.reliability < 1 && !stream.bool(e.reliability))
    .map((e) => e.id);

  const crewRun: Record<string, ReturnType<typeof initialCrewState>> = {};
  for (const member of base.crew) crewRun[member.id] = initialCrewState(member);

  const alarm = base.approach.id === 'aggressive';
  const window = base.target.security.responseTime;

  log.push({
    kind: 'note',
    stage: 'approach',
    tone: 'neutral',
    text: alarm
      ? `Through the front, in the open. The clock is already running: about ${Math.round(window / 60)} minutes of city before anybody official arrives.`
      : `Quiet start. Nothing is counting yet — the moment somebody outside notices, you have around ${Math.round(window / 60)} minutes.`,
  });

  return {
    seed,
    cursor: stream.cursor,
    targetId: base.target.id,
    approachId: base.approach.id,
    crewIds: base.crew.map((m) => m.id),
    equipmentIds: base.equipment.map((e) => e.id),
    deadKitIds,
    stageIndex: 0,
    clock: 0,
    exposedAt: alarm ? 0 : null,
    window,
    noise: alarm ? 25 : 0,
    alarm,
    policeOnSite: false,
    takeMul: 1,
    bonusTake: 0,
    heat: 0,
    results: [],
    firedEventIds: [],
    log,
    crewRun,
  };
}

function initialCrewState(member: CrewMember) {
  return {
    id: member.id,
    composure: Math.round(60 + member.stats.nerve * 0.4),
    separated: false,
    injured: false,
    caught: false,
    notes: [] as string[],
  };
}

function kitMul(plan: Plan, run: RunState, key: 'noiseMul' | 'timeMul'): number {
  return plan.equipment
    .filter((e) => !run.deadKitIds.includes(e.id))
    .reduce((mul, e) => mul * (e[key] ?? 1), 1);
}

/** The one place a stage is resolved. Returns a new run — nothing mutates. */
export function resolveStage(base: Plan, run: RunState): RunState {
  if (run.outcome || run.pending) return run;

  const stage = STAGE_ORDER[run.stageIndex];
  const profile = STAGE_PROFILES[stage];
  const plan = livePlan(base, run);
  const stream = new Stream(run.seed, run.cursor);

  const { score, actorId, attr } = stageScore(plan, stage);
  const opposition = stageOpposition(plan, stage, false);
  const roll = stream.swing(SWING);
  const margin = Math.round(score - opposition + roll);
  let outcome = bandFor(margin);

  // A good check can still produce a story. This is where traits pay off, in
  // both directions.
  if (
    (outcome === 'success' || outcome === 'critical') &&
    stream.bool(calculateComplicationChance(plan))
  ) {
    outcome = 'complication';
  }

  const timeSpent = Math.round(
    profile.baseTime * plan.approach.timeMul * kitMul(plan, run, 'timeMul') * OUTCOME_TIME[outcome],
  );
  const noiseAdded = Math.round(
    profile.baseNoise * plan.approach.noiseMul * kitMul(plan, run, 'noiseMul') * OUTCOME_NOISE[outcome],
  );

  let next: RunState = {
    ...run,
    cursor: stream.cursor,
    clock: run.clock + timeSpent,
    noise: Math.max(0, Math.min(100, run.noise + noiseAdded)),
    crewRun: { ...run.crewRun },
  };

  const narration = narrate(stage, outcome, plan, actorId, stream);
  const result: StageResult = {
    stage,
    outcome,
    attr,
    score: Math.round(score),
    opposition: Math.round(opposition),
    margin,
    roll,
    actorId,
    headline: narration.headline,
    detail: narration.detail,
    timeSpent,
    noiseAdded,
  };

  next = applyStageEffects(next, plan, result, stream);
  next.cursor = stream.cursor;
  next.results = [...run.results, result];
  next.log = [
    ...run.log,
    { kind: 'stage', stage, tone: TONE[outcome], text: `${profile.name}: ${narration.detail}` },
  ];

  next = checkExposure(next, stage);

  if (outcome === 'complication') {
    const fired = pickEvent(next, plan, stage, stream, result.actorId);
    next.cursor = stream.cursor;
    if (fired) {
      next.pending = { eventId: fired.event.id, actorId: fired.actor.id, stage };
      next.firedEventIds = [...next.firedEventIds, fired.event.id];
      return next;
    }
    // No event fits this state — take the cost without the drama.
    next.takeMul -= 0.05;
  }

  return advanceOrFinish(next, base);
}

/**
 * Exposure, and the response it starts.
 *
 * Time is only scarce once somebody outside the building is counting. Before
 * that, minutes cost the crew nothing but a slow accumulation of noise — a
 * long job is a conspicuous job — and after it, every second is the response
 * getting closer. Splitting the clock this way is what makes "did anyone
 * notice" the real question of a stealth run, and what makes the aggressive
 * approach a genuine race rather than a coin flip.
 */
const EXPOSURE_NOISE = 45;

function checkExposure(run: RunState, stage: StageId): RunState {
  let next = run;

  // A long night is its own kind of noise: patrols, insomniacs, delivery vans.
  const bleed = Math.floor(next.clock / 420);
  if (bleed > 0 && next.exposedAt === null) {
    next = { ...next, noise: Math.min(100, next.noise + bleed) };
  }

  if (next.exposedAt === null && (next.alarm || next.noise >= EXPOSURE_NOISE)) {
    next = {
      ...next,
      exposedAt: next.clock,
      log: [
        ...next.log,
        {
          kind: 'note',
          stage,
          tone: 'bad',
          text: next.alarm
            ? `That went out. Somewhere a screen has this address on it — call it ${Math.round(next.window / 60)} minutes.`
            : 'Somebody outside has been watching the building for a while now, and has stopped watching it.',
        },
      ],
    };
  }

  if (
    !next.policeOnSite &&
    next.exposedAt !== null &&
    next.clock - next.exposedAt > next.window
  ) {
    next = {
      ...next,
      policeOnSite: true,
      log: [
        ...next.log,
        {
          kind: 'note',
          stage,
          tone: 'bad',
          text: 'Sirens, and they are not passing. They are for you.',
        },
      ],
    };
  }

  return next;
}

function applyStageEffects(
  run: RunState,
  plan: Plan,
  result: StageResult,
  stream: Stream,
): RunState {
  const next: RunState = { ...run, crewRun: { ...run.crewRun } };
  const actor = result.actorId ? next.crewRun[result.actorId] : undefined;

  switch (result.outcome) {
    case 'critical':
      next.takeMul += 0.03;
      if (result.stage === 'objective') {
        next.bonusTake += Math.round(plan.target.value * 0.18);
      }
      if (result.stage === 'escape') next.heat -= 3;
      if (actor) next.crewRun[actor.id] = { ...actor, composure: Math.min(100, actor.composure + 8) };
      break;
    case 'partial':
      next.takeMul -= 0.06;
      if (actor) next.crewRun[actor.id] = { ...actor, composure: actor.composure - 5 };
      break;
    case 'failure': {
      next.takeMul -= 0.18;
      next.alarm = true;
      if (actor) {
        const hurt = result.stage === 'extraction' || result.stage === 'escape';
        next.crewRun[actor.id] = {
          ...actor,
          composure: actor.composure - 18,
          injured: actor.injured || (hurt && stream.bool(0.4)),
          notes: [...actor.notes, `Came apart at ${STAGE_PROFILES[result.stage].name.toLowerCase()}.`],
        };
      }
      break;
    }
    default:
      break;
  }

  next.takeMul = Math.max(0.05, Math.min(1.6, next.takeMul));
  return next;
}

/** Stage narration, chosen by outcome and given the name of whoever did it. */
function narrate(
  stage: StageId,
  outcome: StageOutcome,
  plan: Plan,
  actorId: string | undefined,
  stream: Stream,
): { headline: string; detail: string } {
  const who = plan.crew.find((m) => m.id === actorId)?.name.split(' ')[0] ?? 'The crew';
  const profile = STAGE_PROFILES[stage];
  const line = stream.pick(NARRATION[stage][outcome]);
  return { headline: profile.name, detail: line.split('{who}').join(who) };
}

/** Build the context an event's predicates and choices read. */
export function buildEventContext(
  base: Plan,
  run: RunState,
  stage: StageId,
  actor: CrewMember,
): EventContext {
  const plan = livePlan(base, run);
  const roles = new Set(plan.crew.map((m) => m.role));
  const liveKit = new Set(plan.equipment.filter((e) => !run.deadKitIds.includes(e.id)).map((e) => e.id));
  const knownTopics = new Set(plan.intel.map((i) => i.topicId));

  return {
    run,
    target: plan.target,
    approach: plan.approach,
    actor,
    crew: plan.crew,
    equipment: plan.equipment,
    stage,
    scoreFor: (attr: Attribute) => crewScoreFor(attr, plan.crew, run.crewRun).score,
    has: (role: CrewRole) => roles.has(role),
    hasKit: (id: string) => liveKit.has(id),
    knows: (topicId: string) => knownTopics.has(topicId),
  };
}

/**
 * Who the event happens to.
 *
 * `preferredId` is the crew member who just led the stage. Where they fit the
 * event's requirement they get it, because the stage line and the event that
 * follows it are describing the same moment — having them name two different
 * people reads as two unrelated things happening at once.
 */
function actorFor(
  event: GameEvent,
  plan: Plan,
  run: RunState,
  stream: Stream,
  preferredId?: string,
): CrewMember | undefined {
  const available = plan.crew.filter(
    (m) => !run.crewRun[m.id]?.caught && !run.crewRun[m.id]?.separated,
  );
  if (available.length === 0) return undefined;

  const fits = (m: CrewMember) =>
    event.actor.role
      ? m.role === event.actor.role
      : event.actor.trait
        ? m.traits.includes(event.actor.trait)
        : true;

  const matches = available.filter(fits);
  if (matches.length === 0) return undefined;

  const preferred = matches.find((m) => m.id === preferredId);
  return preferred ?? stream.pick(matches);
}

function pickEvent(
  run: RunState,
  plan: Plan,
  stage: StageId,
  stream: Stream,
  preferredActorId?: string,
): { event: GameEvent; actor: CrewMember } | undefined {
  // An event fires at most once per run. Repeats read as the game running out
  // of things to say, which is worse than a quiet stage.
  const seen = new Set(run.firedEventIds);
  const candidates: { event: GameEvent; actor: CrewMember; weight: number }[] = [];

  for (const event of EVENTS) {
    if (!event.stages.includes(stage)) continue;
    const actor = actorFor(event, plan, run, stream, preferredActorId);
    if (!actor) continue;
    const ctx = buildEventContextInline(plan, run, stage, actor);
    if (event.when && !event.when(ctx)) continue;
    if (seen.has(event.id)) continue;
    candidates.push({ event, actor, weight: event.weight });
  }

  const chosen = stream.weighted(candidates);
  return chosen ? { event: chosen.event, actor: chosen.actor } : undefined;
}

/** Same context, built from an already-live plan (avoids re-deriving it). */
function buildEventContextInline(
  plan: Plan,
  run: RunState,
  stage: StageId,
  actor: CrewMember,
): EventContext {
  const roles = new Set(plan.crew.map((m) => m.role));
  const liveKit = new Set(plan.equipment.filter((e) => !run.deadKitIds.includes(e.id)).map((e) => e.id));
  const knownTopics = new Set(plan.intel.map((i) => i.topicId));
  return {
    run,
    target: plan.target,
    approach: plan.approach,
    actor,
    crew: plan.crew,
    equipment: plan.equipment,
    stage,
    scoreFor: (attr: Attribute) => crewScoreFor(attr, plan.crew, run.crewRun).score,
    has: (role: CrewRole) => roles.has(role),
    hasKit: (id: string) => liveKit.has(id),
    knows: (topicId: string) => knownTopics.has(topicId),
  };
}

export function pendingEventFor(base: Plan, run: RunState):
  | { event: GameEvent; ctx: EventContext; body: string }
  | undefined {
  if (!run.pending) return undefined;
  const event = eventById(run.pending.eventId);
  const actor = base.crew.find((m) => m.id === run.pending?.actorId);
  if (!event || !actor) return undefined;
  const ctx = buildEventContext(base, run, run.pending.stage, actor);
  const body = event.body
    .replace('{actor}', actor.name.split(' ')[0])
    .replace('{target}', base.target.name);
  return { event, ctx, body };
}

export function chooseEventOption(base: Plan, run: RunState, choiceId: string): RunState {
  const pending = pendingEventFor(base, run);
  if (!pending || !run.pending) return run;

  const choice = pending.event.choices.find((c) => c.id === choiceId);
  if (!choice) return run;

  const stream = new Stream(run.seed, run.cursor);
  let passed = true;
  if (choice.check) {
    const score = pending.ctx.scoreFor(choice.check.attr);
    const margin = score - choice.check.dc + stream.swing(SWING);
    passed = margin >= 0;
  }
  const resolution = choice.resolve(pending.ctx, passed);

  let next = applyResolution(run, resolution, run.pending.actorId, run.pending.stage);
  next.cursor = stream.cursor;
  next.pending = undefined;
  next.log = [
    ...next.log,
    {
      kind: 'event',
      stage: run.pending.stage,
      tone: passed ? 'good' : 'bad',
      text: resolution.text,
    },
  ];

  if (resolution.abort) {
    return finishRun(base, { ...next, stageIndex: STAGE_ORDER.length }, true);
  }

  next = checkExposure(next, run.pending.stage);

  return advanceOrFinish(next, base);
}

/** Event resolutions are the only thing besides a stage that moves the world. */
function applyResolution(
  run: RunState,
  res: EventResolution,
  actorId: string,
  _stage: StageId,
): RunState {
  const next: RunState = { ...run, crewRun: { ...run.crewRun } };
  next.clock = Math.max(0, next.clock + (res.time ?? 0));
  next.noise = Math.max(0, Math.min(100, next.noise + (res.noise ?? 0)));
  next.heat += res.heat ?? 0;
  next.takeMul = Math.max(0.05, Math.min(1.6, next.takeMul + (res.takeMul ?? 0)));
  next.bonusTake += res.bonusTake ?? 0;
  if (res.alarm) next.alarm = true;

  const actor = next.crewRun[actorId];
  if (actor) {
    next.crewRun[actorId] = {
      ...actor,
      composure: Math.max(0, Math.min(100, actor.composure + (res.composure ?? 0))),
      separated: actor.separated || Boolean(res.separate),
      injured: actor.injured || Boolean(res.injure),
      caught: actor.caught || Boolean(res.capture),
      notes: [...actor.notes, res.text],
    };
  }

  return next;
}

function advanceOrFinish(run: RunState, base: Plan): RunState {
  const next = { ...run, stageIndex: run.stageIndex + 1 };
  if (next.stageIndex >= STAGE_ORDER.length) return finishRun(base, next, false);
  return next;
}

/**
 * Grades read the whole night, not the take. A quiet job that came home with
 * less is still a better night than a loud one that came home with more, and
 * the campaign is long enough for that to matter.
 */
function gradeFor(args: {
  arrests: number;
  takeMul: number;
  policeContact: boolean;
  alarm: boolean;
  complications: number;
  noise: number;
  aborted: boolean;
}): Grade {
  if (args.arrests >= 2 || args.takeMul <= 0.2) return 'catastrophic';
  if (args.arrests >= 1) return 'botched';
  if (args.aborted) return args.alarm ? 'messy' : 'clean';
  if (args.takeMul < 0.6) return 'botched';
  if (args.policeContact || args.complications >= 3 || args.takeMul < 0.85) return 'messy';
  // Noise is not graded. A loud job that works is a clean job with a large
  // Heat bill, and Heat is where that cost is already charged — grading it
  // twice would make the aggressive approach unable to succeed by definition.
  if (
    !args.alarm &&
    !args.policeContact &&
    args.complications === 0 &&
    args.takeMul >= 1 &&
    args.noise <= 25
  ) {
    return 'perfect';
  }
  return 'clean';
}

const STARS: Record<Grade, 1 | 2 | 3 | 4 | 5> = {
  perfect: 5,
  clean: 4,
  messy: 3,
  botched: 2,
  catastrophic: 1,
};

export function finishRun(base: Plan, run: RunState, aborted: boolean): RunState {
  const stream = new Stream(run.seed, run.cursor);
  const crewRun = { ...run.crewRun };

  // The escape is the only place anybody is actually caught, and only when the
  // response arrived before they did.
  const escape = run.results.find((r) => r.stage === 'escape');
  if (!aborted && run.policeOnSite && escape) {
    const exposed = base.crew.filter((m) => !crewRun[m.id]?.caught);
    if (escape.outcome === 'failure' && exposed.length && stream.bool(0.65)) {
      const caught = stream.pick(exposed);
      crewRun[caught.id] = { ...crewRun[caught.id], caught: true, notes: [...crewRun[caught.id].notes, 'Taken at the roadblock.'] };
    } else if ((escape.outcome === 'complication' || escape.outcome === 'partial') && exposed.length) {
      const unlucky = stream.pick(exposed);
      if (crewRun[unlucky.id].separated && stream.bool(0.5)) {
        crewRun[unlucky.id] = { ...crewRun[unlucky.id], caught: true, notes: [...crewRun[unlucky.id].notes, 'Picked up on foot, four streets away.'] };
      }
    }
  }

  const arrests = Object.values(crewRun).filter((c) => c.caught).length;
  const injuries = Object.values(crewRun).filter((c) => c.injured).length;
  const complications = run.results.filter(
    (r) => r.outcome === 'complication' || r.outcome === 'failure',
  ).length;

  let gross = aborted
    ? 0
    : Math.round(base.target.value * base.approach.takeMul * run.takeMul + run.bonusTake);
  for (let i = 0; i < arrests; i++) gross = Math.round(gross * 0.85);

  const grade = gradeFor({
    arrests,
    takeMul: run.takeMul,
    policeContact: run.policeOnSite,
    alarm: run.alarm,
    complications,
    noise: run.noise,
    aborted,
  });

  const payingCrew = base.crew.filter((m) => !crewRun[m.id]?.caught);
  const crewCut = Math.round(gross * crewCutFraction(payingCrew));
  const net = Math.max(0, gross - crewCut);

  const heat = Math.max(
    0,
    Math.round(
      run.heat +
        base.approach.heatBase +
        base.target.tier * 2 +
        run.noise / 6 +
        (run.policeOnSite ? 12 : 0) +
        arrests * 10 +
        gross / 60000 -
        (grade === 'perfect' ? 6 : 0),
    ),
  );

  // Nobody in the van feels the same way about it. The night is worth the same
  // to everyone, but what happened to *them* and how much they wanted the money
  // are personal, so the reactions on the report differ by name.
  const loyaltyDeltas: Record<string, number> = {};
  const nightValue = grade === 'perfect' ? 8 : grade === 'clean' ? 5 : grade === 'messy' ? 0 : -6;
  const payRatio = gross / Math.max(1, base.target.value);
  for (const member of base.crew) {
    const state = crewRun[member.id];
    let delta = nightValue;
    if (state?.caught) delta -= 20;
    if (state?.injured) delta -= 5;
    if (state && state.composure < 40) delta -= 3;
    if (state && state.composure > 85) delta += 2;
    // Greed reads the money, not the night: a greedy crew member is sourer
    // about a thin score and happier about a fat one than anyone else.
    delta += Math.round((payRatio - 0.9) * (member.greed / 10));
    if (aborted) delta -= 2;
    loyaltyDeltas[member.id] = delta;
  }

  const notableMoment = pickNotable(run);

  const result: HeistResult = {
    grade,
    gross,
    crewCut,
    net,
    heat,
    durationSeconds: run.clock,
    complications,
    injuries,
    arrests,
    policeContact: run.policeOnSite,
    stars: STARS[grade],
    notableMoment,
    loyaltyDeltas,
    headline: '',
    standfirst: '',
  };

  const story = generateNewsReport({
    result,
    target: base.target,
    crew: base.crew,
    day: 0,
    seed: run.seed,
    cursor: stream.cursor + 7,
  });
  result.headline = story.headline;
  result.standfirst = story.standfirst;

  return {
    ...run,
    crewRun,
    cursor: stream.cursor + 8,
    pending: undefined,
    outcome: result,
    log: [
      ...run.log,
      {
        kind: 'note',
        stage: 'escape',
        tone: grade === 'perfect' || grade === 'clean' ? 'great' : grade === 'messy' ? 'neutral' : 'awful',
        text: aborted ? 'You called it off. Nobody was there. Nobody was ever there.' : 'Out.',
      },
    ],
  };
}

/**
 * The line the report leads with. Events are always preferred over stages:
 * an event resolution is written prose about a named person, and a stage line
 * is a template. Given the choice, print the writing.
 */
function pickNotable(run: RunState): string {
  const events = run.log.filter((l) => l.kind === 'event');
  if (events.length) {
    const strong = events.find((l) => l.tone === 'great' || l.tone === 'awful');
    return (strong ?? events[events.length - 1]).text;
  }
  const order: RunLogEntry['tone'][] = ['great', 'awful', 'bad', 'good'];
  for (const tone of order) {
    const found = [...run.log].reverse().find((l) => l.tone === tone && l.kind === 'stage');
    if (found) return found.text.replace(/^[^:]+: /, '');
  }
  return 'It happened, and then it was over.';
}

/** Convenience for tests and the simulator: run a whole heist with a policy. */
export function playOut(
  base: Plan,
  seed: number,
  choose: (event: GameEvent, ctx: EventContext) => string,
): RunState {
  let run = startRun(base, seed);
  let guard = 0;
  while (!run.outcome && guard++ < 60) {
    if (run.pending) {
      const pending = pendingEventFor(base, run);
      if (!pending) {
        run = { ...run, pending: undefined, stageIndex: run.stageIndex + 1 };
        if (run.stageIndex >= STAGE_ORDER.length) run = finishRun(base, run, false);
        continue;
      }
      run = chooseEventOption(base, run, choose(pending.event, pending.ctx));
    } else {
      run = resolveStage(base, run);
    }
  }
  return run;
}
