import { ARCHETYPES, BIOS, FIRST_NAMES, LAST_NAMES, ROLE_ORDER } from '../data/crew';
import { TRAITS, TRAIT_IDS } from '../data/traits';
import { Stream } from './rng';
import type { Attribute, CrewMember, CrewRole, Stats } from './types';
import { ATTRIBUTES } from './types';

/**
 * Crew are generated, not authored, so a campaign never runs out of people —
 * but the generation is narrow on purpose. An archetype decides the shape, the
 * roll decides the person, and traits are applied to the stats *here* so that
 * the number printed on the polaroid is the number the engine uses. A card
 * that lies about its own stats is the fastest way to lose a player's trust.
 */

const clamp = (n: number) => Math.max(5, Math.min(99, Math.round(n)));

export function generateCrewMember(
  stream: Stream,
  role: CrewRole,
  options: { experienceBias?: number; takenFirstNames?: string[] } = {},
): CrewMember {
  const archetype = ARCHETYPES[role];
  const experience = Math.max(
    1,
    Math.min(3, stream.int(1, 3) + (options.experienceBias ?? 0)),
  );

  const stats = {} as Stats;
  for (const attr of ATTRIBUTES) {
    const base = archetype.base[attr];
    const volatile = archetype.volatile.includes(attr);
    const spread = volatile ? 18 : 9;
    stats[attr] = clamp(base + stream.swing(spread) + (experience - 2) * 7);
  }

  const traitCount = stream.next() < 0.35 ? 2 : 1;
  const traits = stream.shuffle(TRAIT_IDS).slice(0, traitCount);
  for (const traitId of traits) {
    const mods = TRAITS[traitId]?.mods;
    if (!mods) continue;
    for (const [attr, delta] of Object.entries(mods)) {
      stats[attr as Attribute] = clamp(stats[attr as Attribute] + (delta as number));
    }
  }

  const greed = stream.int(15, 85);
  const loyalty = stream.int(28, 62);
  // Two people called Yusuf on the same crew makes every line of narration
  // ambiguous — the engine names people by first name all night. So the pool
  // excludes names already spoken for, and only falls back when it is empty.
  const taken = new Set(options.takenFirstNames ?? []);
  const free = FIRST_NAMES.filter((n) => !taken.has(n));
  const name = `${stream.pick(free.length ? free : FIRST_NAMES)} ${stream.pick(LAST_NAMES)}`;
  const skill = ATTRIBUTES.reduce((sum, a) => sum + stats[a], 0) / ATTRIBUTES.length;

  // Up-front fees are deliberately modest: a crew's real price is the cut they
  // take off the score, and a bankroll that all goes on hiring leaves nothing
  // for the intel and kit that make a plan worth running. Tuned so a four
  // hander costs roughly 40% of the opening $50,000.
  const cost = Math.round(
    (archetype.baseCost * (0.35 + skill / 110) * (1 + greed / 220)) / 100,
  ) * 100;

  return {
    id: `${role}-${Math.floor(stream.next() * 1e9).toString(36)}`,
    name,
    initials: name
      .split(' ')
      .map((part) => part[0])
      .join(''),
    role,
    stats,
    loyalty,
    greed,
    nerveShown: stats.nerve,
    traits,
    experience,
    cost,
    cut: Math.round((archetype.baseCut * (0.85 + greed / 200)) * 1000) / 1000,
    bio: stream.pick(BIOS[role]),
  };
}

/**
 * The recruitment board. Always offers a spread of roles rather than a random
 * handful, so a player who needs a driver can eventually find one — the game
 * should be hard because the jobs are hard, not because the market was rude.
 */
export function generateMarket(
  seed: number,
  day: number,
  size = 6,
  experienceBias = 0,
  takenFirstNames: string[] = [],
): CrewMember[] {
  const stream = new Stream(seed, day * 977);
  const roles = stream.shuffle(ROLE_ORDER).slice(0, Math.min(size, ROLE_ORDER.length));
  while (roles.length < size) roles.push(stream.pick(ROLE_ORDER));

  const taken = [...takenFirstNames];
  return roles.map((role) => {
    const member = generateCrewMember(stream, role, { experienceBias, takenFirstNames: taken });
    taken.push(member.name.split(' ')[0]);
    return member;
  });
}

export function experienceLabel(experience: number): string {
  return experience >= 3 ? 'Veteran' : experience === 2 ? 'Experienced' : 'Green';
}
