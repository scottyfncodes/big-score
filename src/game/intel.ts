import { Stream } from './rng';
import type { CrewMember, Intel, IntelSource, IntelTopic, Security, Target } from './types';

/**
 * Buying information.
 *
 * Prices were cut after headless campaigns showed a competent player was
 * better off buying nothing: intel bought materially cleaner jobs and lower
 * Heat, but cost more than the cleanliness returned. A system that the optimal
 * player skips is not a decision, it is a trap.
 *
 * The design rule that makes this system worth having: false intel must read
 * exactly like true intel, but it must never be a silent tax. A lie is bought
 * from a *source*, the source has a reliability the player can learn across a
 * campaign, and the lie itself blows up at a named stage on the night — loudly
 * enough that the player can connect the failure back to the fixer who sold
 * it. Uncertainty is a fair mechanic; a hidden dice roll that just deletes
 * money is not.
 */

export const SOURCES: IntelSource[] = [
  {
    id: 'ledger',
    name: 'The Ledger',
    reliability: 88,
    costMul: 1.25,
  },
  {
    id: 'pawn',
    name: 'Danko’s Pawn',
    reliability: 66,
    costMul: 0.8,
  },
  {
    id: 'street',
    name: 'Street talk',
    reliability: 42,
    costMul: 0.45,
  },
];

export function sourceById(id: string): IntelSource | undefined {
  return SOURCES.find((s) => s.id === id);
}

/** What a topic costs from a given source, before the scout's discount. */
export function intelCost(topic: IntelTopic, source: IntelSource, crew: CrewMember[]): number {
  const hasScout = crew.some((m) => m.role === 'scout');
  const scoutStat = Math.max(0, ...crew.filter((m) => m.role === 'scout').map((m) => m.stats.stealth));
  const discount = hasScout ? 1 - Math.min(0.3, scoutStat / 300) : 1;
  return Math.round((topic.cost * source.costMul * discount) / 50) * 50;
}

/**
 * Roll the confidence. A reliable source mostly sells the truth and admits
 * when it is guessing; a cheap one sells confident nonsense. The *label* the
 * player sees is 'confirmed' or 'rumored' — 'false' is stored, never shown,
 * and always wears one of the other two labels on the board.
 */
export function buyIntel(
  stream: Stream,
  topic: IntelTopic,
  source: IntelSource,
  day: number,
  crew: CrewMember[],
): Intel {
  const scoutBonus = crew.some((m) => m.role === 'scout') ? 10 : 0;
  const roll = stream.int(1, 100);
  const reliability = Math.min(97, source.reliability + scoutBonus);

  let confidence: Intel['confidence'];
  if (roll <= reliability) confidence = 'confirmed';
  else if (roll <= reliability + (100 - reliability) * 0.45) confidence = 'rumored';
  else confidence = 'false';

  return {
    topicId: topic.id,
    sourceId: source.id,
    // A lie presents itself as certainty about half the time. This is the only
    // place in the game where the interface is allowed to be wrong.
    confidence,
    reading: topic.claim,
    boughtOnDay: day,
  };
}

/** What the board *says* about a piece of intel. False intel wears a mask. */
export function displayedConfidence(intel: Intel, stream: Stream): 'confirmed' | 'rumored' {
  if (intel.confidence === 'confirmed') return 'confirmed';
  if (intel.confidence === 'rumored') return 'rumored';
  return stream.bool(0.5) ? 'confirmed' : 'rumored';
}

export const SCOUT_COST = 1500;

/**
 * Scouting is the free-ish layer under paid intel: it reveals the security
 * numbers themselves, roughly, rather than telling you anything you can act
 * on. Each pass narrows the estimate.
 */
export function scoutedSecurity(
  target: Target,
  passes: number,
  crew: CrewMember[],
): Record<keyof Security, { known: boolean; low: number; high: number }> {
  const scoutStat = Math.max(30, ...crew.filter((m) => m.role === 'scout').map((m) => m.stats.stealth));
  const precision = Math.min(0.9, passes * 0.3 + scoutStat / 400);
  const out = {} as Record<keyof Security, { known: boolean; low: number; high: number }>;
  const keys: (keyof Security)[] = ['guards', 'cameras', 'alarm', 'accessControl', 'responseTime'];

  for (const key of keys) {
    const actual = target.security[key];
    const isPublic = target.publicSecurity.includes(key);
    if (passes === 0 && !isPublic) {
      out[key] = { known: false, low: 0, high: 0 };
      continue;
    }
    const band = actual * (1 - precision) * 0.5;
    out[key] = {
      known: true,
      low: Math.max(0, Math.round(actual - band)),
      high: Math.round(actual + band),
    };
  }
  return out;
}

export function scoutCostFor(target: Target, passes: number): number {
  return Math.round((SCOUT_COST * (1 + target.tier * 0.4) * (1 + passes * 0.6)) / 50) * 50;
}
