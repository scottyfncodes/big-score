import { SAVE_VERSION } from '../game/campaign';
import type { Campaign } from '../game/types';

/**
 * localStorage, versioned from the first commit.
 *
 * The version field is here on day one deliberately: a balance change that
 * silently corrupts every existing save is the cheapest possible way to lose a
 * player, and it costs nothing to migrate a save that has a number on it.
 */

const KEY = 'big-score:campaign:v1';

export function loadCampaign(): Campaign | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Campaign;
    return migrate(parsed);
  } catch {
    return undefined;
  }
}

export function saveCampaign(campaign: Campaign): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(campaign));
  } catch {
    // A full or disabled storage must never break a run in progress.
  }
}

export function clearCampaign(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do — the next New Game overwrites it anyway.
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/** Bring an older save forward. Returns undefined if it cannot be salvaged. */
function migrate(save: Campaign): Campaign | undefined {
  if (!save || typeof save.version !== 'number') return undefined;
  if (save.version > SAVE_VERSION) return undefined;
  // v1 is the first schema. Migrations land here as fields change, each one
  // stepping a single version so they compose.
  return { ...save, version: SAVE_VERSION };
}
