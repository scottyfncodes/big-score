import { useState } from 'react';
import { useStore } from '../state/store';
import { hasSave } from '../state/persistence';

export function Title() {
  const { dispatch } = useStore();
  const [handle, setHandle] = useState('');
  const canContinue = hasSave();

  return (
    <div className="title">
      <div className="title__frame">
        <div className="title__eyebrow">Port Argent · a city with money in it</div>
        <h1 className="title__word">
          THE BIG
          <span className="title__score">SCORE</span>
        </h1>
        <p className="title__blurb">
          You are not the one who opens the safe. You are the one who decides who does,
          what they know before they touch it, and what happens when the plan meets
          the building.
        </p>

        <div className="title__actions">
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

          <button
            className="btn btn--primary btn--wide"
            onClick={() => dispatch({ type: 'NEW_GAME', handle: handle.trim() || 'The Architect' })}
          >
            New Campaign
          </button>

          {canContinue ? (
            <button className="btn btn--ghost btn--wide" onClick={() => dispatch({ type: 'CONTINUE' })}>
              Continue
            </button>
          ) : null}
        </div>

        <div className="title__foot faint">
          $50,000. No crew. Six districts and a short attention span from the police.
        </div>
      </div>
    </div>
  );
}
