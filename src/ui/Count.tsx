import { useEffect, useRef, useState } from 'react';
import { gradeLine } from '../game/news';
import { markById } from '../game/marks';
import type { HeistResult } from '../game/types';
import { buzz, setMusic, sfx } from './audio';
import { impact } from './Dial';
import { money, shortMoney } from './parts';

/**
 * The count.
 *
 * The take is the score, and this is where it is scored: in a back room,
 * on a table, one riffle at a time. It runs as a short sequence — what came
 * out, what going back in added, what the crew take, what is yours — and then
 * the grade comes down like a stamp. Any tap jumps to the end; nobody should
 * have to watch it twice to get to the next job.
 */

type Beat = 'gross' | 'cut' | 'net' | 'grade' | 'after';
const ORDER: Beat[] = ['gross', 'cut', 'net', 'grade', 'after'];

const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function Count({
  result,
  targetName,
  best,
  onDone,
}: {
  result: HeistResult;
  targetName: string;
  /** The best night before this one, for the "almost" line. */
  best: number;
  onDone: () => void;
}) {
  const [beat, setBeat] = useState<Beat>('gross');
  const [shown, setShown] = useState(0);
  const timers = useRef<number[]>([]);
  const raf = useRef(0);
  const at = (b: Beat) => ORDER.indexOf(beat) >= ORDER.indexOf(b);
  const grade = gradeLine(result.grade, result);
  const empty = result.gross === 0;

  useEffect(() => {
    setMusic('off');
    const fast = reduced();
    const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, fast ? ms / 6 : ms));

    const countTo = (from: number, to: number, ms: number, riffle: boolean, then: () => void) => {
      const start = performance.now();
      let lastStep = -1;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / (fast ? 1 : ms));
        const e = 1 - (1 - t) ** 3;
        setShown(Math.round(from + (to - from) * e));
        const s = Math.floor(t * 22);
        if (riffle && s !== lastStep) {
          lastStep = s;
          sfx.riffle(t);
        }
        if (t < 1) raf.current = requestAnimationFrame(step);
        else then();
      };
      raf.current = requestAnimationFrame(step);
    };

    if (empty) {
      later(500, () => setBeat('grade'));
      later(700, () => impact('partial'));
      later(1500, () => setBeat('after'));
    } else {
      later(450, () =>
        countTo(0, result.gross, Math.min(2200, 900 + result.gross / 600), true, () => {
          later(350, () => {
            setBeat('cut');
            sfx.debit();
            countTo(result.gross, result.net, 650, false, () => {
              later(250, () => {
                setBeat('net');
                sfx.register();
                buzz([20, 30, 20]);
                later(750, () => {
                  setBeat('grade');
                  impact(gradeImpact(result.grade));
                  later(900, () => {
                    setBeat('after');
                    if (result.record) sfx.critical();
                    (result.marks ?? []).forEach((_, i) => later(350 + i * 450, () => sfx.mark()));
                  });
                });
              });
            });
          });
        }),
      );
    }
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      cancelAnimationFrame(raf.current);
      setMusic('city');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = () => {
    if (beat === 'after') return;
    timers.current.forEach((t) => window.clearTimeout(t));
    cancelAnimationFrame(raf.current);
    setShown(result.net);
    setBeat('after');
    impact(gradeImpact(result.grade));
  };

  const marks = (result.marks ?? []).map(markById).filter(Boolean);
  const almost = !result.record && best > 0 && result.net > best * 0.8 && result.net < best;

  return (
    <div className={`count count--${result.grade}${at('grade') ? ' count--graded' : ''}`} onClick={skip} role="dialog" aria-label="The count">
      <div className="count__inner">
        <div className="count__kicker">The count · {targetName}</div>

        {!empty ? (
          <>
            <div className={`count__money num${at('net') ? ' count__money--net' : ''}`}>{money(at('net') ? result.net : shown)}</div>
            <div className="count__rows">
              <div className="count__row">
                <span>Taken</span>
                <strong className="num">{money(result.gross)}</strong>
              </div>
              {result.greedTake ? (
                <div className="count__row count__row--gold">
                  <span>Went back in ×{(result.greedTrips ?? 0) - (result.greedFailed ?? 0)}</span>
                  <strong className="num">+{shortMoney(result.greedTake)}</strong>
                </div>
              ) : null}
              {(result.bestStreak ?? 0) >= 2 ? (
                <div className="count__row count__row--gold">
                  <span>Rhythm · {result.bestStreak} clean in a row</span>
                  <strong className="num">paid</strong>
                </div>
              ) : null}
              <div className={`count__row count__row--cut${at('cut') ? ' is-on' : ''}`}>
                <span>The crew’s cut</span>
                <strong className="num">−{money(result.crewCut)}</strong>
              </div>
              <div className={`count__row count__row--yours${at('net') ? ' is-on' : ''}`}>
                <span>Yours</span>
                <strong className="num">{money(result.net)}</strong>
              </div>
            </div>
          </>
        ) : (
          <div className="count__money count__money--empty num">$0</div>
        )}

        {at('grade') ? (
          <div className="count__grade">
            <span className={`count__stamp count__stamp--${result.grade}`}>{grade.label}</span>
            <p className="count__line">{grade.line}</p>
          </div>
        ) : null}

        {at('after') ? (
          <div className="count__after">
            {result.record ? <div className="count__record">New best night</div> : null}
            {almost ? (
              <div className="count__almost">
                {money(best - result.net)} short of your best night.
              </div>
            ) : null}
            {marks.map((m, i) => (
              <div key={m!.id} className="count__mark" style={{ animationDelay: `${0.35 + i * 0.45}s` }}>
                <span className="count__mark-kicker">New mark</span>
                <strong>{m!.name}</strong>
                <span>{m!.line}</span>
              </div>
            ))}
            <button
              className="btn btn--gold btn--wide count__go"
              onClick={(e) => {
                e.stopPropagation();
                onDone();
              }}
            >
              The morning after
            </button>
          </div>
        ) : (
          <div className="count__skip">Tap to skip</div>
        )}
      </div>
    </div>
  );
}

function gradeImpact(grade: HeistResult['grade']): string {
  return grade === 'perfect' ? 'critical' : grade === 'clean' ? 'success' : grade === 'messy' ? 'partial' : 'failure';
}
