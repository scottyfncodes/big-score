import type { District } from '../game/types';

/**
 * Port Argent. Six districts on a 100x100 grid — the map is drawn from these
 * coordinates in SVG, so moving a district is a data edit, not a layout edit.
 */
export const DISTRICTS: District[] = [
  {
    id: 'oldtown',
    name: 'Old Town',
    blurb: 'Jewellers, galleries and buildings older than the police force.',
    x: 30,
    y: 62,
    unlockAtScore: 0,
  },
  {
    id: 'downtown',
    name: 'Downtown',
    blurb: 'Offices, payroll floors, and security guards on their second job.',
    x: 52,
    y: 44,
    unlockAtScore: 0,
  },
  {
    id: 'industrial',
    name: 'Industrial',
    blurb: 'Warehouses, haulage yards, and armoured runs on a fixed schedule.',
    x: 22,
    y: 24,
    unlockAtScore: 0,
  },
  {
    id: 'financial',
    name: 'Financial District',
    blurb: 'Glass, marble, and the shortest police response time in the city.',
    x: 68,
    y: 30,
    unlockAtScore: 120000,
  },
  {
    id: 'harbor',
    name: 'Harbor',
    blurb: 'Containers, customs, and money that would rather stay afloat.',
    x: 74,
    y: 72,
    unlockAtScore: 120000,
  },
  {
    id: 'casino',
    name: 'Casino Strip',
    blurb: 'Cash rooms, private security, and nobody who calls the police first.',
    x: 46,
    y: 84,
    unlockAtScore: 500000,
  },
];

export function districtById(id: string): District | undefined {
  return DISTRICTS.find((d) => d.id === id);
}
