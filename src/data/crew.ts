import type { Attribute, CrewRole, Stats } from '../game/types';

export interface Archetype {
  role: CrewRole;
  name: string;
  /** One line the crew card leads with. */
  tagline: string;
  base: Stats;
  /** Attributes that swing hardest between two people of the same role. */
  volatile: Attribute[];
  baseCost: number;
  baseCut: number;
  /** Stages this role is the natural answer to, for the planning board hints. */
  covers: string;
}

const stats = (s: Partial<Stats>): Stats => ({
  driving: 25,
  security: 25,
  technical: 25,
  social: 30,
  stealth: 35,
  nerve: 45,
  ...s,
});

export const ARCHETYPES: Record<CrewRole, Archetype> = {
  driver: {
    role: 'driver',
    name: 'Driver',
    tagline: 'Gets you out. That is the entire job.',
    base: stats({ driving: 72, nerve: 55, stealth: 40 }),
    volatile: ['driving', 'nerve'],
    baseCost: 6000,
    baseCut: 0.09,
    covers: 'Escape',
  },
  hacker: {
    role: 'hacker',
    name: 'Hacker',
    tagline: 'Owns the cameras, briefly.',
    base: stats({ technical: 74, security: 48, stealth: 42, nerve: 38 }),
    volatile: ['technical', 'nerve'],
    baseCost: 8000,
    baseCut: 0.1,
    covers: 'Security',
  },
  safecracker: {
    role: 'safecracker',
    name: 'Safecracker',
    tagline: 'The slow, quiet, expensive part.',
    base: stats({ security: 74, technical: 50, stealth: 50, nerve: 45 }),
    volatile: ['security'],
    baseCost: 9000,
    baseCut: 0.11,
    covers: 'Objective',
  },
  face: {
    role: 'face',
    name: 'Face',
    tagline: 'Walks in the front and is thanked for it.',
    base: stats({ social: 76, nerve: 55, stealth: 40 }),
    volatile: ['social', 'nerve'],
    baseCost: 7500,
    baseCut: 0.1,
    covers: 'Approach, Entry',
  },
  scout: {
    role: 'scout',
    name: 'Scout',
    tagline: 'Saw the building three times before you did.',
    base: stats({ stealth: 70, technical: 40, social: 45, security: 40, driving: 40 }),
    volatile: ['stealth'],
    baseCost: 5000,
    baseCut: 0.08,
    covers: 'Approach, cheaper intel',
  },
  engineer: {
    role: 'engineer',
    name: 'Engineer',
    tagline: 'Doors are a suggestion.',
    base: stats({ technical: 64, security: 60, nerve: 45, driving: 35 }),
    volatile: ['technical', 'security'],
    baseCost: 7000,
    baseCut: 0.09,
    covers: 'Entry, Objective',
  },
  muscle: {
    role: 'muscle',
    name: 'Muscle',
    tagline: 'Holds the room together. Loudly, if pushed.',
    base: stats({ nerve: 74, driving: 40, security: 35, stealth: 22 }),
    volatile: ['nerve'],
    baseCost: 4500,
    baseCut: 0.08,
    covers: 'Extraction',
  },
  insideman: {
    role: 'insideman',
    name: 'Inside Man',
    tagline: 'Already has a badge that works.',
    base: stats({ social: 60, security: 55, stealth: 50, technical: 35, nerve: 35 }),
    volatile: ['social', 'security'],
    baseCost: 11000,
    baseCut: 0.13,
    covers: 'Unlocks the Inside Job',
  },
};

export const ROLE_ORDER: CrewRole[] = [
  'driver',
  'hacker',
  'safecracker',
  'face',
  'scout',
  'engineer',
  'muscle',
  'insideman',
];

export const FIRST_NAMES = [
  'Marcus', 'Vera', 'Dessie', 'Ilya', 'Nadia', 'Corbin', 'Sunny', 'Ruth',
  'Oskar', 'Bea', 'Teddy', 'Ines', 'Halvard', 'Mo', 'Junie', 'Anton',
  'Priya', 'Lorne', 'Cassie', 'Emeka', 'Wren', 'Bruno', 'Sinead', 'Yusuf',
];

export const LAST_NAMES = [
  'Kade', 'Oyelaran', 'Petrov', 'Whitlock', 'Sandoval', 'Byrne', 'Nakamura',
  'Ferreira', 'Ash', 'Delacroix', 'Mbeki', 'Halloran', 'Reyes', 'Novak',
  'Osei', 'Lindqvist', 'Varga', 'Tran', 'Bellweather', 'Costa',
];

/** Bio fragments, keyed by role. Assembled with a seeded pick. */
export const BIOS: Record<CrewRole, string[]> = {
  driver: [
    'Ran ambulances for six years and never once used the siren.',
    'Banned from three cities for things that were technically racing.',
    'Learned the harbour roads delivering fish at four in the morning.',
  ],
  hacker: [
    'Was paid to break the bank’s own system. Kept a copy of the keys.',
    'Has not been outdoors in daylight since a job in the spring.',
    'Talks to the building rather than the crew.',
  ],
  safecracker: [
    'Third generation. The first two got caught; the lesson took.',
    'Can hear a tumbler drop through a closed door and a bad mood.',
    'Retired twice. Neither took.',
  ],
  face: [
    'Sold a building they did not own, twice, to the same man.',
    'Owns one very good suit and eleven convincing accents.',
    'Was almost an actor, which is not the same as almost honest.',
  ],
  scout: [
    'Photographs buildings for a living, which is only half a lie.',
    'Knows which of the city’s cameras have been broken since March.',
    'Walks fourteen miles a day and remembers all of it.',
  ],
  engineer: [
    'Built the loading bay doors at the port. Left a way through.',
    'Fired from a security firm for proving a point too thoroughly.',
    'Keeps the receipts for everything, which is a worry.',
  ],
  muscle: [
    'Fought professionally until the licence went.',
    'Has never thrown the first punch and never lost the second.',
    'Works doors on the Casino Strip and hears everything.',
  ],
  insideman: [
    'Nineteen years of loyal service and a pension that vanished.',
    'Still has the swipe card. Nobody has thought to cancel it.',
    'Signs for the deliveries. Signs for anything, really.',
  ],
};
