import { useEffect, useMemo, useState } from 'react';
import { STAGE_PROFILES } from '../game/stages';
import { pendingEventFor } from '../game/resolve';
import { eventById } from '../data/events';
import { planForRun } from '../game/campaign';
import { READ_WORDS, nightClock, readFor, stageScene, type Scene } from '../game/scene';
import { pAtLeast } from '../game/calc';
import { useStore } from '../state/store';
import { Hud, money, useNumbers } from './parts';
import { STAGE_ORDER, type CrewMember, type RunLogEntry, type RunState, type StageOutcome } from '../game/types';
import type { Plan } from '../game/calc';

/**
 * The night.
 *
 * Every stage is two beats: a situation — where the crew are, who is about to
 * do the work, what they can see that the plan did not — and the call the
 * player makes about it; then what happened, with the reason attached. Events
 * interrupt the second beat when the engine throws one. The full log is still
 * there, folded away, for anyone who wants to read the night back.
 */

const OUTCOME_STAMP: Record<StageOutcome, string> = {
  critical: 'Better than drawn',
  success: 'As drawn',
  partial: 'Rough',
  complication: 'Trouble',
  failure: 'It went wrong',
};

export function Execution() {
  const { campaign, nextStage, abort, choose, bankHeist } = useStore();
  const c = campaign!;
  const run = c.run;
  const [numbers] = useNumbers();
  // How much of the log the player has already been shown. Starts at the end
  // so a reload lands on the current situation rather than replaying.
  const [ack, setAck] = useState(() => (run ? firstUnseen(run) : 0));
  const [confirmAbort, setConfirmAbort] = useState(false);

  const plan = useMemo(() => (run ? planForRun(c, run) : undefined), [c, run]);

  useEffect(() => {
    // Every new beat starts at the top of the page, under the pinned header.
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setConfirmAbort(false);
  }, [ack, run?.pending?.eventId, run?.stageIndex]);

  if (!run || !plan) return null;

  const pending = pendingEventFor(plan, run);
  const fresh = run.log.slice(ack);
  const hasBeat = fresh.length > 0 && !(run.stageIndex === 0 && !run.results.length && !run.outcome);
  // A stage that went to plan does not need a pause of its own: it folds into
  // the top of the next situation. Trouble, a reveal, an event, or somebody
  // outside starting to count — those get the whole screen and a Continue.
  const pause = hasBeat && fresh.some(needsPause);
  const showBeat = hasBeat;
  const scene = !pending && !run.outcome && !pause ? stageScene(plan, run) : undefined;

  const call = (tactic: Parameters<typeof nextStage>[0]) => {
    setAck(run.log.length);
    nextStage(tactic);
  };

  return (
    <>
      <Hud title={`${plan.target.name} · ${plan.approach.name}`} bankroll={c.bankroll} heat={c.heat} day={c.day}>
        <Situation plan={plan} run={run} />
      </Hud>
      <div className="screen">
        <div className="run">
          <Crew plan={plan} run={run} />

          {run.stageIndex === 0 && !run.results.length && !pending && !run.outcome ? (
            <p className="run__opening">{run.log[0]?.text}</p>
          ) : null}

          {showBeat ? <Beat plan={plan} run={run} entries={fresh} /> : null}

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
                        onClick={() => {
                          setAck(run.log.length);
                          choose(choice.id);
                        }}
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
            <button className="btn btn--primary btn--wide go" onClick={() => setAck(run.log.length)}>
              {STAGE_ORDER[run.stageIndex] ? `On to ${STAGE_PROFILES[STAGE_ORDER[run.stageIndex]].name.toLowerCase()}` : 'Continue'}
            </button>
          ) : null}

          {scene ? (
            <SceneCard
              scene={scene}
              numbers={numbers}
              onCall={call}
              confirmAbort={confirmAbort}
              onAbort={() => (confirmAbort ? abort() : setConfirmAbort(true))}
            />
          ) : null}

          {run.outcome ? (
            <button className="btn btn--gold btn--wide go" onClick={bankHeist}>
              {run.outcome.gross > 0 ? `Count it — ${money(run.outcome.net)}` : 'Go home'}
            </button>
          ) : null}

          <details className="run__record">
            <summary>The night so far · {run.results.length}/6</summary>
            <div className="run__log">
              {run.log.map((entry, i) => (
                <div key={i} className={`beat beat--${entry.tone} beat--${entry.kind}`}>
                  {entry.kind === 'stage' ? (
                    <span className="beat__stage">{STAGE_PROFILES[entry.stage].name}</span>
                  ) : null}
                  <p>{entry.text.replace(/^[A-Za-z]+: /, '')}</p>
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
    </>
  );
}

function needsPause(entry: RunLogEntry): boolean {
  if (entry.kind === 'stage') return entry.outcome !== 'success' && entry.outcome !== 'critical';
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
        ? { cls: 'listening', text: 'Unseen · the street is listening' }
        : { cls: 'unseen', text: 'Unseen' };
  return (
    <div className="situ">
      <div className="situ__top">
        <span className="situ__clock num">{nightClock(plan.approach.id, run.clock)}</span>
        <span className={`situ__status situ__status--${status.cls}`}>{status.text}</span>
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

function SceneCard({
  scene,
  numbers,
  onCall,
  confirmAbort,
  onAbort,
}: {
  scene: Scene;
  numbers: boolean;
  onCall: (tactic: Scene['calls'][number]['tactic']) => void;
  confirmAbort: boolean;
  onAbort: () => void;
}) {
  const lead = scene.lead?.name.split(' ')[0] ?? 'Nobody';
  return (
    <div className="scene paper">
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
  const stageEntry = entries.find((e) => e.kind === 'stage');
  const stage = stageEntry?.stage ?? entries[0].stage;
  const outcome = stageEntry?.outcome;
  const lead = plan.crew.find((m) => m.id === stageEntry?.actorId);
  const eventEntry = !stageEntry ? entries.find((e) => e.kind === 'event') : undefined;
  const eventTitle = eventEntry?.eventId ? eventById(eventEntry.eventId)?.title : undefined;
  return (
    <div className={`beatcard${outcome ? ` beatcard--${outcome}` : ''}`}>
      <div className="beatcard__head">
        <span>
          {eventTitle ?? STAGE_PROFILES[stage].name}
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
