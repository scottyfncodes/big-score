import type { Equipment } from '../game/types';

/**
 * Ten pieces of kit. No inventory management — you buy it, you own it, it is
 * available on every job from then on.
 *
 * Reliability is the interesting number: kit below 1.0 rolls once at the start
 * of a run and, if it fails, does nothing all night. The crew do not find out
 * until they need it, which is what makes the cheap version of a tool a real
 * decision rather than a worse one.
 */
export const EQUIPMENT: Equipment[] = [
  {
    id: 'comms',
    name: 'Encrypted Comms',
    cost: 3500,
    blurb: 'Everyone hears everyone. Quietly.',
    bonus: { approach: 5, entry: 5, security: 5, objective: 5, extraction: 6, escape: 5 },
    noiseMul: 0.92,
    reliability: 0.97,
  },
  {
    id: 'bypass',
    name: 'Lock Bypass Kit',
    cost: 4000,
    blurb: 'Rakes, shims, and a very patient hand.',
    bonus: { entry: 16 },
    reliability: 0.95,
    suits: ['stealth', 'technical'],
  },
  {
    id: 'disguises',
    name: 'Uniforms & Disguises',
    cost: 2500,
    blurb: 'A clipboard is worth ten pounds of lockpicks.',
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
    bonus: { approach: 10, security: 10 },
    reliability: 0.96,
  },
  {
    id: 'torch',
    name: 'Cutting Torch',
    cost: 3000,
    blurb: 'Fast, hot, and audible from the street.',
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
    bonus: { escape: 22, extraction: 6 },
    reliability: 0.97,
  },
  {
    id: 'thermal',
    name: 'Thermal Imager',
    cost: 6500,
    blurb: 'Shows you the guard through the wall before he is a problem.',
    bonus: { approach: 8, entry: 6, extraction: 12 },
    attrBonus: { stealth: 4 },
    reliability: 0.94,
  },
];

export function equipmentById(id: string): Equipment | undefined {
  return EQUIPMENT.find((e) => e.id === id);
}
