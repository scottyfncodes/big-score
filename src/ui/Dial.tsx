import { useEffect, useMemo, useRef, useState } from 'react';
import { OUTCOME_BANDS, SWING } from '../game/calc';
import type { StageOutcome } from '../game/types';
import { buzz, sfx } from './audio';

/**
 * The dial.
 *
 * Every check in the game is a triangular roll against a margin, and the dial
 * is that roll made physical: a safe dial that spins and settles under a fixed
 * pointer. The ring is laid out by probability, not by margin — the arc each
 * outcome owns is exactly the chance of landing it — so the player can see,
 * while it spins, how much of the dial was ever going to be good.
 */

export type DialZone = { id: string; label: string; from: number; to: number; tone: string };

const ARC = 324; // degrees of ring the roll occupies; the rest is the dead gap.
const START = -ARC / 2;

/** Triangular CDF over [-SWING, SWING]: where a roll sits, as a probability. */
function cdf(roll: number): number {
  const s = SWING;
  if (roll <= -s) return 0;
  if (roll >= s) return 1;
  if (roll <= 0) return (roll + s) ** 2 / (2 * s * s);
  return 1 - (s - roll) ** 2 / (2 * s * s);
}

export function bandOf(margin: number): StageOutcome {
  if (margin >= OUTCOME_BANDS.critical) return 'critical';
  if (margin >= OUTCOME_BANDS.success) return 'success';
  if (margin >= OUTCOME_BANDS.partial) return 'partial';
  if (margin >= OUTCOME_BANDS.complication) return 'complication';
  return 'failure';
}

const STAGE_ZONES: { id: StageOutcome; label: string; min: number; tone: string }[] = [
  { id: 'failure', label: 'Wrong', min: -Infinity, tone: 'var(--z-fail)' },
  { id: 'complication', label: 'Trouble', min: OUTCOME_BANDS.complication, tone: 'var(--z-trouble)' },
  { id: 'partial', label: 'Rough', min: OUTCOME_BANDS.partial, tone: 'var(--z-rough)' },
  { id: 'success', label: 'Clean', min: OUTCOME_BANDS.success, tone: 'var(--z-clean)' },
  { id: 'critical', label: 'Better', min: OUTCOME_BANDS.critical, tone: 'var(--z-better)' },
];

/** Zones for a five-band stage check, given the expected margin. */
export function stageZones(base: number): DialZone[] {
  return STAGE_ZONES.map((z, i) => {
    const next = STAGE_ZONES[i + 1];
    return {
      id: z.id,
      label: z.label,
      tone: z.tone,
      from: z.min === -Infinity ? 0 : cdf(z.min - base),
      to: next ? cdf(next.min - base) : 1,
    };
  }).filter((z) => z.to - z.from > 0.004);
}

/** Zones for a pass/fail check. */
export function checkZones(base: number): DialZone[] {
  const at = cdf(0 - base);
  return [
    { id: 'failure', label: 'Fails', from: 0, to: at, tone: 'var(--z-fail)' },
    { id: 'success', label: 'Holds', from: at, to: 1, tone: 'var(--z-clean)' },
  ].filter((z) => z.to - z.from > 0.004);
}

const angleOf = (u: number) => START + u * ARC;

