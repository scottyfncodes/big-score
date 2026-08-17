import type { Attribute, CrewRole, Security, StageId } from './types';

export interface StageProfile {
  id: StageId;
  name: string;
  /** What the stage is, on the planning board. */
  blurb: string;
  attr: Attribute;
  /** Second attribute, at quarter weight. Nobody does a stage entirely alone. */
  support: Attribute;
  /** The role that naturally owns the stage, for crew-coverage warnings. */
  role: CrewRole;
  against: (s: Security) => number;
  /** Seconds, before approach and kit modify it. */
  baseTime: number;
  baseNoise: number;
}

/** Short response times are the real difficulty of a target, so they get their
 * own curve rather than being folded into a security average. */
export function responseScore(responseTime: number): number {
  return Math.max(5, Math.min(100, 100 - (responseTime - 180) / 4));
}

export const STAGE_PROFILES: Record<StageId, StageProfile> = {
  approach: {
    id: 'approach',
    name: 'Approach',
    blurb: 'Getting to the door without being a thing anyone remembers.',
    attr: 'stealth',
    support: 'social',
    role: 'scout',
    against: (s) => s.guards * 0.5 + s.accessControl * 0.3 + s.cameras * 0.2,
    baseTime: 90,
    baseNoise: 3,
  },
  entry: {
    id: 'entry',
    name: 'Entry',
    blurb: 'The door, the badge, the window, the lie. Whichever one you brought.',
    attr: 'stealth',
    support: 'technical',
    role: 'engineer',
    against: (s) => s.accessControl * 0.7 + s.cameras * 0.3,
    baseTime: 130,
    baseNoise: 7,
  },
  security: {
    id: 'security',
    name: 'Security',
    blurb: 'Cameras, sensors, and whoever is watching them tonight.',
    attr: 'technical',
    support: 'stealth',
    role: 'hacker',
    against: (s) => s.cameras * 0.6 + s.alarm * 0.4,
    baseTime: 150,
    baseNoise: 6,
  },
  objective: {
    id: 'objective',
    name: 'Objective',
    blurb: 'The safe, the case, the cage. The part you are actually here for.',
    attr: 'security',
    support: 'technical',
    role: 'safecracker',
    against: (s) => s.accessControl * 0.55 + s.alarm * 0.45,
    baseTime: 260,
    baseNoise: 9,
  },
  extraction: {
    id: 'extraction',
    name: 'Extraction',
    blurb: 'Carrying it out past everyone who has now noticed something.',
    attr: 'nerve',
    support: 'stealth',
    role: 'muscle',
    against: (s) => s.guards * 0.7 + s.alarm * 0.3,
    baseTime: 120,
    baseNoise: 11,
  },
  escape: {
    id: 'escape',
    name: 'Escape',
    blurb: 'Six streets, one bridge, and whatever the radio has said by now.',
    attr: 'driving',
    support: 'nerve',
    role: 'driver',
    against: (s) => responseScore(s.responseTime) * 0.8 + s.guards * 0.2,
    baseTime: 100,
    baseNoise: 5,
  },
};

export const STAGE_LIST: StageProfile[] = [
  STAGE_PROFILES.approach,
  STAGE_PROFILES.entry,
  STAGE_PROFILES.security,
  STAGE_PROFILES.objective,
  STAGE_PROFILES.extraction,
  STAGE_PROFILES.escape,
];
