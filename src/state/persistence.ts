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

/**
 * Bring an older save forward, one version at a time so the steps compose.
 * Returns undefined only if the save is from the future or unreadable.
 */
function migrate(save: Campaign): Campaign | undefined {
  if (!save || typeof save.version !== 'number') return undefined;
  if (save.version > SAVE_VERSION) return undefined;

  let next = save;

  // v1 -> v2: targets deplete when robbed, so every save needs a hit ledger.
  // An existing campaign starts with a clean one; nothing it did before the
  // upgrade counts against it.
  if (next.version < 2) {
    next = { ...next, hits: next.hits ?? {}, version: 2 };
  }

  // v2 -> v3: equipment levels, the contact book behind crew retention, and
  // the campaign's event memory. Anyone already on the payroll is treated as
  // a contact and keeps their post; nobody is made to walk by an upgrade.
  if (next.version < 3) {
    const contacts = { ...(next.contacts ?? {}) };
    for (const record of Object.values(next.crew ?? {})) contacts[record.member.id] = record.member;
    next = {
      ...next,
      equipmentLevels: next.equipmentLevels ?? {},
      contacts,
      seenEventIds: next.seenEventIds ?? [],
      crew: Object.fromEntries(
        Object.entries(next.crew ?? {}).map(([id, record]) => [id, { ...record, retained: true }]),
      ),
      version: 3,
    };
  }

  return { ...next, version: SAVE_VERSION };
}
