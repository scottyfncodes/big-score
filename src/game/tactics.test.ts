import { describe, expect, it } from 'vitest';
import { buildPlan, type SimOptions } from './sim';
import { abortRun, canAbort, playOut, resolveStage, startRun, stageRevelations } from './resolve';
import type { RunState, StageTactic } from './types';

/**
 * The stage call — careful, steady, push — is the decision the player makes
 * six times a night. These tests hold its shape: steady is the engine exactly
 * as it was balanced, and neither of the other two is a policy you can just
 * always pick. The right call depends on the building and on whether anybody
 * outside is counting yet, which is the point of offering it.
 */

type Policy = (run: RunState) => StageTactic;

function tally(options: SimOptions, policy: Policy, runs = 300) {
  let good = 0;
  let held = 0;
  let cops = 0;
  let net = 0;
  for (let i = 0; i < runs; i++) {
    const seed = 1000 + i * 7919;
    const plan = buildPlan(options, seed);
    const run = playOut(
      plan,
      seed,
      (event, ctx) => event.choices.filter((c) => (!c.when || c.when(ctx)) && c.id !== 'abort')[0].id,
      [],
      policy,
    );
    const o = run.outcome!;
    if (o.grade === 'perfect' || o.grade === 'clean') good++;
    if (o.arrests) held++;
    if (o.policeContact) cops++;
    net += o.net;
  }
  return { good: good / runs, held: held / runs, cops: cops / runs, net: net / runs };
}

const always = (t: StageTactic): Policy => () => t;

const gallery: SimOptions = {
  targetId: 'kestrel_gallery',
  approachId: 'stealth',
  crewRoles: ['scout', 'safecracker', 'hacker', 'driver'],
  equipmentIds: ['comms', 'bypass'],
};
const jeweller: SimOptions = {
  targetId: 'argent_vine',
  approachId: 'stealth',
  crewRoles: ['scout', 'safecracker', 'driver', 'hacker'],
  equipmentIds: ['comms', 'bypass', 'drill'],
};
const loudBank: SimOptions = {
  targetId: 'port_argent_savings',
  approachId: 'aggressive',
  crewRoles: ['muscle', 'driver', 'safecracker', 'face'],
  equipmentIds: ['comms', 'torch', 'vehicle'],
  experienceBias: 1,
};
const quietBank: SimOptions = {
  targetId: 'port_argent_savings',
  approachId: 'technical',
  crewRoles: ['hacker', 'safecracker', 'driver', 'scout'],
  equipmentIds: ['comms', 'jammer', 'drill'],
  experienceBias: 1,
};

describe('stage calls', () => {
  it('steady is the engine exactly as balanced', () => {
    const plan = buildPlan(gallery, 99);
    const pick = (e: { choices: { id: string }[] }) => e.choices[0].id;
    const a = playOut(plan, 99, pick as never);
    const b = playOut(plan, 99, pick as never, [], always('steady'));
    expect(b.outcome).toEqual(a.outcome);
    expect(b.results.every((r) => r.tactic === undefined)).toBe(true);
  });

  it('taking your time pays on a hard lock nobody is watching', () => {
    const steady = tally(gallery, always('steady'));
    const careful = tally(gallery, always('careful'));
    expect(careful.good).toBeGreaterThan(steady.good);
    expect(careful.held).toBeLessThan(steady.held);
  });

  it('but lingering is how a quiet job gets noticed', () => {
    const steady = tally(quietBank, always('steady'));
    const careful = tally(quietBank, always('careful'));
    expect(careful.cops).toBeGreaterThan(steady.cops + 0.2);
    expect(careful.held).toBeGreaterThan(steady.held);
    // And on an easy job it is simply slower, not better.
    expect(tally(jeweller, always('careful')).good).toBeLessThan(tally(jeweller, always('steady')).good);
  });

  it('pushing trades the take for getting out before the response', () => {
    const steady = tally(loudBank, always('steady'));
    const push = tally(loudBank, always('push'));
    expect(push.held).toBeLessThan(steady.held);
    expect(push.net).toBeLessThan(steady.net);
    // Pushing a quiet job is just worse.
    expect(tally(gallery, always('push')).good).toBeLessThan(tally(gallery, always('steady')).good);
  });

  it('reading the room beats any single call on a hard job', () => {
    const smart: Policy = (run) => (run.exposedAt === null ? 'careful' : 'push');
    const read = tally(gallery, smart);
    for (const t of ['careful', 'steady', 'push'] as StageTactic[]) {
      expect(read.held, t).toBeLessThanOrEqual(tally(gallery, always(t)).held);
    }
  });

  it('records the call on the stage it was made', () => {
    const plan = buildPlan(gallery, 5);
    let run = startRun(plan, 5);
    run = resolveStage(plan, run, 'careful');
    expect(run.results[0].tactic).toBe('careful');
  });
});