function arcPath(r: number, a0: number, a1: number): string {
  const rad = (a: number) => ((a - 90) * Math.PI) / 180;
  const x0 = 50 + r * Math.cos(rad(a0));
  const y0 = 50 + r * Math.sin(rad(a0));
  const x1 = 50 + r * Math.cos(rad(a1));
  const y1 = 50 + r * Math.sin(rad(a1));
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export interface DialProps {
  zones: DialZone[];
  /** The zone the roll actually landed in, and the actual expected-margin roll. */
  landed: string;
  roll: number;
  /** Who, and against what. */
  who: string;
  initials: string;
  what: string;
  /** The final word: may differ from the landed zone (a clean check that still drew trouble). */
  verdict: { text: string; tone: string; twist?: string };
  onDone: () => void;
}

export function Dial({ zones, landed, roll, who, initials, what, verdict, onDone }: DialProps) {
  const zone = zones.find((z) => z.id === landed) ?? zones[zones.length - 1];
  // Where the pointer settles, kept safely inside the landed zone so a rounded
  // margin can never draw the needle on the wrong side of a line.
  const u = useMemo(() => {
    const raw = cdf(roll);
    const inset = Math.min(0.012, (zone.to - zone.from) / 3);
    return Math.max(zone.from + inset, Math.min(zone.to - inset, raw));
  }, [roll, zone]);

  const finalRot = -angleOf(u) - 720;
  const [rot, setRot] = useState(0);
  const [phase, setPhase] = useState<'spin' | 'land' | 'twist' | 'done'>('spin');
  const done = useRef(false);
  const skip = useRef(false);

  useEffect(() => {
    const duration = reduced() ? 250 : 1650;
    const start = performance.now();
    let lastTick = 0;
    let raf = 0;
    sfx.spin();
    const step = (now: number) => {
      const t = skip.current ? 1 : Math.min(1, (now - start) / duration);
      // Quintic ease-out: fast through the first turns, a long, audible settle.
      const e = 1 - (1 - t) ** 5;
      const r = finalRot * e;
      setRot(r);
      const tick = Math.floor(Math.abs(r) / 12);
      if (tick !== lastTick && !skip.current) {
        lastTick = tick;
        if (t > 0.12) sfx.tick(t);
      }
      if (t < 1) raf = requestAnimationFrame(step);
      else land();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  function land() {
    setPhase('land');
    impact(landed);
    if (verdict.twist) {
      timers.current.push(
        window.setTimeout(() => {
          setPhase('twist');
          impact('complication');
        }, 650),
      );
    }
    timers.current.push(window.setTimeout(finish, verdict.twist ? 1500 : 950));
  }

  function finish() {
    if (done.current) return;
    done.current = true;
    setPhase('done');
    onDone();
  }

  const onTap = () => {
    if (phase === 'spin') skip.current = true;
    else finish();
  };

  const twisted = Boolean(verdict.twist) && (phase === 'twist' || phase === 'done');
  const stampText =
    phase === 'spin' ? undefined : twisted ? verdict.twist : verdict.twist ? zone.label : verdict.text;

  return (
    <button
      type="button"
      className={`dial dial--${phase} dial--${twisted ? 'complication' : landed}`}
      onClick={onTap}
      aria-label={`${who}, ${what}: ${verdict.text}`}
    >
      <div className="dial__who">
        <strong>{who}</strong> · {what}
      </div>
      <div className="dial__stage">
        <svg viewBox="0 0 100 100" className="dial__svg" aria-hidden="true">
          <defs>
            <radialGradient id="dial-face" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#3a332b" />
              <stop offset="70%" stopColor="#1f1a16" />
              <stop offset="100%" stopColor="#120f0d" />
            </radialGradient>
            <radialGradient id="dial-hub" cx="45%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#6d5a3d" />
              <stop offset="100%" stopColor="#2a221a" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill="#0b0908" />
          <circle cx="50" cy="50" r="46.5" fill="none" stroke="rgba(217,164,65,0.35)" strokeWidth="0.6" />
          <g style={{ transform: `rotate(${rot}deg)`, transformOrigin: '50px 50px' }}>
            <circle cx="50" cy="50" r="44" fill="url(#dial-face)" />
            {zones.map((z) => (
              <path
                key={z.id}
                d={arcPath(39, angleOf(z.from) + 0.6, angleOf(z.to) - 0.6)}
                stroke={z.tone}
                strokeWidth="7"
                fill="none"
                className={`dial__zone${phase !== 'spin' && z.id === landed ? ' dial__zone--hit' : ''}`}
              />
            ))}
            {Array.from({ length: 60 }, (_, i) => {
              const a = (i * 6 * Math.PI) / 180;
              const long = i % 5 === 0;
              return (
                <line
                  key={i}
                  x1={50 + Math.sin(a) * (long ? 30 : 32)}
                  y1={50 - Math.cos(a) * (long ? 30 : 32)}
                  x2={50 + Math.sin(a) * 34}
                  y2={50 - Math.cos(a) * 34}
                  stroke="rgba(232,224,210,0.5)"
                  strokeWidth={long ? 0.7 : 0.35}
                />
              );
            })}
            {Array.from({ length: 10 }, (_, i) => {
              const a = (i * 36 * Math.PI) / 180;
              return (
                <text
                  key={i}
                  x={50 + Math.sin(a) * 25.5}
                  y={50 - Math.cos(a) * 25.5 + 1.6}
                  className="dial__num"
                  transform={`rotate(${i * 36} ${50 + Math.sin(a) * 25.5} ${50 - Math.cos(a) * 25.5})`}
                >
                  {i * 10}
                </text>
              );
            })}
          </g>
          <circle cx="50" cy="50" r="17" fill="url(#dial-hub)" stroke="rgba(0,0,0,0.6)" strokeWidth="0.8" />
          <circle cx="50" cy="50" r="15" fill="none" stroke="rgba(217,164,65,0.25)" strokeWidth="0.4" />
          <text x="50" y="53.2" className="dial__initials">
            {initials}
          </text>
          <path d="M 50 9.5 L 46.2 2 L 53.8 2 Z" className="dial__pointer" />
        </svg>
        {stampText ? (
          <div key={stampText} className={`dial__stamp dial__stamp--${twisted ? 'complication' : landed}`}>
            {stampText}
          </div>
        ) : null}
      </div>
      <div className="dial__legend">
        {zones.map((z) => (
          <span key={z.id} className={`dial__key${phase !== 'spin' && z.id === landed ? ' dial__key--hit' : ''}`}>
            <i style={{ background: z.tone }} />
            {z.label} <em>{Math.round((z.to - z.from) * 100)}%</em>
          </span>
        ))}
      </div>
      <div className="dial__hint">{phase === 'spin' ? 'Tap to stop it' : 'Tap to go on'}</div>
    </button>
  );
}

/** The weight of an outcome, for the hand and the ear. */
export function impact(outcome: string) {
  switch (outcome) {
    case 'critical':
      sfx.stamp(1);
      sfx.critical();
      buzz([20, 40, 30]);
      break;
    case 'success':
      sfx.stamp(0.7);
      sfx.success();
      buzz(15);
      break;
    case 'partial':
      sfx.stamp(0.6);
      sfx.partial();
      buzz(15);
      break;
    case 'complication':
      sfx.stamp(0.8);
      sfx.complication();
      buzz([30, 30, 30]);
      break;
    default:
      sfx.stamp(1);
      sfx.failure();
      buzz([60, 40, 90]);
  }
}
