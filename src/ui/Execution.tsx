import { useEffect, useMemo, useRef } from 'react';
import { STAGE_PROFILES } from '../game/stages';
import { pendingEventFor } from '../game/resolve';
import { planFor } from '../game/campaign';
import { useStore } from '../state/store';
import { Hud, Meter, clock, money } from './parts';
import { STAGE_ORDER } from '../game/types';

export function Execution() {
  const { campaign, draft, nextStage, choose, bankHeist } = useStore();
  const c = campaign!;
  const run = c.run!;
  const endRef = useRef<HTMLDivElement>(null);

  const plan = useMemo(
    () =>
      draft.targetId && draft.approachId
        ? planFor(c, draft.targetId, draft.approachId, draft.crewIds, draft.equipmentIds)
        : undefined,
    [c, draft],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [run.log.length, run.pending]);

  if (!plan) return null;

  const pending = pendingEventFor(plan, run);
  const stage = STAGE_ORDER[Math.min(run.stageIndex, STAGE_ORDER.length - 1)];
  const exposed = run.exposedAt !== null;
  const sinceExposed = exposed ? run.clock - (run.exposedAt ?? 0) : 0;
  const remaining = Math.max(0, run.window - sinceExposed);

  return (
    <>
      <Hud title={plan.target.name} bankroll={c.bankroll} heat={c.heat} day={c.day} />
      <div className="screen">
        <div className="run">
          <div className="run__gauges panel">
            <div className="gauge">
              <div className="spread">
                <span className="eyebrow">On site</span>
                <span className="num">{clock(run.clock)}</span>
              </div>
              <div className="gauge__note faint">
                {exposed
                  ? run.policeOnSite
                    ? 'They are here.'
                    : `${clock(remaining)} before the response arrives`
                  : 'Nobody outside is counting yet'}
              </div>
              <Meter
                value={exposed ? Math.min(100, (sinceExposed / run.window) * 100) : 0}
                color={run.policeOnSite ? 'var(--red)' : 'var(--gold)'}
              />
            </div>
            <div className="gauge">
              <div className="spread">
                <span className="eyebrow">Noise</span>
                <span className="num">{Math.round(run.noise)}</span>
              </div>
              <div className="gauge__note faint">
                {run.alarm ? 'The alarm is out' : run.noise > 30 ? 'Somebody is going to hear that' : 'Quiet'}
              </div>
              <Meter value={run.noise} color={run.noise > 45 ? 'var(--red)' : 'var(--blue)'} />
            </div>
          </div>

          <div className="run__log">
            {run.log.map((entry, i) => (
              <div key={i} className={`beat beat--${entry.tone} beat--${entry.kind}`}>
                {entry.kind === 'stage' ? (
                  <span className="beat__stage">{STAGE_PROFILES[entry.stage].name}</span>
                ) : null}
                <p>{entry.text.replace(/^[A-Za-z]+: /, '')}</p>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {pending ? (
            <div className="event paper">
              <div className="event__flag">Unexpected</div>
              <h3 className="event__title">{pending.event.title}</h3>
              <p className="event__body">{pending.body}</p>
              <div className="event__choices">
                {pending.event.choices
                  .filter((choice) => !choice.when || choice.when(pending.ctx))
                  .map((choice) => (
                    <button key={choice.id} className="choice" onClick={() => choose(choice.id)}>
                      <span className="choice__label">{choice.label}</span>
                      <span className="choice__hint">{choice.hint}</span>
                    </button>
                  ))}
              </div>
            </div>
          ) : run.outcome ? (
            <button className="btn btn--gold btn--wide go" onClick={bankHeist}>
              Count it — {money(run.outcome.net)}
            </button>
          ) : (
            <button className="btn btn--primary btn--wide go" onClick={nextStage}>
              {run.stageIndex === 0 ? 'Go' : STAGE_PROFILES[stage].name}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
