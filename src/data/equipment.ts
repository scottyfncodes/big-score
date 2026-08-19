import type { Equipment } from '../game/types';

/**
 * Ten pieces of kit. No inventory management — you buy it, you own it, it is
 * available on every job from then on, and it can be upgraded twice.
 *
 * Reliability is the interesting number: kit below 1.0 rolls once at the start
 * of a run and, if it fails, does nothing all night. The crew do not find out
 * until they need it, which is what makes the cheap version of a tool a real
 * decision rather than a worse one — and what makes upgrading it worth money,
 * since a better tool is both stronger and likelier to work at all.
 *
 * `tag` is what the item *is*. Jobs ask for tags rather than for named items,
 * so a target can say "this one needs a way through a modern lock" and leave
 * the player to decide which way they buy.
 */
export const EQUIPMENT: Equipment[] = [
  {
    id: 'comms',
    name: 'Encrypted Comms',
    cost: 3500,
    blurb: 'Everyone hears everyone. Quietly.',
    tag: 'comms',
    tiers: ['Team Repeater', 'Encrypted Mesh'],
    bonus: { approach: 5, entry: 5, security: 5, objective: 5, extraction: 6, escape: 5 },
    noiseMul: 0.92,
    reliability: 0.97,
  },
  {
    id: 'bypass',
    name: 'Lock Bypass Kit',
    cost: 4000,
    blurb: 'Rakes, shims, and a very patient hand.',
    tag: 'entry',
    tiers: ['Electric Pick Gun', 'Full Bypass Rig'],
    bonus: { entry: 16 },
    reliability: 0.95,
    suits: ['stealth', 'technical'],
  },
  {
    id: 'disguises',
    name: 'Uniforms & Disguises',
    cost: 2500,
    blurb: 'A clipboard is worth ten pounds of lockpicks.',
    tag: 'cover',
    tiers: ['Contractor Kit', 'Full Wardrobe'],
    bonus: { approach: 12, entry: 10 },
    noiseMul: 0.95,
    reliability: 1,
    suits: ['social', 'distraction', 'inside'],
  },
  {
    id: 'credentials',
    name: 'Fake Credentials',
    cost: 6000,
    blurb: 'Laminated, scannable, and correct in eleven small details.',
    tag: 'cover',
    tiers: ['Cloned Badges', 'Registered Identities'],
    bonus: { approach: 8, entry: 18 },
    heat: 1,
    reliability: 0.9,
    suits: ['social', 'inside'],
  },
  {
    id: 'jammer',
    name: 'Signal Jammer',
    cost: 7500,
    blurb: 'The cameras keep recording. Nothing receives it.',
    tag: 'signal',
    tiers: ['Broadband Jammer', 'Feed Injector'],
    bonus: { security: 20, extraction: 6 },
    heat: 2,
    reliability: 0.92,
    suits: ['technical', 'aggressive'],
  },
  {
    id: 'surveillance',
    name: 'Surveillance Kit',
    cost: 5500,
    blurb: 'Long lens, parabolic mic, a van with the wrong name on it.',
    tag: 'surveillance',
    tiers: ['Long-Range Kit', 'Static Watch Post'],
    bonus: { approach: 10, security: 10 },
    reliability: 0.96,
  },
  {
    id: 'torch',
    name: 'Cutting Torch',
    cost: 3000,
    blurb: 'Fast, hot, and audible from the street.',
    tag: 'cutting',
    tiers: ['Oxy Lance', 'Exothermic Lance'],
    bonus: { objective: 14 },
    noiseMul: 1.5,
    timeMul: 0.85,
    reliability: 0.93,
    suits: ['aggressive'],
  },
  {
    id: 'drill',
    name: 'Vault Drill Rig',
    cost: 12000,
    blurb: 'Slow, quiet, and worth every hour it takes.',
    tag: 'cutting',
    tiers: ['Core Drill', 'Diamond Rig'],
    bonus: { objective: 22 },
    timeMul: 1.15,
    reliability: 0.9,
    suits: ['stealth', 'technical'],
  },
  {
    id: 'vehicle',
    name: 'Tuned Getaway Vehicle',
    cost: 15000,
    blurb: 'Looks like a plumber’s van. Is not a plumber’s van.',
    tag: 'vehicle',
    tiers: ['Stripped Chase Car', 'Two-Car Switch'],
    bonus: { escape: 22, extraction: 6 },
    reliability: 0.97,
  },
  {
    id: 'thermal',
    name: 'Thermal Imager',
    cost: 6500,
    blurb: 'Shows you the guard through the wall before he is a problem.',
    tag: 'surveillance',
    tiers: ['Wall Scanner', 'Through-Wall Radar'],
    bonus: { approach: 8, entry: 6, extraction: 12 },
    attrBonus: { stealth: 4 },
    reliability: 0.94,
  },
];

export function equipmentById(id: string): Equipment | undefined {
  return EQUIPMENT.find((e) => e.id === id);
}

/**
 * Kit gets better twice. A level 2 tool is meaningfully stronger; a level 3
 * tool is also close to certain to work on the night, which is the half of the
 * upgrade that actually changes how a plan feels.
 */
export const MAX_EQUIPMENT_LEVEL = 3;

export function upgradeCost(item: Equipment, level: number): number {
  return Math.round((item.cost * (0.8 + level * 0.5)) / 100) * 100;
}

/** The item as owned: bonuses scaled by level, reliability closing on certain. */
export function equipmentAtLevel(item: Equipment, level = 1): Equipment {
  const lvl = Math.max(1, Math.min(MAX_EQUIPMENT_LEVEL, level));
  if (lvl === 1) return item;
  const scale = 1 + (lvl - 1) * 0.35;
  const bonus: Equipment['bonus'] = {};
  for (const [stage, value] of Object.entries(item.bonus)) {
    bonus[stage as keyof Equipment['bonus']] = Math.round((value ?? 0) * scale);
  }
  return {
    ...item,
    name: item.tiers[lvl - 2] ?? item.name,
    bonus,
    attrBonus: item.attrBonus
      ? Object.fromEntries(
          Object.entries(item.attrBonus).map(([k, v]) => [k, Math.round((v ?? 0) * scale)]),
        )
      : undefined,
    reliability: Math.min(0.99, item.reliability + (1 - item.reliability) * 0.55 * (lvl - 1)),
    noiseMul: item.noiseMul ? 1 - (1 - item.noiseMul) * scale : undefined,
  };
}

export const TAG_LABELS: Record<Equipment['tag'], string> = {
  comms: 'Communications',
  entry: 'A way through a lock',
  cutting: 'Cutting or drilling gear',
  signal: 'Something to blind the cameras',
  cover: 'A reason to be there',
  surveillance: 'Eyes on the building',
  vehicle: 'A vehicle that can leave',
};
