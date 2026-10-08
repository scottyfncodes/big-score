import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_HANDLE } from '../game/campaign';
import { useStore } from '../state/store';
import { hasSave, loadCampaign } from '../state/persistence';
import { sfx } from './audio';
import { shortMoney } from './parts';

/**
 * The title is the city at night with a safe dial hanging over it, and one
 * button. Nothing is asked before the player is in: the crew call them
 * The Architect until they say otherwise, which they can do from the city.
 */
export function Title() {
  const { dispatch } = useStore();
  const canContinue = hasSave();
  // Read once: what is waiting if the player picks up where they left off.
  const [save] = useState(() => (canContinue ? loadCampaign() : undefined));
  const [confirmNew, setConfirmNew] = useState(false);

  useEffect(() => {
    // The stamp lands on its own; if audio is already unlocked, it is heard.
    const t = window.setTimeout(() => sfx.stamp(0.8), 450);
    return () => window.clearTimeout(t);
  }, []);

  const start = () => {
    if (save && !confirmNew) {
      setConfirmNew(true);
      return;
    }
    sfx.register();
    dispatch({ type: 'NEW_GAME', handle: DEFAULT_HANDLE });
  };

  return (
    <div className="title">
      <Skyline initials={initialsOf(save?.handle ?? DEFAULT_HANDLE)} />
      <div className="title__frame">
        <div className="title__eyebrow">Port Argent · a city with money in it</div>
        <h1 className="title__word">
          <span className="title__the">THE BIG</span>
          <span className="title__score">SCORE</span>
        </h1>
        <p className="title__blurb">You don't crack the safe. You pick who does.</p>

        <div className="title__actions">
          {save ? (
            <>
              <button className="btn btn--gold btn--wide title__go" onClick={() => dispatch({ type: 'CONTINUE' })}>
                <span>Back to the job</span>
                <span className="title__save">
                  {save.handle} · day {save.day} · {shortMoney(save.bankroll)}
                  {save.run ? ' · mid-job' : ''}
                </span>
              </button>
              <button
                className={`btn btn--wide ${confirmNew ? 'btn--primary' : 'btn--ghost'}`}
                onClick={start}
              >
                {confirmNew ? 'Tap again — this ends your current campaign' : 'New campaign'}
              </button>
            </>
          ) : (
            <button className="btn btn--primary btn--wide title__go" onClick={start}>
              Plan the job
            </button>
          )}
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

/** "The Architect" → "TA"; one word gives one letter. */
function initialsOf(handle: string): string {
  return handle
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/* ------------------------------------------------------------- the hero */

/** The six districts, as neighbourhoods of the skyline below. */
const DISTRICT_SIGNS = [
  { x: 250, name: 'Industrial' },
  { x: 470, name: 'Old Town' },
  { x: 600, name: 'Downtown' },
  { x: 740, name: 'Financial' },
  { x: 920, name: 'Harbor' },
  { x: 1090, name: 'Casino Strip' },
];

/** The skyline is wide so the desktop sees more city, not a bigger one. */
const W = 1400;
const H = 210;
const GROUND = 168;

interface Building {
  x: number;
  w: number;
  h: number;
  windows: { x: number; y: number; lit: boolean; red: boolean; flicker?: { dur: number; delay: number } }[];
  aerial?: number;
}

/**
 * A fixed city: the same skyline every launch, like a real one. The engine's
 * RNG is for the game; this is a toy LCG so the drawing stays out of its way.
 */
function buildCity(): { back: Building[]; front: Building[] } {
  let s = 1973;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const range = (lo: number, hi: number) => lo + rnd() * (hi - lo);

  // Taller towards the middle: Downtown and the Financial District.
  const profile = (x: number) => 0.55 + 0.45 * Math.exp(-(((x - 660) / 300) ** 2));

  const row = (base: number, span: number, density: number): Building[] => {
    const list: Building[] = [];
    let x = -20;
    while (x < W + 20) {
      const w = range(26, 72);
      const h = range(base, base + span) * profile(x + w / 2) + (rnd() < 0.12 ? 36 : 0);
      const windows: Building['windows'] = [];
      const cols = Math.max(1, Math.floor((w - 8) / 11));
      const rows = Math.max(1, Math.floor((h - 10) / 13));
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const lit = rnd() < density;
          windows.push({
            x: x + 5 + c * 11,
            y: GROUND - h + 7 + r * 13,
            lit,
            red: lit && rnd() < 0.05,
            flicker: lit && rnd() < 0.18 ? { dur: range(3.5, 9), delay: -range(0, 9) } : undefined,
          });
        }
      }
      list.push({ x, w, h, windows, aerial: rnd() < 0.2 ? range(8, 26) : undefined });
      x += w + range(3, 9);
    }
    return list;
  };

  return { back: row(60, 70, 0.16), front: row(34, 92, 0.34) };
}

/** Stars, scattered once. */
function scatter(n: number): { x: number; y: number; r: number }[] {
  let s = 41;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  return Array.from({ length: n }, () => ({ x: rnd() * W, y: rnd() * 420, r: 0.6 + rnd() * 1.1 }));
}

/** Example odds on the ring: the shape of a decent plan, not a promise. */
const RING = [
  { to: 0.1, tone: 'var(--z-fail)' },
  { to: 0.24, tone: 'var(--z-trouble)' },
  { to: 0.42, tone: 'var(--z-rough)' },
  { to: 0.86, tone: 'var(--z-clean)' },
  { to: 1, tone: 'var(--z-better)' },
];
const ARC = 324;

function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const rad = (a: number) => ((a - 90) * Math.PI) / 180;
  return `M ${cx + r * Math.cos(rad(a0))} ${cy + r * Math.sin(rad(a0))} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${
    cx + r * Math.cos(rad(a1))
  } ${cy + r * Math.sin(rad(a1))}`;
}

