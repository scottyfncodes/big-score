import { useMemo, useState } from 'react';
import { targetById } from '../data/targets';
import { districtById } from '../data/districts';
import { APPROACHES } from '../data/approaches';
import {
  activeCrew,
  approachesFor,
  heldIntel,
  purchaseIntel,
  scout,
  scoutPasses,
  targetUnderHeat,
} from '../game/campaign';
import { SOURCES, intelCost, scoutCostFor, scoutedSecurity } from '../game/intel';
import { useStore } from '../state/store';
import { Hud, Sheet, money } from './parts';
import type { IntelTopic, Security } from '../game/types';

const SECURITY_LABELS: Record<keyof Security, string> = {
  guards: 'Guards',
  cameras: 'Cameras',
  alarm: 'Alarm',
  accessControl: 'Access control',
  responseTime: 'Police response',
};

export function TargetBoard() {
  const { campaign, draft, dispatch, update } = useStore();
  const c = campaign!;
  const target = targetById(draft.targetId ?? '');
  const [buying, setBuying] = useState<IntelTopic | undefined>();

  const passes = target ? scoutPasses(c, target.id) : 0;
  const crew = activeCrew(c);
  const held = target ? heldIntel(c, target.id) : [];
  const heldIds = new Set(held.map((i) => i.topicId));

  const hot = useMemo(
    () => (target ? targetUnderHeat(target, c.heat) : undefined),
    [target, c.heat],
  );
  const estimate = useMemo(
    () => (hot ? scoutedSecurity(hot, passes, crew) : undefined),
    [hot, passes, crew],
  );

  if (!target || !hot || !estimate) return null;

  const scoutCost = scoutCostFor(target, passes);
  const approaches = approachesFor(c, target);

  return (
    <>
      <Hud
        title={target.name}
        onBack={() => dispatch({ type: 'SCREEN', screen: 'city' })}
        bankroll={c.bankroll}
        heat={c.heat}
        day={c.day}
      />
      <div className="screen">
        <div className="stack">
          <div className="dossier paper">
            <div className="dossier__stamp">{target.type}</div>
            <h2 className="dossier__name">{target.name}</h2>
            <div className="eyebrow eyebrow--paper">
              {districtById(target.districtId)?.name} · Tier {target.tier}
            </div>
            <p className="dossier__blurb">{target.blurb}</p>
            <div className="dossier__value">
              <span className="eyebrow eyebrow--paper">Headline value</span>
              <strong>{money(target.value)}</strong>
            </div>
            {passes > 0 ? (
              <p className="dossier__weakness">
                <span className="eyebrow eyebrow--paper">Weak point</span>
                {target.weakness}
              </p>
            ) : null}
          </div>

          <div className="panel">
            <div className="spread">
              <div>
                <div className="eyebrow">Surveillance</div>
                <div className="dim" style={{ fontSize: 13, marginTop: 3 }}>
                  {passes === 0
                    ? 'Nobody has looked at this properly yet.'
                    : `${passes} pass${passes > 1 ? 'es' : ''} — the estimates are tightening.`}
                </div>
              </div>
              <button
                className="btn btn--sm"
                disabled={c.bankroll < scoutCost || passes >= 3}
                onClick={() => update((camp) => scout(camp, target.id, scoutCost))}
              >
                {passes >= 3 ? 'Exhausted' : `Scout ${money(scoutCost)}`}
              </button>
            </div>

            <div className="sec">
              {(Object.keys(SECURITY_LABELS) as (keyof Security)[]).map((key) => {
                const band = estimate[key];
                const isTime = key === 'responseTime';
                return (
                  <div key={key} className="sec__row">
                    <span className="sec__label">{SECURITY_LABELS[key]}</span>
                    {band.known ? (
                      <span className="sec__value num">
                        {isTime
                          ? `${Math.round(band.low / 60)}–${Math.round(band.high / 60)} min`
                          : band.low === band.high
                            ? band.low
                            : `${band.low}–${band.high}`}
                      </span>
                    ) : (
                      <span className="sec__value faint">— unknown —</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel">
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Intelligence
            </div>
            <div className="stack">
              {target.topics.map((topic) => {
                const owned = held.find((i) => i.topicId === topic.id);
                return (
                  <div key={topic.id} className={`intel${owned ? ' intel--owned' : ''}`}>
                    <div className="intel__head">
                      <span className="intel__label">{topic.label}</span>
                      {owned ? (
                        <span className={`tag ${owned.confidence === 'confirmed' ? 'tag--green' : 'tag--gold'}`}>
                          {owned.confidence === 'confirmed' ? 'Confirmed' : 'Rumoured'}
                        </span>
                      ) : (
                        <button className="btn btn--sm" onClick={() => setBuying(topic)}>
                          Buy
                        </button>
                      )}
                    </div>
                    <p className="intel__claim">{owned ? owned.reading : topic.claim}</p>
                    {topic.unlocksApproach && !owned ? (
                      <span className="tag tag--blue">Unlocks the Inside Job</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <p className="faint intel__note">
              A source sells what it has. Cheap information is confident and often wrong,
              and you will only find out which on the night.
            </p>
          </div>

          <div className="panel">
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Approach
            </div>
            <div className="stack">
              {target.approaches.map((id) => {
                const approach = APPROACHES[id];
                const locked = !approaches.includes(id);
                return (
                  <button
                    key={id}
                    className={`approach${draft.approachId === id ? ' approach--on' : ''}${locked ? ' approach--locked' : ''}`}
                    disabled={locked}
                    onClick={() => dispatch({ type: 'DRAFT', draft: { approachId: id } })}
                  >
                    <div className="approach__name">{approach.name}</div>
                    <div className="approach__blurb">
                      {locked ? 'Needs a name on the inside — buy the intel first.' : approach.blurb}
                    </div>
                    <div className="approach__tags">
                      <span className="tag">+{approach.heatBase} heat</span>
                      {approach.keyRoles.map((role) => (
                        <span key={role} className="tag">
                          {role}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            className="btn btn--primary btn--wide"
            disabled={!draft.approachId}
            onClick={() => dispatch({ type: 'SCREEN', screen: 'plan' })}
          >
            {draft.approachId ? 'Build the plan' : 'Choose an approach'}
          </button>
        </div>
      </div>

      {buying ? (
        <Sheet title={buying.label} onClose={() => setBuying(undefined)}>
          <p className="dim" style={{ marginTop: 0, fontSize: 13 }}>{buying.claim}</p>
          <div className="stack">
            {SOURCES.map((source) => {
              const cost = intelCost(buying, source, crew);
              return (
                <button
                  key={source.id}
                  className="source"
                  disabled={c.bankroll < cost || heldIds.has(buying.id)}
                  onClick={() => {
                    update((camp) => purchaseIntel(camp, target.id, buying.id, source.id));
                    setBuying(undefined);
                  }}
                >
                  <div>
                    <div className="source__name">{source.name}</div>
                    <div className="source__desc faint">
                      {source.reliability > 80
                        ? 'Expensive, careful, and has never sold you a story.'
                        : source.reliability > 55
                          ? 'Usually right. Occasionally guessing, and says so.'
                          : 'Cheap. Certain. Not the same thing as correct.'}
                    </div>
                  </div>
                  <span className="money">{money(cost)}</span>
                </button>
              );
            })}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
