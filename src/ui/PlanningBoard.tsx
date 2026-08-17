import { useMemo, useState } from 'react';
import { STAGE_PROFILES } from '../game/stages';
import { analysePlan, stageOdds } from '../game/calc';
import { activeCrew, ownedEquipment, planFor } from '../game/campaign';
import { useStore } from '../state/store';
import { CrewCard, Hud, Meter, Sheet, money, shortMoney } from './parts';
import { STAGE_ORDER } from '../game/types';

/**
 * The planning board.
 *
 * The player picks the crew and the kit; the board shows which of them ends up
 * leading each stage and how thin that stage is. Assignment is deliberately
 * not drag-and-drop into slots — on a phone that is a fight, and the honest
 * model is that the best person for a job does that job. What the player is
 * really choosing is who is in the room.
 */
export function PlanningBoard() {
  const { campaign, draft, dispatch, beginHeist } = useStore();
  const c = campaign!;
  const [picker, setPicker] = useState<'crew' | 'kit' | undefined>();

  const roster = activeCrew(c);
  const kit = ownedEquipment(c);

  const plan = useMemo(
    () =>
      draft.targetId && draft.approachId
        ? planFor(c, draft.targetId, draft.approachId, draft.crewIds, draft.equipmentIds)
        : undefined,
    [c, draft],
  );

  if (!plan) return null;

  const analysis = analysePlan(plan);
  const odds = stageOdds(plan);
  const ready = plan.crew.length >= 2;

  return (
    <>
      <Hud
        title={`${plan.target.name} · ${plan.approach.name}`}
        onBack={() => dispatch({ type: 'SCREEN', screen: 'target' })}
        bankroll={c.bankroll}
        heat={c.heat}
        day={c.day}
      />
      <div className="screen screen--wide">
        <div className="board">
          <div className="board__col">
            <div className="readout paper">
              <div className="eyebrow eyebrow--paper">The plan holds</div>
              <div className="readout__pct">{analysis.successChance}%</div>
              <p className="readout__caption">
                Chance every stage goes the way it is drawn. It is calculated from what you
                believe, not from what is true.
              </p>
              <div className="readout__grid">
                <div>
                  <span className="eyebrow eyebrow--paper">Expected take</span>
                  <strong>{money(analysis.expectedTake)}</strong>
                </div>
                <div>
                  <span className="eyebrow eyebrow--paper">Crew cut</span>
                  <strong>{Math.round(analysis.crewCut * 100)}%</strong>
                </div>
                <div>
                  <span className="eyebrow eyebrow--paper">Heat</span>
                  <strong>+{analysis.heat}</strong>
                </div>
                <div>
                  <span className="eyebrow eyebrow--paper">Weak point</span>
                  <strong>{STAGE_PROFILES[analysis.weakPoint.stage].name}</strong>
                </div>
              </div>
              <p className="readout__rec">{analysis.recommendation}</p>
            </div>

            <div className="panel">
              <div className="spread">
                <div className="eyebrow">Crew · {plan.crew.length}</div>
                <button className="btn btn--sm" onClick={() => setPicker('crew')}>
                  {plan.crew.length ? 'Change' : 'Add crew'}
                </button>
              </div>
              {plan.crew.length === 0 ? (
                <p className="faint" style={{ fontSize: 13 }}>Nobody is on this job yet.</p>
              ) : (
                <div className="chips">
                  {plan.crew.map((m) => (
                    <span key={m.id} className="chip">
                      <strong>{m.name.split(' ')[0]}</strong>
                      <span className="faint"> {m.role}</span>
                    </span>
                  ))}
                </div>
              )}
              {analysis.synergy.notes.length ? (
                <div className="cohesion">
                  <div className="spread">
                    <span className="eyebrow">Cohesion</span>
                    <span className={`num ${analysis.synergy.value >= 0 ? 'good' : 'bad'}`}>
                      {analysis.synergy.value >= 0 ? '+' : ''}
                      {analysis.synergy.value}
                    </span>
                  </div>
                  {analysis.synergy.notes.map((note) => (
                    <div key={note} className="cohesion__note faint">
                      {note}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="panel">
              <div className="spread">
                <div className="eyebrow">Equipment · {plan.equipment.length}</div>
                <button className="btn btn--sm" onClick={() => setPicker('kit')} disabled={!kit.length}>
                  {kit.length ? 'Attach' : 'None owned'}
                </button>
              </div>
              {plan.equipment.length === 0 ? (
                <p className="faint" style={{ fontSize: 13 }}>
                  Everything rests on the crew.
                </p>
              ) : (
                <div className="chips">
                  {plan.equipment.map((e) => (
                    <span key={e.id} className="chip">
                      {e.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {analysis.warnings.length ? (
              <div className="panel warnings">
                <div className="eyebrow" style={{ marginBottom: 6 }}>Problems</div>
                {analysis.warnings.map((w) => (
                  <div key={w} className="warnings__row">
                    <span className="warnings__mark">!</span>
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="board__col">
            <div className="spine">
              <div className="spine__head">
                <span className="eyebrow">The night, in order</span>
              </div>
              {STAGE_ORDER.map((stage, i) => {
                const profile = STAGE_PROFILES[stage];
                const row = odds[i];
                const lead = plan.crew.find((m) => m.id === row.actorId);
                const weak = analysis.weakPoint.stage === stage;
                const attached = plan.equipment.filter((e) => (e.bonus[stage] ?? 0) > 0);
                return (
                  <div key={stage} className={`stage${weak ? ' stage--weak' : ''}`}>
                    <div className="stage__rail">
                      <span className="stage__dot" />
                      {i < STAGE_ORDER.length - 1 ? <span className="stage__line" /> : null}
                    </div>
                    <div className="stage__body">
                      <div className="spread">
                        <div className="stage__name">{profile.name}</div>
                        <div className={`stage__odds num ${band(row.chance)}`}>{row.chance}%</div>
                      </div>
                      <Meter
                        value={row.chance}
                        color={
                          row.chance > 75
                            ? 'var(--green)'
                            : row.chance > 50
                              ? 'var(--gold)'
                              : 'var(--red)'
                        }
                      />
                      <div className="stage__blurb">{profile.blurb}</div>
                      <div className="stage__meta">
                        <span className="tag">{row.attr}</span>
                        {lead ? (
                          <span className="tag tag--gold">{lead.name.split(' ')[0]} leads</span>
                        ) : (
                          <span className="tag tag--red">Nobody covers this</span>
                        )}
                        {attached.map((e) => (
                          <span key={e.id} className="tag tag--blue">
                            {e.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              className="btn btn--primary btn--wide go"
              disabled={!ready}
              onClick={beginHeist}
            >
              {ready ? `Run it — ${shortMoney(analysis.expectedTake)} expected` : 'You need at least two people'}
            </button>
          </div>
        </div>
      </div>

      {picker === 'crew' ? (
        <Sheet title="Who is on this job?" onClose={() => setPicker(undefined)}>
          <div className="stack">
            {roster.length === 0 ? (
              <p className="faint">
                Nobody is available. Hire someone from the crew room first.
              </p>
            ) : (
              roster.map((member) => (
                <CrewCard
                  key={member.id}
                  member={member}
                  selected={draft.crewIds.includes(member.id)}
                  onClick={() => dispatch({ type: 'TOGGLE_CREW', id: member.id })}
                  footer={
                    <div className="crew-card__foot">
                      <span>{member.bio}</span>
                      <span className="num">{Math.round(member.cut * 100)}%</span>
                    </div>
                  }
                />
              ))
            )}
          </div>
        </Sheet>
      ) : null}

      {picker === 'kit' ? (
        <Sheet title="What are you taking?" onClose={() => setPicker(undefined)}>
          <div className="stack">
            {kit.map((item) => {
              const on = draft.equipmentIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  className={`kit${on ? ' kit--owned' : ''}`}
                  onClick={() => dispatch({ type: 'TOGGLE_KIT', id: item.id })}
                  style={{ textAlign: 'left' }}
                >
                  <div className="spread">
                    <span className="kit__name">{item.name}</span>
                    <span className={`tag ${on ? 'tag--green' : ''}`}>{on ? 'Taking' : 'Leave'}</span>
                  </div>
                  <p className="kit__blurb">{item.blurb}</p>
                </button>
              );
            })}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

const band = (chance: number) => (chance > 75 ? 'good' : chance > 50 ? 'warn' : 'bad');
