import { useMemo, useState } from 'react';
import { STAGE_PROFILES } from '../game/stages';
import { TAG_LABELS } from '../data/equipment';
import { ARCHETYPES } from '../data/crew';
import { CREW_SOFT_MAX, analysePlan, stageOdds } from '../game/calc';
import { activeCrew, heatTier, ownedEquipment, planFor } from '../game/campaign';
import { shownConfidence, sourceById } from '../game/intel';
import { READ_WORDS, planTheory, readFor } from '../game/scene';
import { useStore } from '../state/store';
import { CrewCard, Hud, Sheet, money, shortMoney, useNumbers } from './parts';
import { STAGE_ORDER } from '../game/types';

/**
 * The planning board.
 *
 * Built as a theory rather than a dashboard: what the player knows (the
 * building, the kit, who is in the room), what they believe (the intel, and
 * who sold it), and what they are putting on the table. The odds are all
 * still here — in words by default, with the numbers one toggle away — but
 * the first thing on the board is the plan read back as sentences, because
 * "nobody here can open that safe" is a decision and 11% is a statistic.
 */
export function PlanningBoard() {
  const { campaign, screen, draft, dispatch, beginHeist } = useStore();
  const c = campaign!;
  const [picker, setPicker] = useState<'crew' | 'kit' | undefined>();
  const [numbers, setNumbers] = useNumbers();

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
  const theory = planTheory(plan);
  const ready = plan.crew.length >= 2;
  const have = new Set(plan.crew.map((m) => m.role));
  const missingRoles = plan.approach.keyRoles.filter((r) => !have.has(r));
  const base = plan.target.value * plan.approach.takeMul;
  const heatAfter = Math.min(100, c.heat + analysis.heat);
  const tierAfter = heatTier(heatAfter);
  const crewFirst = (id?: string) => plan.crew.find((m) => m.id === id)?.name.split(' ')[0];

  return (
    <>
      <Hud
        title={`${plan.target.name} · ${plan.approach.name}`}
        onBack={() => dispatch({ type: 'SCREEN', screen: 'target' })}
        bankroll={c.bankroll}
        heat={c.heat}
        day={c.day}
        nav={{ screen, go: (next) => dispatch({ type: 'SCREEN', screen: next }) }}
      />
      <div className="screen screen--wide screen--action">
        <div className="board">
          <div className="board__col">
            <div className="readout paper">
              <div className="spread">
                <div className="eyebrow eyebrow--paper">The theory</div>
                <span className={`verdict-chip verdict-chip--${analysis.verdict.toLowerCase().replace(' ', '-')}`}>
                  {analysis.verdict}
                </span>
              </div>
              {plan.crew.length === 0 ? (
                <p className="theory__empty">Nobody is on this job yet. Start with who is in the room.</p>
              ) : (
                <p className="theory">
                  {theory.map((line) => (
                    <span key={line.stage} className={`theory__line read--${line.read}`}>
                      {line.text}{' '}
                    </span>
                  ))}
                </p>
              )}
              <div className="readout__pair">
                <div>
                  <span className="eyebrow eyebrow--paper">Goes to plan</span>
                  <div className={`readout__word read--${readFor(analysis.successChance)}`}>
                    {READ_WORDS[readFor(analysis.successChance)]}
                    {numbers ? <span className="num"> {analysis.successChance}%</span> : null}
                  </div>
                </div>
                <div>
                  <span className="eyebrow eyebrow--paper">Everyone comes home</span>
                  <div className={`readout__word read--${readFor(analysis.getawayChance)}`}>
                    {READ_WORDS[readFor(analysis.getawayChance)]}
                    {numbers ? <span className="num"> {analysis.getawayChance}%</span> : null}
                  </div>
                </div>
              </div>
              <label className="numbers-toggle">
                <input type="checkbox" checked={numbers} onChange={(e) => setNumbers(e.target.checked)} />
                <span>Show the numbers</span>
              </label>
            </div>

            <div className="panel">
              <div className="spread">
                <div className="eyebrow">Who is in the room · {plan.crew.length}</div>
                <button className="btn btn--sm" onClick={() => setPicker('crew')}>
                  {plan.crew.length ? 'Change' : 'Add crew'}
                </button>
              </div>
              {plan.crew.length === 0 ? (
                <p className="faint" style={{ fontSize: 13 }}>
                  {roster.length ? 'Nobody picked yet.' : 'Nobody is available. Hire from the Crew tab first.'}
                </p>
              ) : (
                <div className="chips">
                  {plan.crew.map((m) => (
                    <span key={m.id} className="chip">
                      <strong>{m.name.split(' ')[0]}</strong>
                      <span className="faint"> {ARCHETYPES[m.role].name.toLowerCase()}</span>
                      {m.jobsWithYou ? <span className="chip__jobs">{m.jobsWithYou}</span> : null}
                    </span>
                  ))}
                </div>
              )}
              {missingRoles.length ? (
                <p className="plan__gap">
                  No {missingRoles.map((r) => ARCHETYPES[r].name.toLowerCase()).join(' or ')} — {plan.approach.name}{' '}
                  leans on {missingRoles.length > 1 ? 'them' : 'one'}. You can still go.
                </p>
              ) : null}
              {plan.crew.length > CREW_SOFT_MAX ? (
                <p className="plan__gap">More bodies than the job needs: a bigger cut, more Heat, and everyone in each other’s way.</p>
              ) : null}
              {analysis.synergy.notes.length ? (
                <div className="cohesion">
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
                <div>
                  <div className="eyebrow">What you know</div>
                  <div className="panel__sub">The building, and what you are carrying into it</div>
                </div>
                <button className="btn btn--sm" onClick={() => setPicker('kit')} disabled={!kit.length}>
                  {kit.length ? `Kit · ${plan.equipment.length}` : 'No kit'}
                </button>
              </div>
              <div className="stack" style={{ gap: 6, marginTop: 10 }}>
                {analysis.kit.length === 0 ? (
                  <p className="faint" style={{ fontSize: 13, margin: 0 }}>
                    This job asks for nothing specific. Whatever you bring helps.
                  </p>
                ) : (
                  analysis.kit.map((need) => (
                    <div
                      key={`${need.tag}-${need.stage}`}
                      className={`kitrow${need.covered ? ' kitrow--ok' : need.critical ? ' kitrow--bad' : ''}`}
                    >
                      <span className="kitrow__mark">{need.covered ? '✓' : need.critical ? '!' : '–'}</span>
                      <span className="kitrow__what">
                        {TAG_LABELS[need.tag]}
                        <span className="faint"> · {STAGE_PROFILES[need.stage].name}</span>
                      </span>
                      <span className="kitrow__have faint">
                        {need.carrying ?? (need.critical ? 'nothing' : '—')}
                      </span>
                    </div>
                  ))
                )}
                {plan.equipment
                  .filter((e) => !analysis.kit.some((k) => k.carrying === e.name))
                  .map((e) => (
                    <div key={e.id} className="kitrow kitrow--ok">
                      <span className="kitrow__mark">+</span>
                      <span className="kitrow__what">{e.name}</span>
                      <span className="kitrow__have faint">{e.reliability < 0.95 ? 'not always reliable' : ''}</span>
                    </div>
                  ))}
              </div>
              <button
                className="btn btn--sm btn--ghost plan__link"
                onClick={() => dispatch({ type: 'SCREEN', screen: 'kit' })}
              >
                Buy or upgrade kit
              </button>
            </div>

            <div className="panel">
              <div className="eyebrow">What you believe</div>
              <div className="panel__sub">Bought, not seen. Some of it may be wrong.</div>
              {plan.intel.length === 0 ? (
                <p className="faint" style={{ fontSize: 13, margin: '10px 0 0', lineHeight: 1.55 }}>
                  You are going in on what anybody could see from the street.
                </p>
              ) : (
                <div className="stack" style={{ gap: 8, marginTop: 10 }}>
                  {plan.intel.map((held) => {
                    const topic = plan.target.topics.find((t) => t.id === held.topicId);
                    const label = shownConfidence(held);
                    const record = c.sourceRecord?.[held.sourceId];
                    return (
                      <div key={held.topicId} className="belief">
                        <div className="spread">
                          <strong className="belief__what">{topic?.label}</strong>
                          <span className={`tag ${label === 'confirmed' ? 'tag--green' : 'tag--gold'}`}>
                            {label === 'confirmed' ? 'Confirmed' : 'Rumoured'}
                          </span>
                        </div>
                        <p className="belief__claim">{held.reading}</p>
                        <span className="belief__src faint">
                          {sourceById(held.sourceId)?.name} · helps {STAGE_PROFILES[topic?.stage ?? 'approach'].name.toLowerCase()}
                          {record?.lies ? ` · has lied to you ${record.lies}×` : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <button
                className="btn btn--sm btn--ghost plan__link"
                onClick={() => dispatch({ type: 'SCREEN', screen: 'target' })}
              >
                Back to the dossier for intel
              </button>
            </div>

            <div className="panel">
              <div className="eyebrow">What you are risking</div>
              <div className="risk">
                <div>
                  <span className="eyebrow">If it goes right</span>
                  <strong className="money">{shortMoney(base * 0.95)}–{shortMoney(base * 1.1)}</strong>
                </div>
                <div>
                  <span className="eyebrow">If it goes wrong</span>
                  <strong className="money">{shortMoney(base * 0.35)} or less</strong>
                </div>
                <div>
                  <span className="eyebrow">The crew take</span>
                  <strong>{Math.round(analysis.crewCut * 100)}%</strong>
                </div>
                <div>
                  <span className="eyebrow">Heat, before noise</span>
                  <strong>+{analysis.heat}</strong>
                </div>
              </div>
              <p className="risk__line faint">
                {plan.crew.length
                  ? `${plan.crew.length} people who could be hurt or held. `
                  : ''}
                A clean night leaves the city at <em>{tierAfter.label.toLowerCase()}</em>; a loud one, worse.
                {numbers ? ` Expected take ${money(analysis.expectedTake)}.` : ''}
              </p>
            </div>
          </div>

          <div className="board__col">
            <div className="spine">
              <div className="spine__head">
                <span className="eyebrow">The night, in order</span>
              </div>
              {STAGE_ORDER.map((stage, i) => {
                const profile = STAGE_PROFILES[stage];
                const row = odds[i];
                const read = readFor(row.chance);
                const lead = crewFirst(row.actorId);
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
                        <div className={`stage__odds read--${read}`}>
                          {READ_WORDS[read]}
                          {numbers ? <span className="num"> {row.chance}%</span> : null}
                        </div>
                      </div>
                      <div className="stage__blurb">{profile.blurb}</div>
                      <div className="stage__meta">
                        <span className="tag">tests {row.attr}</span>
                        {lead ? (
                          <span className="tag tag--gold">{lead} leads</span>
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
          </div>
        </div>
      </div>

      <div className="actionbar">
        <button className="btn btn--primary btn--wide go" disabled={!ready} onClick={beginHeist}>
          {ready ? 'Run the job' : 'You need at least two people'}
        </button>
      </div>

      {picker === 'crew' ? (
        <Sheet title="Who is on this job?" onClose={() => setPicker(undefined)}>
          <div className="stack">
            {roster.length === 0 ? (
              <p className="faint">Nobody is available. Hire someone from the crew room first.</p>
            ) : (
              roster.map((member) => (
                <CrewCard
                  key={member.id}
                  member={member}
                  selected={draft.crewIds.includes(member.id)}
                  onClick={() => dispatch({ type: 'TOGGLE_CREW', id: member.id })}
                  footer={
                    <div className="crew-card__foot">
                      <span>{ARCHETYPES[member.role].covers}</span>
                      <span className="num">{Math.round(member.cut * 100)}% cut</span>
                    </div>
                  }
                />
              ))
            )}
          </div>
          <button className="btn btn--primary btn--wide" style={{ marginTop: 12 }} onClick={() => setPicker(undefined)}>
            Done
          </button>
        </Sheet>
      ) : null}

      {picker === 'kit' ? (
        <Sheet title="What are you taking?" onClose={() => setPicker(undefined)}>
          <div className="stack">
            {kit.map((item) => {
              const on = draft.equipmentIds.includes(item.id);
              const asked = plan.target.needs.find((n) => n.tag === item.tag);
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
                  <p className="kit__blurb">
                    {asked ? <strong>This job asks for it. </strong> : null}
                    {item.blurb}
                  </p>
                </button>
              );
            })}
          </div>
          <button className="btn btn--primary btn--wide" style={{ marginTop: 12 }} onClick={() => setPicker(undefined)}>
            Done
          </button>
        </Sheet>
      ) : null}
    </>
  );
}
