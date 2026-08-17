import { gradeLine } from '../game/news';
import { nextUnlock } from '../game/campaign';
import { useStore } from '../state/store';
import { Hud, Stars, clock, money, shortMoney } from './parts';

export function Report() {
  const { campaign, dispatch } = useStore();
  const c = campaign!;
  const result = c.lastReport;
  const story = c.news[0];

  if (!result) return null;
  const grade = gradeLine(result.grade);
  const unlock = nextUnlock(c);

  return (
    <>
      <Hud title="After" bankroll={c.bankroll} heat={c.heat} day={c.day} />
      <div className="screen">
        <div className="stack">
          <div className={`verdict verdict--${result.grade}`}>
            <div className="verdict__grade">{grade.label}</div>
            <div className="verdict__line">{grade.line}</div>
            <Stars count={result.stars} />
          </div>

          <div className="ledger paper">
            <div className="ledger__row ledger__row--big">
              <span>Gross</span>
              <strong>{money(result.gross)}</strong>
            </div>
            <div className="ledger__row">
              <span>Crew cut</span>
              <strong>−{money(result.crewCut)}</strong>
            </div>
            <div className="ledger__row ledger__row--total">
              <span>Yours</span>
              <strong>{money(result.net)}</strong>
            </div>
            <div className="ledger__meta">
              <Meta label="Time" value={clock(result.durationSeconds)} />
              <Meta label="Heat" value={`+${result.heat}`} />
              <Meta label="Complications" value={String(result.complications)} />
              <Meta label="Injuries" value={String(result.injuries)} />
              <Meta label="Held" value={String(result.arrests)} />
              <Meta label="Police" value={result.policeContact ? 'On site' : 'None'} />
            </div>
          </div>

          <div className="panel">
            <div className="eyebrow" style={{ marginBottom: 6 }}>Notable moment</div>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65, fontStyle: 'italic' }}>
              {result.notableMoment}
            </p>
          </div>

          {story ? (
            <article className="clipping">
              <div className="clipping__masthead">{story.masthead}</div>
              <h2 className="clipping__headline">{story.headline}</h2>
              <p className="clipping__standfirst">{story.standfirst}</p>
              <p className="clipping__body">{story.body}</p>
            </article>
          ) : null}

          <div className="panel">
            <div className="eyebrow" style={{ marginBottom: 8 }}>Crew reaction</div>
            {Object.entries(result.loyaltyDeltas).map(([id, delta]) => {
              const member = c.crew[id]?.member;
              if (!member) return null;
              return (
                <div key={id} className="reaction">
                  <span>{member.name}</span>
                  <span className={`num ${delta >= 0 ? 'good' : 'bad'}`}>
                    {delta >= 0 ? '+' : ''}
                    {delta} loyalty
                  </span>
                </div>
              );
            })}
          </div>

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

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="ledger__meta-item">
      <span className="eyebrow eyebrow--paper">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function NewsRoom() {
  const { campaign, dispatch } = useStore();
  const c = campaign!;
  return (
    <>
      <Hud
        title="Port Argent Daily"
        onBack={() => dispatch({ type: 'SCREEN', screen: 'city' })}
        bankroll={c.bankroll}
        heat={c.heat}
        day={c.day}
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