describe('finding out', () => {
  it('a lie is revealed at the stage it was about, once, naming the source', () => {
    const plan = buildPlan({ ...gallery, intelTopics: ['cameras'], falseIntelTopics: ['cameras'] }, 11);
    let run = startRun(plan, 11);
    expect(stageRevelations(plan, run, 'approach').lies).toHaveLength(0);
    expect(stageRevelations(plan, run, 'security').lies).toHaveLength(1);
    while (!run.outcome && run.stageIndex <= 2) {
      run = run.pending
        ? (run = { ...run, pending: undefined, stageIndex: run.stageIndex + 1 })
        : resolveStage(plan, run);
    }
    expect(run.revealedLies?.map((l) => l.topicId)).toEqual(['cameras']);
    expect(run.revealedLies?.[0].stage).toBe('security');
    const reveal = run.log.find((l) => l.kind === 'reveal');
    expect(reveal?.text).toMatch(/Camera coverage was wrong/);
    expect(reveal?.text).toMatch(/The Ledger/);
    expect(stageRevelations(plan, run, 'security').lies).toHaveLength(0);
  });

  it('true intel is never revealed as a lie', () => {
    for (let seed = 0; seed < 40; seed++) {
      const plan = buildPlan({ ...gallery, intelTopics: ['cameras', 'vault', 'access'] }, seed);
      const run = playOut(plan, seed, (e, ctx) => e.choices.filter((c) => !c.when || c.when(ctx))[0].id);
      expect(run.revealedLies ?? []).toHaveLength(0);
    }
  });

  it('dead kit is found at the stage that reached for it', () => {
    let found = 0;
    for (let seed = 0; seed < 200; seed++) {
      const plan = buildPlan({ ...gallery, equipmentIds: ['drill', 'bypass'] }, seed);
      const run = playOut(plan, seed, (e, ctx) => e.choices.filter((c) => !c.when || c.when(ctx))[0].id);
      for (const id of run.revealedDeadKit ?? []) expect(run.deadKitIds).toContain(id);
      if (run.deadKitIds.includes('drill') && run.results.some((r) => r.stage === 'objective')) {
        expect(run.revealedDeadKit).toContain('drill');
        found++;
      }
    }
    expect(found).toBeGreaterThan(3);
  });
});

describe('calling it off', () => {
  it('is possible until the objective, and costs nothing if nobody noticed', () => {
    const plan = buildPlan(jeweller, 3);
    let run = startRun(plan, 3);
    expect(canAbort(run)).toBe(true);
    run = abortRun(plan, run);
    expect(run.outcome?.gross).toBe(0);
    expect(run.outcome?.grade).toBe('clean');
    expect(run.outcome?.arrests).toBe(0);
  });

  it('is not possible once the bags are full', () => {
    const plan = buildPlan(jeweller, 4);
    let run = startRun(plan, 4);
    while (!run.outcome && run.stageIndex < 4) {
      run = run.pending ? { ...run, pending: undefined, stageIndex: run.stageIndex + 1 } : resolveStage(plan, run);
    }
    if (!run.outcome) {
      expect(canAbort(run)).toBe(false);
      expect(abortRun(plan, run)).toBe(run);
    }
  });
});