/**
 * Port Argent at night with the dial hanging over it like a moon: the same
 * dial every check in the game turns on, idling, being worked, waiting for a
 * job. The buildings stand in front of it; the water carries the lights.
 */
function Skyline({ initials }: { initials: string }) {
  const { back, front } = useMemo(buildCity, []);
  const stars = useMemo(() => scatter(90), []);

  return (
    <div className="title__hero" aria-hidden="true">
      <svg className="title__stars" viewBox={`0 0 ${W} 600`} preserveAspectRatio="xMidYMin slice">
        {stars.map((st, i) => (
          <circle key={i} cx={st.x} cy={st.y} r={st.r} fill="rgba(232,224,210,0.32)" />
        ))}
      </svg>

      <DialMoon initials={initials} />

      <svg className="title__sky" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#101417" />
            <stop offset="100%" stopColor="#14110f" />
          </linearGradient>
        </defs>

        {/* The city, two rows deep. */}
        <g fill="#17120f">
          {back.map((b, i) => (
            <rect key={i} x={b.x} y={GROUND - b.h} width={b.w} height={b.h} />
          ))}
        </g>
        <g fill="rgba(217,164,65,0.28)">
          {back.flatMap((b, i) =>
            b.windows.filter((w) => w.lit).map((w, j) => <rect key={`${i}-${j}`} x={w.x} y={w.y} width="4" height="5" />),
          )}
        </g>
        <g fill="#0c0908">
          {front.map((b, i) => (
            <g key={i}>
              <rect x={b.x} y={GROUND - b.h} width={b.w} height={b.h + 10} />
              {b.aerial ? (
                <line x1={b.x + b.w / 2} y1={GROUND - b.h} x2={b.x + b.w / 2} y2={GROUND - b.h - b.aerial} stroke="#0c0908" strokeWidth="1.5" />
              ) : null}
            </g>
          ))}
        </g>
        <g>
          {front.flatMap((b, i) =>
            b.windows.map((w, j) => (
              <rect
                key={`${i}-${j}`}
                x={w.x}
                y={w.y}
                width="6"
                height="7"
                className={`title__win${w.lit ? (w.red ? ' title__win--red' : ' title__win--lit') : ''}${w.flicker ? ' title__win--flicker' : ''}`}
                style={w.flicker ? { animationDuration: `${w.flicker.dur}s`, animationDelay: `${w.flicker.delay}s` } : undefined}
              />
            )),
          )}
        </g>

        {/* The harbour, carrying the lights, with the districts along the front. */}
        <rect x="0" y={GROUND + 8} width={W} height={H - GROUND - 8} fill="url(#water)" />
        <line x1="0" y1={GROUND + 8} x2={W} y2={GROUND + 8} stroke="rgba(217,164,65,0.18)" strokeWidth="1" />
        {front
          .filter((_, i) => i % 3 === 0)
          .map((b, i) => (
            <rect
              key={i}
              x={b.x + 4}
              y={GROUND + 11}
              width={b.w - 8}
              height={Math.min(22, b.h / 4)}
              className="title__gleam"
              style={{ animationDelay: `${(i % 7) * -0.9}s` }}
            />
          ))}
        {DISTRICT_SIGNS.map((d) => (
          <text key={d.name} x={d.x} y={GROUND + 26} className="title__sign">
            {d.name}
          </text>
        ))}
      </svg>
    </div>
  );
}

