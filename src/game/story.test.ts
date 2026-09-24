import { describe, expect, it } from 'vitest';
import { buildPlan } from './sim';
import { chooseEventOption, pendingEventFor, playOut, resolveStage, startRun } from './resolve';
import { liveStageChance, nightClock, readFor, stageScene } from './scene';
import { memoryFor, loyaltyWord, MEMORY_CAP, remember } from './memory';
import { cityWire, targetStatus } from './city';
import { generateNewsReport } from './news';
import {
  activeCrew,
  bailOut,
  completeHeist,
  hire,
  newCampaign,
  planFor,
  planForRun,
} from './campaign';
import { seedFrom } from './rng';
import { targetById } from '../data/targets';
import type { Campaign, HeistResult, RunState } from './types';

/**
 * The layer that turns the simulation into something a player can tell
 * somebody about: the staged scene before each stage, what crew remember,
 * what the city says between jobs, and what the paper prints. All of it is a
 * pure read of state, so all of it is tested here rather than in a browser.
 */

const firstChoice = (e: { choices: { id: string; when?: unknown }[] }, ctx: never) =>
  (e.choices as { id: string; when?: (c: never) => boolean }[]).filter((c) => !c.when || c.when(ctx))[0].id;

function crewed(seed = 'story', n = 4): Campaign {
  let c = newCampaign(seedFrom(seed), 'T');
  for (const recruit of c.market.slice(0, n)) c = hire(c, recruit.id);
  return c;
}

describe('the staged scene', () => {
  it('names the time, the place, and whoever is about to do the work', () => {
    const plan = buildPlan({ targetId: 'argent_vine', crewSize: 4 }, 3);
    const run = startRun(plan, 3);
    const scene = stageScene(plan, run)!;
    expect(scene.stage).toBe('approach');
    expect(scene.place).toBe('Vine Street');
    expect(scene.time).toBe('11:50 PM');
    expect(plan.crew.map((m) => m.id)).toContain(scene.lead?.id);
    expect(scene.quote.length).toBeGreaterThan(5);
    expect(scene.calls.map((c) => c.tactic)).toEqual(['careful', 'steady', 'push']);
    expect(scene.canAbort).toBe(true);
  });

  it('reading a scene never moves the stream the night is resolved from', () => {
    const plan = buildPlan({ targetId: 'kestrel_gallery', crewSize: 4 }, 8);
    const a = startRun(plan, 8);
    stageScene(plan, a);
    stageScene(plan, a);
    expect(resolveStage(plan, a)).toEqual(resolveStage(plan, startRun(plan, 8)));
  });

  it('the calls read in the right order', () => {
    const plan = buildPlan({ targetId: 'kestrel_gallery', crewSize: 4 }, 9);
    const run = startRun(plan, 9);
    expect(liveStageChance(plan, run, 'careful')).toBeGreaterThanOrEqual(liveStageChance(plan, run, 'steady'));
    expect(liveStageChance(plan, run, 'steady')).toBeGreaterThanOrEqual(liveStageChance(plan, run, 'push'));
  });

  it('tells the player about a lie before they make the call, and names the source', () => {
    const vine = buildPlan(
      { targetId: 'argent_vine', crewSize: 4, intelTopics: ['rotation'], falseIntelTopics: ['rotation'] },
      12,
    );
    const scene = stageScene(vine, startRun(vine, 12))!;
    expect(scene.mood).toBe('thrown');
    const lie = scene.facts.find((f) => f.tone === 'awful');
    expect(lie?.text).toMatch(/rotation/);
    expect(lie?.text).toMatch(/The Ledger/);
  });

  it('says so when the intel held', () => {
    const plan = buildPlan({ targetId: 'argent_vine', crewSize: 4, intelTopics: ['rotation'] }, 13);
    const scene = stageScene(plan, startRun(plan, 13))!;
    expect(scene.facts.some((f) => f.tone === 'good' && /rotation holds/.test(f.text))).toBe(true);
  });

  it('is absent while an event is waiting or the night is over', () => {
    const plan = buildPlan({ targetId: 'argent_vine', crewSize: 4 }, 14);
    const run = playOut(plan, 14, firstChoice as never);
    expect(stageScene(plan, run)).toBeUndefined();
  });

  it('keeps clock and words sane', () => {
    expect(nightClock('stealth', 0)).toBe('11:50 PM');
    expect(nightClock('stealth', 20 * 60)).toBe('12:10 AM');
    expect(nightClock('social', 0)).toBe('4:40 PM');
    expect(readFor(95)).toBe('solid');
    expect(readFor(50)).toBe('even');
    expect(readFor(5)).toBe('grim');
  });
});

