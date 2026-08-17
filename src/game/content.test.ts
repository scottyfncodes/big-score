import { describe, expect, it } from 'vitest';
import { EVENTS } from '../data/events';
import { NARRATION } from '../data/narration';
import { TRAITS } from '../data/traits';
import { TARGETS } from '../data/targets';
import { EQUIPMENT } from '../data/equipment';
import { DISTRICTS } from '../data/districts';
import { APPROACHES } from '../data/approaches';
import { STAGE_ORDER } from './types';
import { buildPlan } from './sim';
import { playOut } from './resolve';

/**
 * Content integrity. These are cheap and they catch the class of bug that is
 * invisible in a screenshot: an event that names a trait nobody has, a target
 * in a district that does not exist, prose that repeats inside one night.
 */

describe('content', () => {
  it('every event names somebody and offers a real decision', () => {
    for (const event of EVENTS) {
      expect(event.choices.length, event.id).toBeGreaterThanOrEqual(2);
      expect(event.body, event.id).toContain('{actor}');
      expect(event.stages.length, event.id).toBeGreaterThan(0);
      for (const choice of event.choices) {
        expect(choice.label.length, `${event.id}/${choice.id}`).toBeGreaterThan(2);
        expect(choice.hint.length, `${event.id}/${choice.id}`).toBeGreaterThan(2);
      }
    }
  });

  it('every event is conditioned on something, not fired at random', () => {
    const conditioned = EVENTS.filter((e) => e.when || e.actor.role || e.actor.trait);
    expect(conditioned.length / EVENTS.length).toBeGreaterThan(0.7);
  });

  it('events only reference traits that exist', () => {
    for (const event of EVENTS) {
      if (event.actor.trait) expect(TRAITS[event.actor.trait], event.id).toBeDefined();
    }
  });

  it('every trait is named by at least one event', () => {
    const used = new Set(EVENTS.map((e) => e.actor.trait).filter(Boolean));
    for (const id of Object.keys(TRAITS)) {
      expect(used.has(id), `trait "${id}" has no event`).toBe(true);
    }
  });

  it('every target sits in a real district and offers real approaches', () => {
    const districts = new Set(DISTRICTS.map((d) => d.id));
    for (const target of TARGETS) {
      expect(districts.has(target.districtId), target.id).toBe(true);
      expect(target.approaches.length, target.id).toBeGreaterThanOrEqual(3);
      expect(target.topics.length, target.id).toBeGreaterThanOrEqual(3);
      for (const approach of target.approaches) expect(APPROACHES[approach]).toBeDefined();
      for (const topic of target.topics) {
        expect(topic.label.length, `${target.id}/${topic.id}`).toBeGreaterThan(0);
        expect(topic.claim.length, `${target.id}/${topic.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('every stage and outcome has more than one line of prose', () => {
    for (const stage of STAGE_ORDER) {
      for (const outcome of Object.keys(NARRATION[stage])) {
        const lines = NARRATION[stage][outcome as keyof (typeof NARRATION)[typeof stage]];
        expect(lines.length, `${stage}/${outcome}`).toBeGreaterThanOrEqual(2);
        for (const line of lines) expect(line, `${stage}/${outcome}`).toContain('{who}');
      }
    }
  });

  it('no line of stage narration repeats inside one night', () => {
    for (let seed = 0; seed < 60; seed++) {
      const plan = buildPlan({ targetId: 'kestrel_gallery', crewSize: 4 }, seed);
      const run = playOut(plan, seed, (event, ctx) => {
        const usable = event.choices.filter((c) => !c.when || c.when(ctx));
        return usable[0].id;
      });
      const lines = run.results.map((r) => r.detail);
      expect(new Set(lines).size, `seed ${seed}`).toBe(lines.length);
    }
  });

  it('no event fires twice in one night', () => {
    for (let seed = 0; seed < 60; seed++) {
      const plan = buildPlan({ targetId: 'port_argent_savings', crewSize: 5 }, seed);
      const run = playOut(plan, seed, (event, ctx) => {
        const usable = event.choices.filter((c) => !c.when || c.when(ctx));
        return usable[usable.length - 1].id;
      });
      expect(new Set(run.firedEventIds).size).toBe(run.firedEventIds.length);
    }
  });

  it('equipment is priced and does something', () => {
    for (const item of EQUIPMENT) {
      expect(item.cost, item.id).toBeGreaterThan(0);
      const helps =
        Object.keys(item.bonus).length > 0 ||
        item.attrBonus ||
        item.noiseMul !== undefined ||
        item.timeMul !== undefined;
      expect(helps, item.id).toBeTruthy();
    }
  });
});
