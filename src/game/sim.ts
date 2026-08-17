import { APPROACHES } from '../data/approaches';
import { EQUIPMENT } from '../data/equipment';
import { TARGETS } from '../data/targets';
import { generateCrewMember } from './generation';
import { Stream, seedFrom } from './rng';
import { playOut } from './resolve';
import { analysePlan, type Plan } from './calc';
import { ROLE_ORDER } from '../data/crew';
import type { ApproachId, CrewRole, Grade, Intel } from './types';

/**
 * The balance harness.
 *
 * This exists so the game can be tuned in a terminal before a single pixel is
 * drawn. If the grade distribution here is boring — everything clean, or
 * everything catastrophic — no amount of interface will save the run, and the
 * fix belongs in `calc.ts` rather than in a component.
 */

export type Policy = 'cautious' | 'bold' | 'first';

export interface SimOptions {
  runs?: number;
  targetId?: string;
  approachId?: ApproachId;
  crewRoles?: CrewRole[];
  crewSize?: number;
  equipmentIds?: string[];
  intelTopics?: string[];
  /** All bought intel is treated as true unless this is set. */
  falseIntelTopics?: string[];
  experienceBias?: number;
  seed?: number;
  policy?: Policy;
}

export interface SimReport {
  runs: number;
  label: string;
  grades: Record<Grade, number>;
  estimatedChance: number;
  meanTake: number;
  medianTake: number;
  meanHeat: number;
  meanComplications: number;
  arrestRate: number;
  policeRate: number;
  bigScoreRate: number;
}

const GRADES: Grade[] = ['perfect', 'clean', 'messy', 'botched', 'catastrophic'];

export function buildPlan(options: SimOptions, seed: number): Plan {
  const target = TARGETS.find((t) => t.id === (options.targetId ?? 'argent_vine'))!;
  const approach = APPROACHES[options.approachId ?? 'stealth'];
  const stream = new Stream(seed, 0);

  const roles =
    options.crewRoles ??
    stream.shuffle(ROLE_ORDER).slice(0, options.crewSize ?? 4);
  const crew = roles.map((role) =>
    generateCrewMember(stream, role, { experienceBias: options.experienceBias ?? 0 }),
  );

  const equipment = EQUIPMENT.filter((e) => (options.equipmentIds ?? []).includes(e.id));
  const intel: Intel[] = (options.intelTopics ?? [])
    .filter((topicId) => target.topics.some((t) => t.id === topicId))
    .map((topicId) => ({
      topicId,
      sourceId: 'ledger',
      confidence: (options.falseIntelTopics ?? []).includes(topicId) ? 'false' : 'confirmed',
      reading: '',
      boughtOnDay: 0,
    }));

  return { target, approach, crew, equipment, intel };
}

export function simulate(options: SimOptions = {}): SimReport {
  const runs = options.runs ?? 400;
  const baseSeed = options.seed ?? seedFrom('balance');
  const grades: Record<Grade, number> = {
    perfect: 0,
    clean: 0,
    messy: 0,
    botched: 0,
    catastrophic: 0,
  };

  const takes: number[] = [];
  let heat = 0;
  let complications = 0;
  let arrests = 0;
  let police = 0;
  let big = 0;
  let estimated = 0;

  for (let i = 0; i < runs; i++) {
    const seed = baseSeed + i * 7919;
    const plan = buildPlan(options, seed);
    estimated += analysePlan(plan).successChance;

    const run = playOut(plan, seed, (event, ctx) => {
      const usable = event.choices.filter((c) => !c.when || c.when(ctx));
      if (options.policy === 'first' || !options.policy) return usable[0].id;
      if (options.policy === 'bold') {
        const checked = usable.find((c) => c.check);
        return (checked ?? usable[0]).id;
      }
      const safe = usable.find((c) => !c.check && c.id !== 'abort');
      return (safe ?? usable[0]).id;
    });

    const outcome = run.outcome!;
    grades[outcome.grade]++;
    takes.push(outcome.net);
    heat += outcome.heat;
    complications += outcome.complications;
    if (outcome.arrests > 0) arrests++;
    if (outcome.policeContact) police++;
    if (outcome.gross > plan.target.value * 1.2) big++;
  }

  takes.sort((a, b) => a - b);

  return {
    runs,
    label: `${options.targetId ?? 'argent_vine'} / ${options.approachId ?? 'stealth'} / ${options.policy ?? 'first'}`,
    grades,
    estimatedChance: Math.round(estimated / runs),
    meanTake: Math.round(takes.reduce((s, t) => s + t, 0) / runs),
    medianTake: takes[Math.floor(runs / 2)],
    meanHeat: Math.round((heat / runs) * 10) / 10,
    meanComplications: Math.round((complications / runs) * 100) / 100,
    arrestRate: Math.round((arrests / runs) * 100),
    policeRate: Math.round((police / runs) * 100),
    bigScoreRate: Math.round((big / runs) * 100),
  };
}

export function formatReport(r: SimReport): string {
  const pct = (n: number) => `${Math.round((n / r.runs) * 100)}%`.padStart(4);
  return [
    r.label.padEnd(46),
    `est ${String(r.estimatedChance).padStart(3)}%`,
    GRADES.map((g) => `${g[0].toUpperCase()}${pct(r.grades[g])}`).join(' '),
    `take ${('$' + r.medianTake.toLocaleString('en-US')).padStart(10)}`,
    `heat ${String(r.meanHeat).padStart(5)}`,
    `cops ${String(r.policeRate).padStart(3)}%`,
    `held ${String(r.arrestRate).padStart(3)}%`,
  ].join('  ');
}

export { GRADES };
