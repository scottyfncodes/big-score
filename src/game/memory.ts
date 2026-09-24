import { eventById } from '../data/events';
import type { CrewMember, CrewMemory, RunState, StageId, Target } from './types';

/**
 * What a crew member takes home from a night.
 *
 * One line per person per job, chosen from what actually happened to them —
 * the situation they were named in, the stage they carried, the one they
 * dropped — and kept on the member so it survives them walking and being
 * hired back. This is the whole of the crew's "character arc": not a skill
 * tree, just a record the player recognises. "Nina had the door in seconds at
 * the Kestrel" is how a stat block becomes somebody.
 */

export const MEMORY_CAP = 6;

const CARRIED: Record<StageId, string> = {
  approach: 'Walked the crew in unseen',
  entry: 'Had the door open in seconds',
  security: 'Owned every camera in the building',
  objective: 'Opened it first time',
  extraction: 'Walked the bags out past everybody',
  escape: 'Lost them on the road out',
};

const DROPPED: Record<StageId, string> = {
  approach: 'Was seen on the way in',
  entry: 'Blew the door',
  security: 'Tripped the alarm',
  objective: 'Could not open it',
  extraction: 'Dropped a bag in the doorway',
  escape: 'Got boxed in on the way out',
};

export function memoryFor(member: CrewMember, run: RunState, target: Target, day: number): CrewMemory {
  const at = target.name;
  const state = run.crewRun[member.id];
  const make = (text: string, tone: CrewMemory['tone']): CrewMemory => ({ day, targetId: target.id, text, tone });

  if (state?.caught) return make(`Taken after ${at}. Did not give you up.`, 'bad');

  // Getting everybody home with the police already there is the story, and
  // it belongs to whoever was driving.
  const escape = run.results.find((r) => r.stage === 'escape');
  if (
    run.policeOnSite &&
    escape?.actorId === member.id &&
    (escape.outcome === 'critical' || escape.outcome === 'success')
  ) {
    return make(`Got everyone home from ${at} with the police already there.`, 'good');
  }

  const events = run.log.filter((l) => l.kind === 'event' && l.actorId === member.id);
  const strong = events.find((l) => l.tone === 'great' || l.tone === 'awful') ?? events[0];
  if (strong?.eventId) {
    const title = eventById(strong.eventId)?.title ?? 'A situation';
    const good = strong.tone === 'great' || strong.tone === 'good';
    return make(`${title} — ${at}. ${good ? 'Handled it.' : 'It went badly.'}`, good ? 'good' : 'bad');
  }

  const led = run.results.filter((r) => r.actorId === member.id);
  const best = led.find((r) => r.outcome === 'critical');
  if (best) return make(`${CARRIED[best.stage]} at ${at}.`, 'good');
  const worst = led.find((r) => r.outcome === 'failure');
  if (worst) return make(`${DROPPED[worst.stage]} at ${at}.`, 'bad');
  if (state?.injured) return make(`Hurt at ${at}, and finished the job.`, 'bad');
  if (state?.separated) return make(`Lost the crew at ${at} and found their own way home.`, 'bad');
  if (led.length) return make(`Led the ${led.map((r) => r.stage).join(' and ')} at ${at}.`, 'neutral');
  return make(`Was there for ${at}.`, 'neutral');
}

export function remember(member: CrewMember, memory: CrewMemory): CrewMember {
  return { ...member, memories: [memory, ...(member.memories ?? [])].slice(0, MEMORY_CAP) };
}

/** Everyone on the job has now done one more job with everyone else. */
export function partnered(member: CrewMember, crew: CrewMember[]): Record<string, number> {
  const out = { ...(member.partners ?? {}) };
  for (const other of crew) {
    if (other.id !== member.id) out[other.id] = (out[other.id] ?? 0) + 1;
  }
  return out;
}

/**
 * Loyalty, in words. The bar on the card is still a number; this is how the
 * person would describe where they stand with you.
 */
export function loyaltyWord(loyalty: number): string {
  if (loyalty >= 85) return 'Would do time for you';
  if (loyalty >= 60) return 'One of yours';
  if (loyalty >= 45) return 'Warming to you';
  if (loyalty >= 30) return 'Wary';
  return 'A stranger';
}