describe('a heist survives a reload', () => {
  it('the plan rebuilt from the run is the plan the run started from', () => {
    const c = crewed('reload');
    const ids = activeCrew(c).map((m) => m.id);
    const plan = planFor(c, 'argent_vine', 'stealth', ids, [])!;
    const run = startRun(plan, 42);
    const saved: Campaign = JSON.parse(JSON.stringify({ ...c, run }));
    const rebuilt = planForRun(saved, saved.run!)!;
    expect(rebuilt.crew.map((m) => m.id)).toEqual(plan.crew.map((m) => m.id));

    // Same decisions from the rebuilt plan replay the same night.
    const direct = playOut(plan, 42, firstChoice as never);
    let r: RunState = saved.run!;
    for (let guard = 0; !r.outcome && guard < 60; guard++) {
      if (r.pending) {
        const p = pendingEventFor(rebuilt, r)!;
        r = chooseEventOption(rebuilt, r, firstChoice(p.event as never, p.ctx as never));
      } else r = resolveStage(rebuilt, r);
    }
    expect(r.outcome).toEqual(direct.outcome);
  });
});

describe('crew remember', () => {
  it('everybody on a job takes a line home, and it survives them walking', () => {
    let c = crewed('memory');
    const ids = activeCrew(c).map((m) => m.id);
    const plan = planFor(c, 'argent_vine', 'stealth', ids, [])!;
    const run = playOut(plan, 7, firstChoice as never);
    const day = c.day;
    c = completeHeist(c, run, plan);
    for (const id of ids) {
      const member = c.contacts[id];
      expect(member.memories?.[0].text.length, id).toBeGreaterThan(5);
      expect(member.memories?.[0].day).toBe(day);
      expect(member.memories?.[0].text).toMatch(/Argent & Vine/);
      // And everyone has now done a job with everyone else.
      for (const other of ids) if (other !== id) expect(member.partners?.[other]).toBe(1);
    }
    expect(c.lastReport?.crew).toHaveLength(ids.length);
    expect(c.lastReport?.targetId).toBe('argent_vine');
  });

  it('a member who was caught remembers that above anything else', () => {
    const plan = buildPlan({ targetId: 'argent_vine', crewSize: 3 }, 1);
    const run = startRun(plan, 1);
    const who = plan.crew[0];
    const caught = { ...run, crewRun: { ...run.crewRun, [who.id]: { ...run.crewRun[who.id], caught: true } } };
    expect(memoryFor(who, caught, targetById('argent_vine')!, 3).text).toMatch(/Taken after/);
  });

  it('keeps the memory short', () => {
    const plan = buildPlan({ targetId: 'argent_vine', crewSize: 2 }, 1);
    let m = plan.crew[0];
    for (let i = 0; i < 10; i++) m = remember(m, { day: i, targetId: 'x', text: `job ${i}`, tone: 'neutral' });
    expect(m.memories).toHaveLength(MEMORY_CAP);
    expect(m.memories?.[0].text).toBe('job 9');
  });

  it('bail is remembered', () => {
    let c = crewed('bail', 2);
    const id = activeCrew(c)[0].id;
    c = { ...c, bankroll: 500000, crew: { ...c.crew, [id]: { ...c.crew[id], condition: 'arrested' } } };
    c = bailOut(c, id);
    expect(c.crew[id].member.memories?.[0].text).toMatch(/bail/);
  });

  it('describes loyalty in words', () => {
    expect(loyaltyWord(20)).toBe('A stranger');
    expect(loyaltyWord(65)).toBe('One of yours');
  });
});