/** The dial itself. The outer group spins in once; the inner one is worked for ever. */
function DialMoon({ initials }: { initials: string }) {
  const c = 120;
  return (
    <svg className="title__moon" viewBox="0 0 240 240">
      <defs>
        <radialGradient id="title-glow">
          <stop offset="50%" stopColor="rgba(217,164,65,0.18)" />
          <stop offset="100%" stopColor="rgba(217,164,65,0)" />
        </radialGradient>
        <radialGradient id="title-face" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#3a332b" />
          <stop offset="70%" stopColor="#1f1a16" />
          <stop offset="100%" stopColor="#120f0d" />
        </radialGradient>
        <radialGradient id="title-hub" cx="45%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#6d5a3d" />
          <stop offset="100%" stopColor="#2a221a" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={120} fill="url(#title-glow)" />
      <circle cx={c} cy={c} r={106} fill="#0b0908" />
      <circle cx={c} cy={c} r={103} fill="none" stroke="rgba(217,164,65,0.35)" strokeWidth="1.2" />
      <g className="title__dial-in">
        <g className="title__dial-ring">
          <circle cx={c} cy={c} r={98} fill="url(#title-face)" />
          {RING.map((z, i) => {
            const from = i ? RING[i - 1].to : 0;
            const a0 = -ARC / 2 + from * ARC + 0.6;
            const a1 = -ARC / 2 + z.to * ARC - 0.6;
            return <path key={i} d={arc(c, c, 86, a0, a1)} stroke={z.tone} strokeWidth="15" fill="none" opacity="0.8" />;
          })}
          {Array.from({ length: 60 }, (_, i) => {
            const a = (i * 6 * Math.PI) / 180;
            const long = i % 5 === 0;
            return (
              <line
                key={i}
                x1={c + Math.sin(a) * (long ? 66 : 70)}
                y1={c - Math.cos(a) * (long ? 66 : 70)}
                x2={c + Math.sin(a) * 75}
                y2={c - Math.cos(a) * 75}
                stroke="rgba(232,224,210,0.5)"
                strokeWidth={long ? 1.5 : 0.8}
              />
            );
          })}
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i * 36 * Math.PI) / 180;
            const x = c + Math.sin(a) * 56;
            const y = c - Math.cos(a) * 56;
            return (
              <text key={i} x={x} y={y + 3.5} className="title__dial-num" transform={`rotate(${i * 36} ${x} ${y})`}>
                {i * 10}
              </text>
            );
          })}
        </g>
      </g>
      <circle cx={c} cy={c} r={37} fill="url(#title-hub)" stroke="rgba(0,0,0,0.6)" strokeWidth="1.5" />
      <circle cx={c} cy={c} r={33} fill="none" stroke="rgba(217,164,65,0.25)" strokeWidth="0.8" />
      <text x={c} y={c + 6} className="title__dial-initials">
        {initials}
      </text>
      <path d={`M ${c} ${c - 88} L ${c - 8} ${c - 104} L ${c + 8} ${c - 104} Z`} className="title__pointer" />
    </svg>
  );
}
