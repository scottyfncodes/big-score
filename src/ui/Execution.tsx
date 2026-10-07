import { useEffect, useMemo, useRef, useState } from 'react';
import { STAGE_PROFILES } from '../game/stages';
import {
  GREED_MAX,
  greedOffer,
  pendingEventFor,
  projectedTake,
  RHYTHM_STEP,
  takeInHand,
  type GreedOffer,
} from '../game/resolve';
import { eventById } from '../data/events';
import { GREED_LABELS } from '../data/greed';
import { planForRun } from '../game/campaign';
import { READ_WORDS, nightClock, placeFor, readFor, stageScene, type Scene } from '../game/scene';
import { pAtLeast } from '../game/calc';
import { useStore } from '../state/store';
import { Hud, LiveMoney, money, shortMoney, useNumbers } from './parts';
import { Dial, bandOf, checkZones, stageZones, type DialProps } from './Dial';
import { setMusic, sfx } from './audio';
import { STAGE_ORDER, type CrewMember, type EventChoice, type RunLogEntry, type RunState, type StageOutcome } from '../game/types';
import type { Plan } from '../game/calc';

/**
 * The night.
 *
 * Every stage is three beats: a situation and the call the player makes on
 * it; the dial, where the call meets the building; and what happened, with
 * the reason attached. The state of the job — the clock, who is counting,
 * what is in the bag — is pinned above all three, and only moves once the
 * dial has settled, so the player hears the result before they read it.
 */

const OUTCOME_STAMP: Record<StageOutcome, string> = {
  critical: 'Better than drawn',
  success: 'As drawn',
  partial: 'Rough',
  complication: 'Trouble',
  failure: 'It went wrong',
};

type Reveal = { kind: 'stage' | 'greed' | 'check'; before: RunState };