describe('sources earn a record', () => {
  it('a lie the night exposed goes on the source’s record', () => {
    let c = crewed('sources');
    const ids = activeCrew(c).map((m) => m.id);
    c = {
      ...c,
      intel: {
        argent_vine: [
          { topicId: 'rotation', sourceId: 'street', confidence: 'false', reading: '', boughtOnDay: 1 },
          { topicId: 'cameras', sourceId: 'ledger', confidence: 'confirmed', reading: '', boughtOnDay: 1 },
        ],
      },
    };
    const plan = planFor(c, 'argent_vine', 'stealth', ids, [])!;
    const run = playOut(plan, 21, firstChoice as never);
    c = completeHeist(c, run, plan);
    expect(c.sourceRecord?.street).toEqual({ sold: 1, lies: 1 });
    expect(c.sourceRecord?.ledger).toEqual({ sold: 1, lies: 0 });
    expect(c.lastReport?.exposed?.some((l) => /Street talk/.test(l))).toBe(true);
    expect(cityWire(c).some((w) => /Street talk has sold you 1 lie/.test(w.text))).toBe(true);
  });
});

describe('the city between jobs', () => {
  it('a fresh city points at something worth doing', () => {
    const wire = cityWire(newCampaign(seedFrom('wire'), 'T'));
    expect(wire.length).toBeGreaterThan(0);
    expect(wire.length).toBeLessThanOrEqual(6);
    expect(wire.some((w) => /Nobody has touched/.test(w.text))).toBe(true);
  });

  it('remembers where you have been, and lets it grow back', () => {
    let c = crewed('wire-hit');
    const ids = activeCrew(c).map((m) => m.id);
    const plan = planFor(c, 'argent_vine', 'stealth', ids, [])!;
    c = completeHeist(c, playOut(plan, 5, firstChoice as never), plan);
    expect(cityWire(c).some((w) => w.targetId === 'argent_vine' && /Police tape/.test(w.text))).toBe(true);
    expect(targetStatus(c, targetById('argent_vine')!)?.tone).toBe('hot');
    const later = { ...c, day: c.day + 20 };
    expect(cityWire(later).some((w) => w.targetId === 'argent_vine' && /%/.test(w.text))).toBe(true);
    expect(targetStatus(later, targetById('argent_vine')!)?.text).toMatch(/restocked/);
  });

  it('names crew in custody and what it costs to get them out', () => {
    const c = crewed('wire-cell', 2);
    const id = activeCrew(c)[0].id;
    const held = { ...c, crew: { ...c.crew, [id]: { ...c.crew[id], condition: 'arrested' as const } } };
    expect(cityWire(held).some((w) => /cell/.test(w.text) && /Bail/.test(w.text))).toBe(true);
  });
});

describe('the paper reads the night', () => {
  const base: HeistResult = {
    grade: 'messy', gross: 40000, crewCut: 10000, net: 30000, heat: 10, durationSeconds: 900,
    complications: 2, injuries: 1, arrests: 0, policeContact: true, stars: 3, notableMoment: '',
    loyaltyDeltas: {}, headline: '', standfirst: '',
  };
  const target = targetById('argent_vine')!;
  const print = (r: HeistResult, seed = 1) =>
    generateNewsReport({ result: r, target, crew: [], day: 3, seed, cursor: 0 });

  it('does not say nobody was hurt on a night somebody was', () => {
    for (let seed = 0; seed < 40; seed++) {
      const story = print(base, seed);
      expect(`${story.standfirst} ${story.body}`).not.toMatch(/Nobody was seriously hurt/);
    }
  });

  it('does not print a sum over a job that took nothing', () => {
    for (let seed = 0; seed < 20; seed++) {
      const story = print({ ...base, gross: 0, grade: 'clean', policeContact: false, injuries: 0 }, seed);
      expect(story.headline).not.toMatch(/\$0/);
      expect(story.body).toMatch(/Nothing is believed to have been taken/);
    }
  });

  it('counts the arrests it reports', () => {
    const story = print({ ...base, arrests: 2, grade: 'catastrophic' }, 3);
    expect(`${story.headline} ${story.body}`).not.toMatch(/ONE HELD/);
  });
});
