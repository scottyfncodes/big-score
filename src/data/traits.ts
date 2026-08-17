import type { Trait } from '../game/types';

/**
 * Eight traits, not twenty.
 *
 * A trait is an event hook first and a stat modifier a distant second — the
 * mods below are deliberately small, because a trait that only moves a number
 * is invisible at the table. Every trait here is named by at least two events
 * in `src/data/events.ts`. Do not add a ninth without writing its events.
 */
export const TRAITS: Record<string, Trait> = {
  calm: {
    id: 'calm',
    name: 'Calm Under Pressure',
    blurb: 'Has never once been seen to hurry.',
    mods: { nerve: 8 },
    complicationMul: 0.85,
  },
  greedy: {
    id: 'greedy',
    name: 'Greedy',
    blurb: 'Counts the take twice, out loud, on the way out.',
    mods: { nerve: -3 },
    complicationMul: 1.15,
  },
  hothead: {
    id: 'hothead',
    name: 'Hotheaded',
    blurb: 'Solves problems at volume.',
    mods: { nerve: 6, social: -8 },
    complicationMul: 1.25,
  },
  paranoid: {
    id: 'paranoid',
    name: 'Paranoid',
    blurb: 'Checks the exits. Then checks them again.',
    mods: { stealth: 6, social: -4 },
    complicationMul: 0.9,
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    blurb: 'Reads the plan. Follows the plan. Leaves.',
    mods: { security: 4, technical: 4 },
    complicationMul: 0.8,
  },
  reckless: {
    id: 'reckless',
    name: 'Reckless',
    blurb: 'Fast, brilliant, and entirely uninsurable.',
    mods: { driving: 10, stealth: -8 },
    complicationMul: 1.4,
  },
  charmer: {
    id: 'charmer',
    name: 'Charismatic',
    blurb: 'People tell them things they meant to keep.',
    mods: { social: 10 },
    complicationMul: 0.95,
  },
  excop: {
    id: 'excop',
    name: 'Ex-Cop',
    blurb: 'Knows the response time because they used to be it.',
    mods: { security: 6, nerve: 4 },
    complicationMul: 0.9,
  },
};

export const TRAIT_IDS = Object.keys(TRAITS);

export function traitName(id: string): string {
  return TRAITS[id]?.name ?? id;
}
