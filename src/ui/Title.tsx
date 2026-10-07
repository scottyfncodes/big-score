import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { hasSave, loadCampaign } from '../state/persistence';
import { sfx } from './audio';
import { shortMoney } from './parts';

export function Title() {
  const { dispatch } = useStore();
  const [handle, setHandle] = useState('');
  const canContinue = hasSave();
  // Read once: what is waiting if the player picks up where they left off.
  const [save] = useState(() => (canContinue ? loadCampaign() : undefined));
  const [confirmNew, setConfirmNew] = useState(false);

  useEffect(() => {
    // The stamp lands on its own; if audio is already unlocked, it is heard.
    const t = window.setTimeout(() => sfx.stamp(0.8), 1250);
    return () => window.clearTimeout(t);
  }, []);

  const start = () => {
    if (save && !confirmNew) {
      setConfirmNew(true);
      return;
    }
    sfx.register();
    dispatch({ type: 'NEW_GAME', handle: handle.trim() || 'The Architect' });
  };

  return (
    <div className="title">
      <div className="title__frame">
        <SafeDial />
        <div className="title__eyebrow">Port Argent · a city with money in it</div>
        <h1 className="title__word">
          <span className="title__the">THE BIG</span>
          <span className="title__score">SCORE</span>
        </h1>
        <p className="title__blurb">
          You are not the one who opens the safe. You are the one who decides who does,
          what they know before they touch it, and what happens when the plan meets
          the building.
        </p>

        <div className="title__actions">
          {save ? (
            <button className="btn btn--gold btn--wide title__continue" onClick={() => dispatch({ type: 'CONTINUE' })}>
              <span>Continue</span>
              <span className="title__save">
                {save.handle} · day {save.day} · {shortMoney(save.bankroll)}
                {save.run ? ' · mid-job' : ''}
              </span>
            </button>
          ) : null}

          <label className="title__field">
            <span className="eyebrow">What do they call you?</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value.slice(0, 18))}
              placeholder="The Architect"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <button className={`btn btn--wide ${save ? '' : 'btn--primary'}${confirmNew ? ' btn--primary' : ''}`} onClick={start}>
            {confirmNew ? 'Tap again — this ends your current campaign' : 'New Campaign'}
          </button>
        </div>

        <div className="title__foot faint">
          {save?.records?.bestNet
            ? `Your best night: ${shortMoney(save.records.bestNet)}. ${Object.keys(save.marks ?? {}).length} marks to your name.`
            : '$50,000. No crew. Six districts and a short attention span from the police.'}
        </div>
      </div>
    </div>
  );
}

/** The emblem: a safe dial that turns once and settles, like it always does. */
function SafeDial() {
  return (
    <svg className="title__dial" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(217,164,65,0.35)" strokeWidth="0.8" />
      <g className="title__dial-ring">
        {Array.from({ length: 50 }, (_, i) => {
          const a = (i * 7.2 * Math.PI) / 180;
          const long = i % 5 === 0;
          return (
            <line
              key={i}
              x1={50 + Math.sin(a) * (long ? 36 : 39)}
              y1={50 - Math.cos(a) * (long ? 36 : 39)}
              x2={50 + Math.sin(a) * 43}
              y2={50 - Math.cos(a) * 43}
              stroke="rgba(232,224,210,0.45)"
              strokeWidth={long ? 1 : 0.5}
            />
          );
        })}
        <path d="M 50 7 A 43 43 0 0 1 86 27" stroke="var(--red)" strokeWidth="3" fill="none" opacity="0.8" />
      </g>
      <circle cx="50" cy="50" r="22" fill="#1f1a16" stroke="rgba(217,164,65,0.3)" strokeWidth="0.6" />
      <path d="M 50 4 L 46.5 -2 L 53.5 -2 Z" fill="var(--red)" />
    </svg>
  );
}
