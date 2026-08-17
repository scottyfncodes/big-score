import { useMemo, useState } from 'react';
import { DISTRICTS, districtById } from '../data/districts';
import {
  availableTargets,
  destroyEvidence,
  EVIDENCE_COST,
  heatTier,
  lieLow,
  nextUnlock,
  unlockedDistricts,
} from '../game/campaign';
import { useStore } from '../state/store';
import { Hud, Sheet, money, shortMoney } from './parts';
import type { Target } from '../game/types';

export function CityMap() {
  const { campaign, dispatch, update } = useStore();
  const c = campaign!;
  const [openDistrict, setOpenDistrict] = useState<string | undefined>();
  const [menu, setMenu] = useState(false);

  const open = useMemo(() => new Set(unlockedDistricts(c).map((d) => d.id)), [c]);
  const targets = useMemo(() => availableTargets(c), [c]);
  const tier = heatTier(c.heat);
  const unlock = nextUnlock(c);

  const byDistrict = (id: string) => targets.filter((t) => t.districtId === id);
  const sheetTargets = openDistrict ? byDistrict(openDistrict) : [];

  return (
    <>
      <Hud title={`Port Argent · ${c.handle}`} bankroll={c.bankroll} heat={c.heat} day={c.day} />
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
              <TargetTile key={t.id} target={t} onOpen={() => dispatch({ type: 'SELECT_TARGET', targetId: t.id })} />
            ))}
          </div>

          <div className="city-actions">
            <button className="btn btn--sm" onClick={() => dispatch({ type: 'SCREEN', screen: 'crew' })}>
              Crew
            </button>
            <button className="btn btn--sm" onClick={() => dispatch({ type: 'SCREEN', screen: 'news' })}>
              The Paper
            </button>
            <button className="btn btn--sm" onClick={() => setMenu(true)}>
              Lie Low
            </button>
          </div>
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
              Lie low — 3 days, −14 heat
            </button>
            <button
              className="btn btn--wide"
              disabled={c.bankroll < EVIDENCE_COST}
              onClick={() => {
                update(destroyEvidence);
                setMenu(false);
              }}
            >
              Destroy evidence — {money(EVIDENCE_COST)}, −18 heat
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
    </>
  );
}

function TargetTile({ target, onOpen }: { target: Target; onOpen: () => void }) {
  return (
    <button className="tile" onClick={onOpen}>
      <div className="tile__top">
        <span className="eyebrow--paper eyebrow">{target.type}</span>
        <span className="tile__tier">Tier {target.tier}</span>
      </div>
      <div className="tile__name">{target.name}</div>
      <div className="tile__blurb">{target.blurb}</div>
      <div className="tile__foot">
        <span className="tile__value">{money(target.value)}</span>
        <span className="tile__district">{districtById(target.districtId)?.name}</span>
      </div>
    </button>
  );
}
