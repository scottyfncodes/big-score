import { gradeLine } from '../game/news';
import { LOYALTY_RETAIN, heatTier, nextUnlock } from '../game/campaign';
import { targetById } from '../data/targets';
import { useStore } from '../state/store';
import { Hud, money, shortMoney } from './parts';

export function Report() {
  const { campaign, screen, dispatch } = useStore();
  const c = campaign!;
  const result = c.lastReport;
  const story = c.news[0];

  if (!result) return null;
  const grade = gradeLine(result.grade);
  const unlock = nextUnlock(c);
  const target = result.targetId ? targetById(result.targetId) : undefined;
  const tier = heatTier(c.heat);
  const crew =
    result.crew ??
    Object.entries(result.loyaltyDeltas).map(([id, delta]) => ({
      id,
      name: c.contacts[id]?.name ?? c.crew[id]?.member.name ?? 'Somebody',
      fate: 'home' as const,
      loyaltyDelta: delta,
      memory: '',
      memoryTone: 'neutral' as const,
    }));
  const held = crew.filter((m) => m.fate === 'held').length;
  const hurt = crew.filter((m) => m.fate === 'hurt' || ('hurt' in m && m.hurt)).length;

  const summary =
    result.gross === 0
      ? `You walked away from ${target?.name ?? 'the job'} with nothing${result.policeContact ? ', just ahead of the police' : ''}.`
      : `${money(result.gross)} out of ${target?.name ?? 'the job'}. ${
          held ? `${held === 1 ? 'One' : held} of yours in a cell.` : hurt ? `Everyone home, ${hurt === 1 ? 'one' : hurt} of them hurt.` : 'Everyone home.'
        }`;

  return (
    <>
      <Hud
        title="After"
        bankroll={c.bankroll}
        heat={c.heat}
        day={c.day}
        nav={{ screen, go: (next) => dispatch({ type: 'SCREEN', screen: next }) }}
      />
      <div className="screen">
        <div className="stack report">
          <div className={`verdict verdict--${result.grade}`}>
            <div className="verdict__grade">{grade.label}</div>
            <div className="verdict__summary">{summary}</div>
            <div className="verdict__line">{grade.line}</div>
          </div>

          <div className="ledger paper">
            <div className="ledger__row">
              <span>Taken</span>
              <strong>{money(result.gross)}</strong>
            </div>
            <div className="ledger__row">
              <span>The crew’s cut</span>
              <strong>−{money(result.crewCut)}</strong>
            </div>
            <div className="ledger__row ledger__row--total">
              <span>Yours</span>
              <strong>{money(result.net)}</strong>
            </div>
            <div className="ledger__meta">
              <Meta label="On site" value={`${Math.max(1, Math.round(result.durationSeconds / 60))} min`} />
              <Meta label="Heat" value={`+${result.heat} → ${c.heat}`} />
              <Meta label="Police" value={result.policeContact ? 'On site' : 'Never came'} />
            </div>
            <p className="ledger__tier">
              <strong>{tier.label}.</strong> {tier.line}
            </p>
          </div>

          <div className="panel">
            <div className="eyebrow" style={{ marginBottom: 8 }}>Your people</div>
            {crew.map((m) => (
              <div key={m.id} className="fate">
                <div className="fate__head">
                  <span className="fate__name">{m.name}</span>
                  {'hurt' in m && m.hurt ? <span className="fate__chip fate__chip--hurt">Hurt</span> : null}
                  <span className={`fate__chip fate__chip--${m.fate}`}>{FATE_WORDS[m.fate]}</span>
                  <span className={`num fate__loyal ${m.loyaltyDelta >= 0 ? 'good' : 'bad'}`}>
                    {m.loyaltyDelta >= 0 ? '+' : ''}
                    {m.loyaltyDelta}
                  </span>
                </div>
                {m.memory ? <p className={`fate__memory fate__memory--${m.memoryTone}`}>{m.memory}</p> : null}
                {m.fate === 'walked' ? (
                  <p className="fate__note faint">
                    Took the cut and went home, {c.contacts[m.id]?.loyalty ?? 0}/{LOYALTY_RETAIN} loyalty. Hire them
                    again and they will remember tonight.
                  </p>
                ) : null}
                {m.fate === 'held' ? (
                  <p className="fate__note faint">In custody. Bail from the crew room, or leave them there.</p>
                ) : null}
              </div>
            ))}
          </div>

          <div className="know panel">
            <div className="eyebrow" style={{ marginBottom: 8 }}>What you know</div>
            <p className="know__moment">{result.notableMoment}</p>
            {result.exposed?.length ? (
              <ul className="know__why">
                {result.exposed.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>

          {story ? (
            <article className="clipping">
              <div className="clipping__kicker">What the city thinks</div>
              <div className="clipping__masthead">{story.masthead}</div>
              <h2 className="clipping__headline">{story.headline}</h2>
              <p className="clipping__standfirst">{story.standfirst}</p>
              <p className="clipping__body">{story.body}</p>
            </article>
          ) : null}

          {target && result.gross > 0 ? (
            <p className="report__after faint">
              {target.name} will be worth a fraction of this for weeks, and the next crew through its
              door will find better locks.
            </p>
          ) : null}

          {unlock ? (
            <div className="panel next">
              <div className="eyebrow">Next opportunity</div>
              <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.6 }}>
                {unlock.name} opens once you have moved {shortMoney(unlock.at)} in total.
                You are on {shortMoney(c.score)}.
              </p>
            </div>
          ) : null}

          <button
            className="btn btn--primary btn--wide"
            onClick={() => dispatch({ type: 'SCREEN', screen: 'city' })}
          >
            Back to the city
          </button>
        </div>
      </div>
    </>
  );
}

const FATE_WORDS = {
  home: 'Home',
  stayed: 'Stays on',
  walked: 'Went home',
  hurt: 'Hurt',
  held: 'Arrested',
} as const;

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="ledger__meta-item">
      <span className="eyebrow eyebrow--paper">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function NewsRoom() {
  const { campaign, screen, dispatch } = useStore();
  const c = campaign!;
  return (
    <>
      <Hud
        title="Port Argent Daily"
        onBack={() => dispatch({ type: 'SCREEN', screen: 'city' })}
        bankroll={c.bankroll}
        heat={c.heat}
        day={c.day}
        nav={{ screen, go: (next) => dispatch({ type: 'SCREEN', screen: next }) }}
      />
      <div className="screen">
        <div className="stack">
          {c.news.length === 0 ? (
            <div className="panel faint">
              Nothing you have done has been worth printing yet.
            </div>
          ) : (
            c.news.map((story) => (
              <article key={story.id + story.day} className="clipping">
                <div className="clipping__masthead">
                  {story.masthead} · day {story.day}
                </div>
                <h2 className="clipping__headline">{story.headline}</h2>
                <p className="clipping__standfirst">{story.standfirst}</p>
                <p className="clipping__body">{story.body}</p>
              </article>
            ))
          )}
        </div>
      </div>
    </>
  );
}