export function Execution() {
  const { campaign, nextStage, abort, choose, goBack, bankHeist } = useStore();
  const c = campaign!;
  const run = c.run;
  const [numbers] = useNumbers();
  // How much of the log the player has already been shown. Starts at the end
  // so a reload lands on the current situation rather than replaying.
  const [ack, setAck] = useState(() => (run ? firstUnseen(run) : 0));
  const [confirmAbort, setConfirmAbort] = useState(false);
  const [reveal, setReveal] = useState<Reveal | undefined>();
  const [jolt, setJolt] = useState<string | undefined>();
  const [opening, setOpening] = useState(() => Boolean(run && run.log.length === 1 && !run.results.length));

  const plan = useMemo(() => (run ? planForRun(c, run) : undefined), [c, run]);

  // What the pinned header shows: the night as it stood before the dial
  // settled, so the clock and the bag move on the landing, not on the tap.
  const shown = reveal?.before ?? run;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setConfirmAbort(false);
  }, [ack, run?.pending?.eventId, run?.stageIndex, reveal]);

  useNightSound(shown, Boolean(reveal));

  if (!run || !plan || !shown) return null;

  const dial = reveal && run !== reveal.before ? dialFor(plan, reveal, run) : undefined;
  // An action that produced nothing to roll (it should not happen, but a
  // stuck screen is the worst possible failure) drops straight to the result.
  if (reveal && run !== reveal.before && !dial) window.setTimeout(() => setReveal(undefined), 0);
  const settling = Boolean(reveal);

  const pending = pendingEventFor(plan, run);
  const fresh = run.log.slice(ack);
  const hasBeat = fresh.length > 0 && !(run.stageIndex === 0 && !run.results.length && !run.outcome);
  // A stage that went to plan does not need a pause of its own: it folds into
  // the top of the next situation. Trouble, a reveal, an event, or somebody
  // outside starting to count — those get the whole screen and a Continue.
  const pause = hasBeat && fresh.some(needsPause);
  const scene = !pending && !run.outcome && !pause ? stageScene(plan, run) : undefined;
  const offer = scene && scene.stage === 'extraction' ? greedOffer(plan, run) : undefined;

  const begin = (kind: Reveal['kind'], act: () => void) => {
    sfx.tap();
    setReveal({ kind, before: run });
    setAck(run.log.length);
    act();
  };

  const landed = (outcome: string) => {
    setReveal(undefined);
    setJolt(outcome);
    window.setTimeout(() => setJolt(undefined), 650);
  };

  const onChoice = (choice: EventChoice) => {
    // A check that cannot really go either way is not worth a spin.
    const p = choice.check && pending ? pAtLeast(pending.ctx.scoreFor(choice.check.attr) - choice.check.dc) : 1;
    if (choice.check && p > 0.03 && p < 0.97) begin('check', () => choose(choice.id));
    else {
      sfx.tap();
      setAck(run.log.length);
      choose(choice.id);
    }
  };

  return (
    <>
      <Hud title={`${plan.target.name} · ${plan.approach.name}`} bankroll={c.bankroll} heat={c.heat} day={c.day}>
        <Situation plan={plan} run={shown} />
      </Hud>
      <div className={`screen night${jolt ? ` night--${jolt}` : ''}`}>
        <div className="run">
          <Crew plan={plan} run={shown} />

          {opening ? (
            <ColdOpen plan={plan} run={run} onGo={() => setOpening(false)} />
          ) : settling ? (
            dial ? <Dial key={`${reveal!.kind}-${run.cursor}`} {...dial} onDone={() => landed(dial.landed)} /> : null
          ) : (
            <>
              {showOpening(run, pending) ? <p className="run__opening">{run.log[0]?.text}</p> : null}

              {hasBeat ? <Beat plan={plan} run={run} entries={fresh} /> : null}

              {pending ? (
                <div className="event paper">
                  <div className="event__flag">Unexpected · {nightClock(plan.approach.id, run.clock)}</div>
                  <h3 className="event__title">{pending.event.title}</h3>
                  <p className="event__body">{pending.body}</p>
                  <div className="event__choices">
                    {pending.event.choices
                      .filter((choice) => !choice.when || choice.when(pending.ctx))
                      .map((choice) => {
                        const pass = choice.check
                          ? Math.round(pAtLeast(pending.ctx.scoreFor(choice.check.attr) - choice.check.dc) * 100)
                          : undefined;
                        return (
                          <button
                            key={choice.id}
                            className={`choice${choice.id === 'abort' ? ' choice--abort' : ''}`}
                            onClick={() => onChoice(choice)}
                          >
                            <span className="choice__label">{choice.label}</span>
                            <span className="choice__hint">{choice.hint}</span>
                            {pass !== undefined && choice.check ? (
                              <span className={`choice__check read--${readFor(pass)}`}>
                                Rests on {choice.check.attr} · {READ_WORDS[readFor(pass)].toLowerCase()}
                                {numbers ? ` · ${pass}%` : ''}
                              </span>
                            ) : (
                              <span className="choice__check">A certainty, with a cost</span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>
              ) : null}

              {pause && !pending && !run.outcome ? (
                <button
                  className="btn btn--primary btn--wide go"
                  onClick={() => {
                    sfx.whoosh();
                    setAck(run.log.length);
                  }}
                >
                  {STAGE_ORDER[run.stageIndex] ? `On to ${STAGE_PROFILES[STAGE_ORDER[run.stageIndex]].name.toLowerCase()}` : 'Continue'}
                </button>
              ) : null}

              {offer ? (
                <Temptation
                  offer={offer}
                  plan={plan}
                  run={run}
                  numbers={numbers}
                  onGo={() => begin('greed', goBack)}
                />
              ) : null}

              {scene ? (
                <SceneCard
                  scene={scene}
                  numbers={numbers}
                  tempted={Boolean(offer)}
                  onCall={(tactic) => begin('stage', () => nextStage(tactic))}
                  confirmAbort={confirmAbort}
                  onAbort={() => {
                    sfx.tap();
                    if (confirmAbort) abort();
                    else setConfirmAbort(true);
                  }}
                />
              ) : null}

              {run.outcome ? (
                <button
                  className={`btn btn--wide go go--count${run.outcome.gross > 0 ? ' btn--gold' : ''}`}
                  onClick={() => {
                    sfx.register();
                    bankHeist();
                  }}
                >
                  {run.outcome.gross > 0 ? `Count it` : 'Go home'}
                </button>
              ) : null}
            </>
          )}

          <details className="run__record">
            <summary>The night so far · {shown.results.length}/6</summary>
            <div className="run__log">
              {shown.log.map((entry, i) => (
                <div key={i} className={`beat beat--${entry.tone} beat--${entry.kind}`}>
                  {entry.kind === 'stage' ? (
                    <span className="beat__stage">{STAGE_PROFILES[entry.stage].name}</span>
                  ) : entry.kind === 'greed' ? (
                    <span className="beat__stage">Went back in</span>
                  ) : null}
                  <p>{entry.text.replace(/^[A-Za-z]+: /, '')}</p>
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
      <div className={`vignette vignette--${heatOf(shown)}`} aria-hidden="true" />
    </>
  );
}

function showOpening(run: RunState, pending: unknown) {
  return run.stageIndex === 0 && !run.results.length && !pending && !run.outcome;
}

function heatOf(run: RunState): 'calm' | 'listening' | 'counting' | 'police' {
  if (run.policeOnSite) return 'police';
  if (run.exposedAt !== null) return 'counting';
  if (run.noise > 30) return 'listening';
  return 'calm';
}

/**
 * The band and the sirens follow the night, and the moments the night turns
 * — somebody outside starts counting, the police arrive — get a sound of
 * their own, timed to when the player sees it rather than when it was rolled.
 */
function useNightSound(run: RunState | undefined, settling: boolean) {
  const heat = run ? heatOf(run) : 'calm';
  const prev = useRef(heat);
  useEffect(() => {
    if (!run) return;
    const level = { calm: 0, listening: 1, counting: 2, police: 3 }[heat];
    setMusic(run.outcome ? 'city' : 'night', level);
    if (settling) return;
    if (prev.current !== heat) {
      if (heat === 'counting' && prev.current !== 'police') sfx.exposed();
      if (heat === 'police') sfx.siren();
      prev.current = heat;
    }
  }, [heat, run, settling]);

  // Under two minutes, the crew can hear their own pulse.
  const left = run && run.exposedAt !== null ? run.window - (run.clock - run.exposedAt) : Infinity;
  useEffect(() => {
    if (!run || run.outcome || settling) return;
    if (left < 150 && !run.policeOnSite) sfx.heartbeat();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.stageIndex, run?.pending?.eventId, settling]);
}

/** The data the dial needs, read off the run the action just produced. */
function dialFor(plan: Plan, reveal: Reveal, run: RunState): Omit<DialProps, 'onDone'> | undefined {
  const before = reveal.before;
  const nameOf = (id?: string) => plan.crew.find((m) => m.id === id);
  const label = (m?: CrewMember) => ({
    who: m?.name.split(' ')[0] ?? 'The crew',
    initials: m?.initials ?? '—',
  });

  if (reveal.kind === 'stage') {
    const result = run.results[before.results.length];
    if (!result) return undefined;
    const base = result.score - result.opposition;
    const band = bandOf(result.margin);
    const twist = result.outcome === 'complication' && (band === 'success' || band === 'critical');
    return {
      zones: stageZones(base),
      landed: band,
      roll: result.margin - base,
      ...label(nameOf(result.actorId)),
      what: `${result.attr} · ${placeFor(plan.target.id, result.stage).toLowerCase()}`,
      verdict: {
        text: OUTCOME_STAMP[result.outcome],
        tone: result.outcome,
        twist: twist ? '…then trouble' : undefined,
      },
    };
  }

  if (reveal.kind === 'greed') {
    const trip = run.greed?.[before.greed?.length ?? 0];
    if (!trip) return undefined;
    const base = trip.score - trip.opposition;
    return {
      zones: stageZones(base),
      landed: trip.outcome,
      roll: trip.margin - base,
      ...label(nameOf(trip.actorId)),
      what: `${trip.attr} · going back in`,
      verdict: { text: trip.bonus > 0 ? `+${shortMoney(trip.bonus)}` : 'Nothing', tone: trip.outcome },
    };
  }

  const entry = run.log.slice(before.log.length).find((e) => e.check);
  if (!entry?.check) return undefined;
  const base = entry.check.score - entry.check.dc;
  return {
    zones: checkZones(base),
    landed: entry.check.passed ? 'success' : 'failure',
    roll: entry.check.margin - base,
    ...label(nameOf(entry.actorId)),
    what: entry.check.attr,
    verdict: { text: entry.check.passed ? 'It holds' : 'It does not', tone: entry.check.passed ? 'success' : 'failure' },
  };
}

function needsPause(entry: RunLogEntry): boolean {
  if (entry.kind === 'stage') return entry.outcome !== 'success' && entry.outcome !== 'critical';
  if (entry.kind === 'greed') return false;
  return true;
}

/** On reload: show the beat the player had not finished reading, if any. */
function firstUnseen(run: RunState): number {
  if (run.pending || run.outcome) {
    const lastStage = [...run.log].map((l, i) => ({ l, i })).reverse().find((x) => x.l.kind === 'stage');
    return lastStage ? lastStage.i : run.log.length;
  }
  return run.log.length;
}

/** The first thing the player sees of the night: where, when, and who. */
function ColdOpen({ plan, run, onGo }: { plan: Plan; run: RunState; onGo: () => void }) {
  const go = useRef(onGo);
  go.current = onGo;
  useEffect(() => {
    sfx.whoosh();
    const t = window.setTimeout(() => go.current(), 3600);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <button className="coldopen" onClick={onGo}>
      <span className="coldopen__time num">{nightClock(plan.approach.id, run.clock)}</span>
      <span className="coldopen__place">{placeFor(plan.target.id, 'approach')}</span>
      <span className="coldopen__name">{plan.target.name}</span>
      <span className="coldopen__crew">
        {plan.crew.map((m) => m.name.split(' ')[0]).join(' · ')}
      </span>
      <span className="coldopen__line">{run.log[0]?.text}</span>
      <span className="coldopen__go">Tap to begin</span>
    </button>
  );
}

/** Everything the player would be tracking in their head, at a glance. */
function Situation({ plan, run }: { plan: Plan; run: RunState }) {
  const exposed = run.exposedAt !== null;
  const since = exposed ? run.clock - (run.exposedAt ?? 0) : 0;
  const left = Math.max(0, run.window - since);
  const status = run.policeOnSite
    ? { cls: 'police', text: 'Police on site' }
    : exposed
      ? { cls: 'counting', text: `Counting · ~${Math.max(1, Math.round(left / 60))} min` }
      : run.noise > 30
        ? { cls: 'listening', text: 'The street is listening' }
        : { cls: 'unseen', text: 'Unseen' };
  const bag = projectedTake(plan, run);
  const inHand = takeInHand(run);
  const streak = run.streak ?? 0;
  return (
    <div className="situ">
      <div className="situ__top">
        <span className="situ__clock num">{nightClock(plan.approach.id, run.clock)}</span>
        <span className={`situ__status situ__status--${status.cls}`}>{status.text}</span>
      </div>
      <div className={`bag${inHand ? ' bag--in' : ''}`}>
        <span className="bag__label">{inHand ? 'In the bag' : 'On the table'}</span>
        <LiveMoney value={bag} className="bag__money" />
        <span className={`rhythm${streak >= 2 ? ' rhythm--on' : ''}`} aria-label={`Rhythm ${streak}`}>
          {Array.from({ length: 6 }, (_, i) => (
            <i key={i} className={i < streak ? 'on' : ''} />
          ))}
          {streak >= 2 ? <em>+{Math.round((streak - 1) * RHYTHM_STEP * 100)}%</em> : null}
        </span>
      </div>
      <div className="situ__track" aria-label="Stages">
        {STAGE_ORDER.map((stage, i) => {
          const result = run.results[i];
          const state = result ? `done-${result.outcome}` : i === run.stageIndex && !run.outcome ? 'now' : 'todo';
          return (
            <span key={stage} className={`situ__stage situ__stage--${state}`}>
              {STAGE_PROFILES[stage].name}
            </span>
          );
        })}
      </div>
      <div className="situ__noise" title="Noise">
        <span className="situ__noise-fill" style={{ width: `${Math.min(100, run.noise)}%` }} />
        {exposed ? (
          <span
            className={`situ__window${run.policeOnSite ? ' situ__window--in' : ''}`}
            style={{ width: `${Math.min(100, (since / run.window) * 100)}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

function Crew({ plan, run }: { plan: Plan; run: RunState }) {
  const lead = run.outcome || run.pending ? undefined : stageScene(plan, run)?.lead?.id;
  return (
    <div className="situ__crew">
      {plan.crew.map((m) => (
        <CrewChip key={m.id} member={m} run={run} leading={m.id === lead} />
      ))}
    </div>
  );
}

function CrewChip({ member, run, leading }: { member: CrewMember; run: RunState; leading: boolean }) {
  const s = run.crewRun[member.id];
  const state = s?.caught
    ? 'held'
    : s?.separated
      ? 'gone'
      : s?.injured
        ? 'hurt'
        : s && s.composure < 45
          ? 'rattled'
          : 'ok';
  const word = { held: 'held', gone: 'missing', hurt: 'hurt', rattled: 'rattled', ok: '' }[state];
  return (
    <span className={`cchip cchip--${state}${leading ? ' cchip--lead' : ''}`}>
      <span className="cchip__face">{member.initials}</span>
      <span className="cchip__name">
        {member.name.split(' ')[0]}
        {word ? <em> · {word}</em> : null}
      </span>
    </span>
  );
}

/**
 * The second cage. Offered between the objective and the way out, and dressed
 * differently from everything else on the night on purpose: it is the one
 * decision nobody planned, and the one the player will remember.
 */
function Temptation({
  offer,
  plan,
  run,
  numbers,
  onGo,
}: {
  offer: GreedOffer;
  plan: Plan;
  run: RunState;
  numbers: boolean;
  onGo: () => void;
}) {
  const read = readFor(offer.chance);
  const exposed = run.exposedAt !== null;
  const left = exposed ? Math.max(0, run.window - (run.clock - (run.exposedAt ?? 0))) : Infinity;
  const tight = exposed && offer.minutes * 60 > left * 0.6;
  void plan;
  return (
    <div className="tempt">
      <div className="tempt__kicker">
        {offer.attempt === 0 ? 'There is more in there' : 'There is still more'} · {offer.attempt + 1} of {GREED_MAX}
      </div>
      <p className="tempt__text">{offer.text}</p>
      <div className="tempt__terms">
        <span>
          <em>Could add</em>
          <strong className="money">+{money(offer.prize)}</strong>
        </span>
        <span>
          <em>Costs</em>
          <strong>~{offer.minutes} min</strong>
        </span>
        <span>
          <em>Odds</em>
          <strong className={`tempt__read read--${read}`}>
            {READ_WORDS[read]}
            {numbers ? ` ${offer.clean}%` : ''}
          </strong>
        </span>
      </div>
      <p className="tempt__warn">
        {run.policeOnSite
          ? 'The police are already outside. This would be insane.'
          : tight
            ? 'The response is closer than this will take. You would be racing it.'
            : exposed
              ? 'Somebody is already counting. Every minute in there is theirs.'
              : 'Nobody is counting yet. Going back in is how that changes.'}
      </p>
      <button className="btn btn--wide tempt__go" onClick={onGo}>
        {GREED_LABELS[offer.attempt]}
      </button>
      <p className="tempt__or">or make the call below and walk out with what you have</p>
    </div>
  );
}

function SceneCard({
  scene,
  numbers,
  tempted,
  onCall,
  confirmAbort,
  onAbort,
}: {
  scene: Scene;
  numbers: boolean;
  tempted: boolean;
  onCall: (tactic: Scene['calls'][number]['tactic']) => void;
  confirmAbort: boolean;
  onAbort: () => void;
}) {
  const lead = scene.lead?.name.split(' ')[0] ?? 'Nobody';
  return (
    <div className={`scene paper${tempted ? ' scene--tempted' : ''}`} key={scene.stage}>
      <div className="scene__where">
        <span className="num">{scene.time}</span> · {scene.place}
      </div>
      <div className="scene__stage">
        {STAGE_PROFILES[scene.stage].name} <span>· {scene.index + 1} of 6</span>
      </div>

      <p className="scene__gesture">
        <strong>{lead}</strong> {scene.gesture}
      </p>
      <blockquote className={`scene__quote scene__quote--${scene.mood}`}>{scene.quote}</blockquote>

      <ul className="scene__facts">
        {scene.facts.map((fact) => (
          <li key={fact.text} className={`fact fact--${fact.tone}`}>
            {fact.text}
          </li>
        ))}
      </ul>

      <div className="scene__calls">
        {scene.calls.map((call) => (
          <button
            key={call.tactic}
            className={`call call--${call.tactic}`}
            onClick={() => onCall(call.tactic)}
          >
            <span className="call__top">
              <span className="call__label">{call.label}</span>
              <span className={`call__read read--${call.read}`}>
                {READ_WORDS[call.read]}
                {numbers ? ` ${call.chance}%` : ''}
              </span>
            </span>
            <span className="call__hint">{call.hint}</span>
            <span className={`call__odds call__odds--${call.read}`} style={{ width: `${call.chance}%` }} />
          </button>
        ))}
      </div>

      {scene.canAbort ? (
        <button className={`scene__abort${confirmAbort ? ' scene__abort--armed' : ''}`} onClick={onAbort}>
          {confirmAbort ? 'Tap again: everyone out, empty-handed' : 'Call it off'}
        </button>
      ) : null}
    </div>
  );
}

/** What just happened: the stage result, and whatever it revealed. */
function Beat({ plan, run, entries }: { plan: Plan; run: RunState; entries: RunLogEntry[] }) {
  const stageEntry = entries.find((e) => e.kind === 'stage') ?? entries.find((e) => e.kind === 'greed');
  const stage = stageEntry?.stage ?? entries[0].stage;
  const outcome = stageEntry?.outcome;
  const lead = plan.crew.find((m) => m.id === stageEntry?.actorId);
  const eventEntry = !stageEntry ? entries.find((e) => e.kind === 'event') : undefined;
  const eventTitle = eventEntry?.eventId ? eventById(eventEntry.eventId)?.title : undefined;
  const heading = stageEntry?.kind === 'greed' ? 'Went back in' : eventTitle ?? STAGE_PROFILES[stage].name;
  return (
    <div className={`beatcard${outcome ? ` beatcard--${outcome}` : ''}`}>
      <div className="beatcard__head">
        <span>
          {heading}
          {lead ? ` · ${lead.name.split(' ')[0]}` : ''}
        </span>
        {outcome ? <span className={`stamp stamp--${outcome}`}>{OUTCOME_STAMP[outcome]}</span> : null}
      </div>
      {entries.map((entry, i) => (
        <p key={i} className={`beatcard__line beatcard__line--${entry.kind} beatcard__line--${entry.tone}`}>
          {entry.kind === 'reveal' ? <span className="beatcard__why">Why</span> : null}
          {entry.text.replace(/^[A-Za-z]+: /, '')}
        </p>
      ))}
      {run.outcome ? <OutcomeLine run={run} /> : null}
    </div>
  );
}

function OutcomeLine({ run }: { run: RunState }) {
  const o = run.outcome!;
  const held = o.arrests;
  return (
    <p className="beatcard__end">
      {o.gross === 0
        ? 'Nothing taken. Everyone accounted for.'
        : `${money(o.gross)} in the van. ${held ? `${held} of yours did not make it.` : 'Everyone in the van.'}`}
    </p>
  );
}

