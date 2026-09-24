import { DISTRICTS, districtById } from '../data/districts';
import { ARCHETYPES } from '../data/crew';
import { TARGETS, targetById } from '../data/targets';
import {
  availableTargets,
  bailCost,
  recoveryCeiling,
  targetHardening,
  targetHits,
  targetValueMultiplier,
} from './campaign';
import { sourceById } from './intel';
import type { Campaign, Target } from './types';

/**
 * The city between jobs.
 *
 * None of this is new simulation — depletion, hardening, Heat, custody and
 * the recruitment board already move every day. This file only reads them
 * back as things a city would say: police tape, restocked shelves, a name
 * people have started asking about. It is how the player learns that the
 * city remembers what they did, without having to diff a number.
 */

export interface WireItem {
  id: string;
  tone: 'good' | 'bad' | 'neutral' | 'hot';
  text: string;
  targetId?: string;
}

export function cityWire(campaign: Campaign): WireItem[] {
  const items: (WireItem & { rank: number })[] = [];
  const day = campaign.day;

  // What just opened up. Worked out from the score before the last job.
  const last = campaign.reports[0];
  if (last) {
    const before = campaign.score - last.gross;
    for (const d of DISTRICTS) {
      if (d.unlockAtScore > before && d.unlockAtScore <= campaign.score) {
        items.push({ id: `open-${d.id}`, tone: 'good', rank: 100, text: `${d.name} is taking your calls now. ${d.blurb}` });
      }
    }
    for (const t of TARGETS) {
      const district = districtById(t.districtId);
      if (t.unlockAtScore > before && t.unlockAtScore <= campaign.score && (district?.unlockAtScore ?? 0) <= before) {
        items.push({ id: `open-${t.id}`, tone: 'good', rank: 95, targetId: t.id, text: `New work: ${t.name}. ${t.blurb}` });
      }
    }
  }

  // Your people, where they are not free to work.
  for (const record of Object.values(campaign.crew)) {
    const first = record.member.name.split(' ')[0];
    if (record.condition === 'arrested') {
      items.push({
        id: `cell-${record.member.id}`,
        tone: 'bad',
        rank: 90,
        text: `${first} is still in a cell and has not said a word. Bail is $${bailCost(record.member).toLocaleString('en-US')}.`,
      });
    } else if (record.condition === 'injured' && record.availableOnDay > day) {
      items.push({
        id: `hurt-${record.member.id}`,
        tone: 'neutral',
        rank: 60,
        text: `${first} is healing. Back on their feet by day ${record.availableOnDay}.`,
      });
    }
  }

  // Everywhere you have been.
  for (const [targetId, hit] of Object.entries(campaign.hits ?? {})) {
    const target = targetById(targetId);
    if (!target || hit.count === 0) continue;
    const since = day - hit.lastDay;
    const district = districtById(target.districtId)?.name ?? 'the city';
    if (since <= 4) {
      items.push({
        id: `tape-${targetId}`,
        tone: 'hot',
        rank: 85,
        targetId,
        text: `Police tape is still up at ${target.name}. Extra cars in ${district} since day ${hit.lastDay}.`,
      });
      continue;
    }
    const mul = targetValueMultiplier(campaign, targetId);
    const full = mul >= recoveryCeiling(hit.count) - 0.001;
    items.push({
      id: `restock-${targetId}`,
      tone: full ? 'good' : 'neutral',
      rank: full ? 70 : 40,
      targetId,
      text: full
        ? `${target.name} has restocked as far as it is going to — better locks, and about ${Math.round(mul * 100)}% of what it held the first time.`
        : `${target.name} is filling back up behind new locks. Word is it holds about ${Math.round(mul * 100)}% of what it did.`,
    });
  }

  // The biggest thing nobody has touched yet.
  const fresh = availableTargets(campaign)
    .filter((t) => targetHits(campaign, t.id).count === 0)
    .sort((a, b) => b.value - a.value)[0];
  if (fresh) {
    items.push({
      id: `fresh-${fresh.id}`,
      tone: 'neutral',
      rank: 50,
      targetId: fresh.id,
      text: `Nobody has touched ${fresh.name} yet. ${fresh.weakness}`,
    });
  }

  // Somebody is asking about you, a district early.
  const next = DISTRICTS.filter((d) => d.unlockAtScore > campaign.score).sort(
    (a, b) => a.unlockAtScore - b.unlockAtScore,
  )[0];
  if (next && campaign.score >= next.unlockAtScore * 0.55) {
    items.push({
      id: `ask-${next.id}`,
      tone: 'neutral',
      rank: 45,
      text: `People in the ${next.name} have started asking who you are. A little more and they will pick up.`,
    });
  }

  // Fixers who have lied to you, by name.
  for (const [sourceId, record] of Object.entries(campaign.sourceRecord ?? {})) {
    if (record.lies === 0) continue;
    items.push({
      id: `liar-${sourceId}`,
      tone: 'bad',
      rank: 30,
      text: `${sourceById(sourceId)?.name ?? 'A source'} has sold you ${record.lies} lie${record.lies > 1 ? 's' : ''} out of ${record.sold}.`,
    });
  }

  // Somebody good is in town.
  const veteran = campaign.market.find((m) => m.experience >= 3);
  if (veteran) {
    items.push({
      id: `vet-${veteran.id}`,
      tone: 'good',
      rank: 35,
      text: `A veteran ${ARCHETYPES[veteran.role].name.toLowerCase()} called ${veteran.name.split(' ')[0]} is in town, asking for work.`,
    });
  }

  if (campaign.heat >= 61) {
    items.push({
      id: 'heat',
      tone: 'hot',
      rank: 80,
      text: 'Every building in the city has been told to expect you. The locks are better and the response is faster, everywhere.',
    });
  }

  return items.sort((a, b) => b.rank - a.rank).slice(0, 6).map(({ rank: _rank, ...item }) => item);
}

/** One line for a target tile: what the city knows about this place right now. */
export function targetStatus(campaign: Campaign, target: Target): { tone: WireItem['tone']; text: string } | undefined {
  const hit = targetHits(campaign, target.id);
  const intel = campaign.intel[target.id]?.length ?? 0;
  const scouted = campaign.scouted[target.id] ?? 0;
  if (hit.count > 0) {
    const since = campaign.day - hit.lastDay;
    const hardened = Math.round((targetHardening(campaign, target.id) - 1) * 100);
    return since <= 4
      ? { tone: 'hot', text: `You hit this on day ${hit.lastDay}. Police tape, extra cars.` }
      : {
          tone: 'neutral',
          text: `Hit ${hit.count === 1 ? 'once' : `${hit.count} times`} · ${Math.round(targetValueMultiplier(campaign, target.id) * 100)}% restocked · security up ${hardened}%`,
        };
  }
  if (intel || scouted) {
    return {
      tone: 'good',
      text: [scouted ? `Scouted ×${scouted}` : '', intel ? `${intel} file${intel > 1 ? 's' : ''} bought` : '']
        .filter(Boolean)
        .join(' · '),
    };
  }
  return undefined;
}
