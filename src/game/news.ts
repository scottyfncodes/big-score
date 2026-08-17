import { districtById } from '../data/districts';
import type { CrewMember, Grade, HeistResult, NewsStory, Target } from './types';
import { Stream } from './rng';

/**
 * The paper reads the game state, never a canned string. Every headline below
 * is chosen by what actually happened — the take, the noise, whether anyone
 * saw a face — so the front page is a readout of the run rather than flavour
 * bolted on after it.
 */

export const MASTHEADS = [
  'PORT ARGENT DAILY',
  'THE ARGENT HERALD',
  'PORT ARGENT EVENING POST',
];

interface HeadlineTemplate {
  id: string;
  when: (r: HeistResult) => boolean;
  weight: number;
  headline: (ctx: NewsContext) => string;
  standfirst: (ctx: NewsContext) => string;
}

interface NewsContext {
  result: HeistResult;
  target: Target;
  districtName: string;
  money: string;
  crew: CrewMember[];
}

const money = (n: number) =>
  '$' + Math.round(n).toLocaleString('en-US');

const TEMPLATES: HeadlineTemplate[] = [
  {
    id: 'ghosts',
    when: (r) => (r.grade === 'perfect' || r.grade === 'clean') && !r.policeContact,
    weight: 3,
    headline: (c) => `${c.money} GONE FROM ${c.target.name.toUpperCase()}`,
    standfirst: () =>
      'Police say there were no witnesses, no alarm and no sign of forced entry. One investigator called it "embarrassing".',
  },
  {
    id: 'inside',
    when: (r) => r.grade === 'perfect',
    weight: 2,
    headline: (c) => `MYSTERY CREW EMPTIES ${c.districtName.toUpperCase()} ${c.target.type.toUpperCase()}`,
    standfirst: () =>
      'Investigators believe the crime may have involved an insider. Staff have been asked not to speak to reporters.',
  },
  {
    id: 'chase',
    when: (r) => r.policeContact && r.arrests === 0,
    weight: 3,
    headline: (c) => `THIEVES OUTRUN PATROLS AFTER ${c.target.name.toUpperCase()} RAID`,
    standfirst: (c) =>
      `A vehicle was lost in the ${c.districtName} district minutes after the alarm. ${c.money} is unaccounted for.`,
  },
  {
    id: 'violent',
    when: (r) => r.grade === 'messy' || r.grade === 'botched',
    weight: 3,
    headline: (c) => `PANIC AT ${c.target.name.toUpperCase()}`,
    standfirst: (c) =>
      `Staff describe a loud, fast robbery lasting under ${Math.max(2, Math.round(c.result.durationSeconds / 60))} minutes. Nobody was seriously hurt.`,
  },
  {
    id: 'arrest',
    when: (r) => r.arrests > 0,
    weight: 5,
    headline: () => 'ONE HELD AFTER BOTCHED ROBBERY',
    standfirst: (c) =>
      `Police confirm a suspect is in custody following the incident at ${c.target.name}. A search for others is under way.`,
  },
  {
    id: 'failed',
    when: (r) => r.grade === 'catastrophic',
    weight: 4,
    headline: (c) => `RAID ON ${c.target.name.toUpperCase()} FOILED`,
    standfirst: () =>
      'Officers arrived within minutes. A senior officer said the attempt was "amateurish, and we expect to make arrests".',
  },
  {
    id: 'big',
    when: (r) => r.gross > 400000,
    weight: 4,
    headline: (c) => `${c.money} — CITY'S BIGGEST THEFT IN A DECADE`,
    standfirst: (c) =>
      `The scale of the loss at ${c.target.name} has prompted questions about private security across ${c.districtName}.`,
  },
  {
    id: 'quiet',
    when: (r) => r.gross < 30000 && r.arrests === 0,
    weight: 2,
    headline: (c) => `SMALL HAUL IN ${c.districtName.toUpperCase()} BREAK-IN`,
    standfirst: () =>
      'Officers say the theft was opportunistic and are not linking it to other incidents. That may be a mistake.',
  },
];

export function generateNewsReport(args: {
  result: HeistResult;
  target: Target;
  crew: CrewMember[];
  day: number;
  seed: number;
  cursor: number;
}): NewsStory {
  const stream = new Stream(args.seed, args.cursor);
  const districtName = districtById(args.target.districtId)?.name ?? 'the city';
  const ctx: NewsContext = {
    result: args.result,
    target: args.target,
    districtName,
    money: money(args.result.gross),
    crew: args.crew,
  };

  const eligible = TEMPLATES.filter((t) => t.when(args.result));
  const chosen = stream.weighted(eligible.length ? eligible : [TEMPLATES[7]]) ?? TEMPLATES[7];

  const body = buildBody(ctx, stream);

  return {
    id: `${args.target.id}-${args.day}-${chosen.id}`,
    day: args.day,
    masthead: stream.pick(MASTHEADS),
    headline: chosen.headline(ctx),
    standfirst: chosen.standfirst(ctx),
    body,
    take: args.result.gross,
  };
}

const CLOSERS = [
  'Police have appealed for anyone with information to come forward.',
  'The premises will remain closed while the loss is assessed.',
  'A spokesperson declined to confirm the amount taken.',
  'Insurers are understood to be reviewing the terms of the policy.',
  'Residents have reported an increased police presence since the weekend.',
];

function buildBody(ctx: NewsContext, stream: Stream): string {
  const parts: string[] = [];
  const { result, target, districtName } = ctx;

  parts.push(
    `Officers were called to ${target.name} in ${districtName}. The premises had been entered and a quantity of property removed.`,
  );

  if (result.policeContact) {
    parts.push('Patrol units reached the scene while the offenders were still present.');
  } else {
    parts.push('The theft is believed to have been discovered some hours after it took place.');
  }

  if (result.complications >= 3) {
    parts.push('Detectives describe the scene as chaotic and say several things appear to have gone wrong for those responsible.');
  } else if (result.complications === 0) {
    parts.push('There is, so far, nothing at the scene for detectives to work with.');
  }

  if (result.injuries > 0) {
    parts.push('Blood recovered at the scene has been sent for analysis.');
  }

  parts.push(stream.pick(CLOSERS));
  return parts.join(' ');
}

/** The line the post-heist report leads with. Grade first, then the number. */
export function gradeLine(grade: Grade): { label: string; line: string } {
  switch (grade) {
    case 'perfect':
      return { label: 'PERFECT', line: 'Nobody saw a thing. Nobody will.' };
    case 'clean':
      return { label: 'CLEAN', line: 'It went more or less the way you drew it.' };
    case 'messy':
      return { label: 'MESSY', line: 'You got out. It cost more than it should have.' };
    case 'botched':
      return { label: 'BOTCHED', line: 'That was not a plan by the end. That was running.' };
    case 'catastrophic':
      return { label: 'CATASTROPHIC', line: 'Cut your losses. Work out who talks.' };
  }
}
