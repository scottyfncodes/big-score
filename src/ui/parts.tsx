import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { onSoundChange, setSound, soundOn } from './audio';
import { heatTier } from '../game/campaign';
import type { CrewMember, Screen } from '../game/types';
import { ARCHETYPES } from '../data/crew';
import { TRAITS } from '../data/traits';
import { experienceLabel } from '../game/generation';
import { loyaltyWord } from '../game/memory';

/** Shared furniture. Nothing in here decides anything; it only shows things. */

/**
 * Whether the player wants the raw percentages alongside the words. Off by
 * default: the words carry the decision, and the numbers are there for
 * anybody who wants to check the arithmetic. A per-device preference, so it
 * lives in its own key rather than in the campaign save.
 */
const NUMBERS_KEY = 'big-score:show-numbers';
const listeners = new Set<(on: boolean) => void>();

export function useNumbers(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(NUMBERS_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    listeners.add(setOn);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  const set = useCallback((next: boolean) => {
    try {
      localStorage.setItem(NUMBERS_KEY, next ? '1' : '0');
    } catch {
      // Private mode: the toggle still works for this session.
    }
    listeners.forEach((fn) => fn(next));
  }, []);
  return [on, set];
}

export const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export const shortMoney = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
};

export const clock = (seconds: number) => {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.abs(Math.round(seconds)) % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export function Hud({
  title,
  onBack,
  bankroll,
  heat,
  day,
  nav,
  children,
}: {
  title: string;
  onBack?: () => void;
  bankroll: number;
  heat: number;
  day: number;
  /** Screen + navigate, when this screen should show the section bar. */
  nav?: { screen: Screen; go: (screen: Screen) => void };
  /** Pinned under the title — the heist uses it for the state of the night. */
  children?: ReactNode;
}) {
  const tier = heatTier(heat);
  const level = Math.min(4, Math.floor(heat / 21));
  return (
    <header className="hud">
      <div className="hud__inner">
        {onBack ? (
          <button className="hud__back" onClick={onBack} aria-label="Back">
            ‹
          </button>
        ) : null}
        <div className="hud__title">{title}</div>
        <SoundToggle />
        <div className="hud__stats">
          <div className="stat">
            <span className="stat__label">Day</span>
            <span className="stat__value">{day}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Heat</span>
            <span className={`stat__value stat__value--heat-${level}`} title={tier.label}>
              {heat}
            </span>
          </div>
          <div className="stat">
            <span className="stat__label">Bankroll</span>
            <span className="stat__value stat__value--money">{shortMoney(bankroll)}</span>
          </div>
        </div>
      </div>
      {nav ? <Nav screen={nav.screen} go={nav.go} /> : null}
      {children ? <div className="hud__extra">{children}</div> : null}
    </header>
  );
}

/**
 * The bar under the header.
 *
 * Crew and equipment are campaign-level things the player wants to reach from
 * wherever they are — mid-plan, mid-dossier — rather than only from the city.
 * It is deliberately absent during a heist: once the job starts, hiring and
 * shopping are over.
 */
export function Nav({
  screen,
  go,
}: {
  screen: Screen;
  go: (screen: Screen) => void;
}) {
  const items: { id: Screen; label: string }[] = [
    { id: 'city', label: 'City' },
    { id: 'crew', label: 'Crew' },
    { id: 'kit', label: 'Equipment' },
    { id: 'news', label: 'Paper' },
  ];
  return (
    <nav className="nav" aria-label="Main">
      {items.map((item) => (
        <button
          key={item.id}
          className={`nav__item${screen === item.id ? ' nav__item--on' : ''}`}
          onClick={() => go(item.id)}
          aria-current={screen === item.id ? 'page' : undefined}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sheet__grip" />
        {title ? (
          <div className="spread" style={{ marginBottom: 10 }}>
            <h3 style={{ fontSize: 15 }}>{title}</h3>
            <button className="btn btn--sm btn--ghost" onClick={onClose}>
              Close
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function Meter({
  value,
  max = 100,
  color = 'var(--gold)',
}: {
  value: number;
  max?: number;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="meter">
      <div className="meter__fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Stars({ count }: { count: number }) {
  return (
    <span className="stars" aria-label={`${count} out of 5`}>
      {'★'.repeat(count)}
      <span className="faint">{'★'.repeat(5 - count)}</span>
    </span>
  );
}

const STAT_LABELS: Record<string, string> = {
  driving: 'DRV',
  security: 'SEC',
  technical: 'TEC',
  social: 'SOC',
  stealth: 'STL',
  nerve: 'NRV',
};

export function CrewCard({
  member,
  selected,
  disabled,
  footer,
  onClick,
}: {
  member: CrewMember;
  selected?: boolean;
  disabled?: boolean;
  footer?: ReactNode;
  onClick?: () => void;
}) {
  const archetype = ARCHETYPES[member.role];
  const top = Object.entries(member.stats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div
      className={`crew-card${selected ? ' crew-card--on' : ''}${disabled ? ' crew-card--off' : ''}`}
      onClick={disabled ? undefined : onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && !disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="crew-card__photo">
        <span className="crew-card__initials">{member.initials}</span>
        <span className="crew-card__exp">{experienceLabel(member.experience)}</span>
      </div>
      <div className="crew-card__body">
        <div className="crew-card__name">{member.name}</div>
        <div className="crew-card__role">{archetype.name}</div>
        <div className="crew-card__stats">
          {top.map(([key, value]) => (
            <div key={key} className="crew-card__stat">
              <span className="crew-card__stat-label">{STAT_LABELS[key]}</span>
              <span className="crew-card__stat-value num">{value}</span>
            </div>
          ))}
        </div>
        <div className="crew-card__traits">
          {member.traits.map((id) => (
            <span key={id} className="tag">
              {TRAITS[id]?.name ?? id}
            </span>
          ))}
        </div>
        {member.jobsWithYou ? (
          <div className="crew-card__history">
            <span className="crew-card__bond">
              {member.jobsWithYou} job{member.jobsWithYou === 1 ? '' : 's'} with you · {loyaltyWord(member.loyalty)}
            </span>
            {member.memories?.[0] ? (
              <span className={`crew-card__memory crew-card__memory--${member.memories[0].tone}`}>
                {member.memories[0].text}
              </span>
            ) : null}
          </div>
        ) : null}
        {footer}
      </div>
      {selected ? <div className="crew-card__check">✓</div> : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="panel" style={{ textAlign: 'center', color: 'var(--text-dim)' }}>{children}</div>;
}

/** The speaker in the corner. One tap, every sound in the game. */
export function SoundToggle() {
  const [on, setOn] = useState(soundOn);
  useEffect(() => onSoundChange(setOn), []);
  return (
    <button
      className={`sound${on ? '' : ' sound--off'}`}
      onClick={() => setSound(!on)}
      aria-label={on ? 'Mute sound' : 'Turn sound on'}
      aria-pressed={on}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {on ? (
          <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        ) : (
          <path d="M16.5 9.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}

/**
 * A number that travels rather than jumps. Money in this game should look
 * like it is being counted, and losses like they are being taken away.
 */
export function useTween(target: number, duration = 700): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const raf = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const origin = from.current;
    if (origin === target) return;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - (1 - t) ** 3;
      const v = origin + (target - origin) * e;
      from.current = v;
      setShown(v);
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return shown;
}

/** Money that counts, with the change floating off it. */
export function LiveMoney({ value, className }: { value: number; className?: string }) {
  const shown = useTween(value, 900);
  const [deltas, setDeltas] = useState<{ id: number; amount: number }[]>([]);
  const prev = useRef(value);
  const seq = useRef(0);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => {
    const d = Math.round(value - prev.current);
    prev.current = value;
    if (Math.abs(d) < 1) return;
    const id = ++seq.current;
    setDeltas((list) => [...list.slice(-2), { id, amount: d }]);
    timers.current.push(window.setTimeout(() => setDeltas((list) => list.filter((x) => x.id !== id)), 1600));
  }, [value]);
  return (
    <span className={`livemoney ${className ?? ''}`}>
      <span className="livemoney__n num">{money(shown)}</span>
      {deltas.map((d) => (
        <span key={d.id} className={`livemoney__d livemoney__d--${d.amount > 0 ? 'up' : 'down'}`}>
          {d.amount > 0 ? '+' : '−'}
          {shortMoney(Math.abs(d.amount))}
        </span>
      ))}
    </span>
  );
}
