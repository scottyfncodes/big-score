import { useMemo, useState } from 'react';
import { DISTRICTS, districtById } from '../data/districts';
import {
  activeCrew,
  availableTargets,
  destroyEvidence,
  EVIDENCE_COST,
  heatTier,
  lieLow,
  lieLowRelief,
  EVIDENCE_HEAT,
  HANDLE_MAX,
  LIE_LOW_DAYS,
  nextUnlock,
  rename,
  targetValueMultiplier,
  unlockedDistricts,
} from '../game/campaign';
import { cityWire, targetStatus } from '../game/city';
import { useStore } from '../state/store';
import { Hud, Sheet, money, shortMoney } from './parts';
import type { Campaign, Target } from '../game/types';

export function CityMap() {
  const { campaign, screen, dispatch, update } = useStore();
  const c = campaign!;
  const [openDistrict, setOpenDistrict] = useState<string | undefined>();
  const [menu, setMenu] = useState(false);
  // The name sheet, holding what is typed until it is kept; undefined while closed.
  const [naming, setNaming] = useState<string | undefined>();

  const open = useMemo(() => new Set(unlockedDistricts(c).map((d) => d.id)), [c]);
  const targets = useMemo(() => availableTargets(c), [c]);
  const tier = heatTier(c.heat);
  const unlock = nextUnlock(c);

  const wire = useMemo(() => cityWire(c), [c]);
  const byDistrict = (id: string) => targets.filter((t) => t.districtId === id);
  const sheetTargets = openDistrict ? byDistrict(openDistrict) : [];

  return (
    <>
      <Hud
        title={`${c.handle} · Port Argent`}
        bankroll={c.bankroll}
        heat={c.heat}
        day={c.day}
        nav={{ screen, go: (next) => dispatch({ type: 'SCREEN', screen: next }) }}
        onTitle={() => setNaming(c.handle)}
      />
      <div className="screen">
        <div className="stack">
          <div className="city-heat panel">
            <div className="spread">
              <div>
                <div className="eyebrow">The city</div>
                <div className="city-heat__tier">{tier.label}</div>
              </div>
              <div className="city-heat__num num">{c.heat}<span className="faint">/100</span></div>
            </div>
            <p className="city-heat__line dim">{tier.line}</p>
          </div>

          <NextMove campaign={c} targets={targets} />

          {wire.length ? (
            <div className="wire">
              <div className="wire__head eyebrow">Word on the street · day {c.day}</div>
              {wire.map((item) => (
                <button
                  key={item.id}
                  className={`wire__item wire__item--${item.tone}`}
                  disabled={!item.targetId}
                  onClick={() => item.targetId && dispatch({ type: 'SELECT_TARGET', targetId: item.targetId })}
                >
                  {item.text}
                </button>
              ))}
            </div>
          ) : null}

          <div className="map panel panel--flush">
            <svg viewBox="0 0 100 100" className="map__svg" role="img" aria-label="Map of Port Argent">
              <defs>
                <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                  <path d="M10 0H0V10" fill="none" stroke="rgba(217,164,65,0.08)" strokeWidth="0.3" />
                </pattern>
              </defs>
              <rect width="100" height="100" fill="url(#grid)" />
              <path d="M0 78 Q30 70 52 82 T100 76 L100 100 L0 100 Z" fill="rgba(91,140,168,0.09)" />
              <path d="M8 12 L44 40 L62 34 L96 58" stroke="rgba(217,164,65,0.16)" strokeWidth="0.6" fill="none" />
              <path d="M18 92 L38 56 L58 48 L72 18" stroke="rgba(217,164,65,0.12)" strokeWidth="0.5" fill="none" />

              {DISTRICTS.map((d) => {
                const unlocked = open.has(d.id);
                const count = unlocked ? byDistrict(d.id).length : 0;
                return (
                  <g
                    key={d.id}
                    className={`map__pin${unlocked ? '' : ' map__pin--locked'}`}
                    onClick={() => unlocked && setOpenDistrict(d.id)}
                    role="button"
                    tabIndex={unlocked ? 0 : -1}
                    aria-label={d.name}
                  >
                    <circle cx={d.x} cy={d.y} r="9" fill="transparent" />
                    <circle
                      cx={d.x}
                      cy={d.y}
                      r={count ? 4.2 : 2.6}
                      className={count ? 'map__dot map__dot--live' : 'map__dot'}
                    />
                    {count ? (
                      <circle cx={d.x} cy={d.y} r="7" className="map__halo" />
                    ) : null}
                    <text x={d.x} y={d.y - 7} className="map__label">
                      {d.name}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="spread">
            <div className="eyebrow">Open jobs · {targets.length}</div>
            {unlock ? (
              <div className="faint" style={{ fontSize: 11 }}>
                Next: {unlock.name} at {shortMoney(unlock.at)} lifetime
              </div>
            ) : null}
          </div>

          <div className="grid">
            {targets.map((t) => (
              <TargetTile
                key={t.id}
                target={t}
                campaign={c}
                onOpen={() => dispatch({ type: 'SELECT_TARGET', targetId: t.id })}
              />
            ))}
          </div>

          <button className="btn btn--wide" onClick={() => setMenu(true)}>
            Cool off · lie low or burn evidence
          </button>
        </div>
      </div>

      {openDistrict ? (
        <Sheet title={districtById(openDistrict)?.name} onClose={() => setOpenDistrict(undefined)}>
          <p className="dim" style={{ marginTop: 0, fontSize: 13 }}>
            {districtById(openDistrict)?.blurb}
          </p>
          <div className="stack">
            {sheetTargets.length === 0 ? (
              <p className="faint">Nothing here worth the risk tonight.</p>
            ) : (
              sheetTargets.map((t) => (
                <TargetTile
                  key={t.id}
                  target={t}
                  campaign={c}
                  onOpen={() => {
                    setOpenDistrict(undefined);
                    dispatch({ type: 'SELECT_TARGET', targetId: t.id });
                  }}
                />
              ))
            )}
          </div>
        </Sheet>
      ) : null}

      {menu ? (
        <Sheet title="Cooling off" onClose={() => setMenu(false)}>
          <div className="stack">
            <button
              className="btn btn--wide"
              onClick={() => {
                update(lieLow);
                setMenu(false);
              }}
            >
              Lie low — {LIE_LOW_DAYS} days, −{Math.min(c.heat, lieLowRelief(c.heat))} heat
            </button>
            <button
              className="btn btn--wide"
              disabled={c.bankroll < EVIDENCE_COST}
              onClick={() => {
                update(destroyEvidence);
                setMenu(false);
              }}
            >
              Destroy evidence — {money(EVIDENCE_COST)}, −{EVIDENCE_HEAT} heat
            </button>
            <p className="faint" style={{ fontSize: 12, lineHeight: 1.6 }}>
              Heat drives every building in the city: more guards, faster response, dearer
              crew. It never ends a campaign on its own — it just makes the next job the
              hardest version of itself.
            </p>
            <button className="btn btn--ghost btn--wide" onClick={() => dispatch({ type: 'RESET' })}>
              Abandon campaign
            </button>
          </div>
        </Sheet>
      ) : null}

      {naming !== undefined ? (
        <Sheet title="What do they call you?" onClose={() => setNaming(undefined)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              update((cur) => rename(cur, naming));
              setNaming(undefined);
            }}
          >
            <input
              className="name-field"
              value={naming}
              onChange={(e) => setNaming(e.target.value.slice(0, HANDLE_MAX))}
              placeholder={c.handle}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              aria-label="Your name"
            />
            <p className="faint" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>
              The name on the paper and in the crew's mouths. Leave it blank to go back to The Architect.
            </p>
            <button type="submit" className="btn btn--primary btn--wide">
              Keep it
            </button>
          </form>
        </Sheet>
      ) : null}
    </>
  );
}

function TargetTile({
  target,
  campaign,
  onOpen,
}: {
  target: Target;
  campaign: Campaign;
  onOpen: () => void;
}) {
  // A target the player has already robbed is worth less and is better
  // defended. That has to be legible on the tile, or a shrinking number reads
  // as a bug rather than a consequence.
  const multiplier = targetValueMultiplier(campaign, target.id);
  const value = Math.round(target.value * multiplier);
  const depleted = multiplier < 0.95;
  const status = targetStatus(campaign, target);

  return (
    <button className="tile" onClick={onOpen}>
      <div className="tile__top">
        <span className="eyebrow--paper eyebrow">{target.type}</span>
        <span className="tile__tier">Tier {target.tier}</span>
      </div>
      <div className="tile__name">{target.name}</div>
      <div className="tile__blurb">{target.blurb}</div>
      {status ? <div className={`tile__status tile__status--${status.tone}`}>{status.text}</div> : null}
      <div className="tile__foot">
        <span className={`tile__value${depleted ? ' tile__value--down' : ''}`}>
          {money(value)}
          {depleted ? <s className="tile__was">{money(target.value)}</s> : null}
        </span>
        <span className="tile__district">{districtById(target.districtId)?.name}</span>
      </div>
    </button>
  );
}

/**
 * The one thing to do next, while the player is still learning what the
 * things are. It steps aside after the first job: by then the city is
 * theirs to read.
 */
function NextMove({ campaign, targets }: { campaign: Campaign; targets: Target[] }) {
  const { dispatch } = useStore();
  if (campaign.reports.length > 0 || campaign.run) return null;
  const crew = activeCrew(campaign).length;
  const soft = [...targets].sort((a, b) => a.tier - b.tier || a.value - b.value)[0];
  const step =
    crew < 2
      ? {
          n: 1,
          title: crew === 0 ? 'Hire a crew' : 'One more body',
          line:
            crew === 0
              ? 'Two people at least. Somebody quiet and somebody who can open a safe is a start; four is usually right.'
              : 'Nobody does this alone. Hire at least one more.',
          cta: 'To the crew board',
          go: () => dispatch({ type: 'SCREEN', screen: 'crew' }),
        }
      : {
          n: 2,
          title: 'Pick a job',
          line: soft
            ? `${soft.name} is the soft one. Read the file, choose how you go in, then build the plan.`
            : 'Read a file, choose how you go in, then build the plan.',
          cta: soft ? `Open ${soft.name}` : 'Choose a job below',
          go: () => soft && dispatch({ type: 'SELECT_TARGET', targetId: soft.id }),
        };
  return (
    <div className="nextmove">
      <div className="nextmove__steps" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className={i < step.n ? 'done' : i === step.n ? 'now' : ''} />
        ))}
      </div>
      <div className="eyebrow">Your first job · step {step.n} of 3</div>
      <div className="nextmove__title">{step.title}</div>
      <p className="nextmove__line">{step.line}</p>
      <button className="btn btn--primary btn--wide" onClick={step.go}>
        {step.cta}
      </button>
    </div>
  );
}
