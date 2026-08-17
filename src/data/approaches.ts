import type { Approach, ApproachId } from '../game/types';

/**
 * Six approaches. An approach does three things: it changes which attribute a
 * stage tests, it changes how hard that stage is, and it changes what the
 * night costs in noise, time and Heat.
 *
 * `keyRoles` is deliberately soft. Missing the role the approach leans on is a
 * penalty at the stages that need it, never a block on choosing it — a plan
 * you shouldn't be attempting has to remain attemptable or the game stops
 * being about nerve.
 */
export const APPROACHES: Record<ApproachId, Approach> = {
  stealth: {
    id: 'stealth',
    name: 'Stealth',
    blurb: 'In the dark, on the clock, out before anyone looks up.',
    timeMul: 1.15,
    noiseMul: 0.6,
    heatBase: 4,
    takeMul: 1,
    keyRoles: ['scout', 'safecracker'],
  },
  social: {
    id: 'social',
    name: 'Social',
    blurb: 'Walk in during business. Be expected. Be forgettable.',
    attrFor: { approach: 'social', entry: 'social', extraction: 'social' },
    oppositionMul: { entry: 0.85, extraction: 0.9, objective: 1.15 },
    timeMul: 0.9,
    noiseMul: 0.5,
    heatBase: 3,
    takeMul: 0.9,
    keyRoles: ['face'],
  },
  technical: {
    id: 'technical',
    name: 'Technical',
    blurb: 'Own the systems first and the building becomes paperwork.',
    attrFor: { entry: 'technical', security: 'technical', objective: 'technical' },
    oppositionMul: { security: 0.65, entry: 0.9, extraction: 1.1 },
    timeMul: 1.05,
    noiseMul: 0.7,
    heatBase: 5,
    takeMul: 1,
    keyRoles: ['hacker', 'engineer'],
  },
  distraction: {
    id: 'distraction',
    name: 'Distraction',
    blurb: 'Give the city something louder to look at, two streets away.',
    oppositionMul: { approach: 0.6, entry: 0.75, escape: 0.8, objective: 1.05 },
    timeMul: 1.1,
    noiseMul: 0.9,
    heatBase: 8,
    takeMul: 1,
    keyRoles: ['engineer', 'driver'],
  },
  inside: {
    id: 'inside',
    name: 'Inside Job',
    blurb: 'Someone in there is already on the payroll. Yours.',
    attrFor: { approach: 'social', entry: 'social' },
    oppositionMul: { approach: 0.6, entry: 0.55, security: 0.8, objective: 0.85 },
    timeMul: 0.85,
    noiseMul: 0.55,
    heatBase: 6,
    takeMul: 1.05,
    keyRoles: ['insideman', 'face'],
    requiresTopic: 'insider',
  },
  aggressive: {
    id: 'aggressive',
    name: 'Aggressive',
    blurb: 'Through the front, on a clock, and everybody on the floor.',
    attrFor: { approach: 'nerve', entry: 'nerve', extraction: 'nerve' },
    oppositionMul: { approach: 0.5, entry: 0.6, security: 1.2, extraction: 0.8, escape: 1.25 },
    timeMul: 0.35,
    noiseMul: 3,
    heatBase: 18,
    takeMul: 1.2,
    keyRoles: ['muscle', 'driver'],
  },
};

export const APPROACH_ORDER: ApproachId[] = [
  'stealth',
  'social',
  'technical',
  'distraction',
  'inside',
  'aggressive',
];
