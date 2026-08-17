import { useEffect, type ReactNode } from 'react';
import { heatTier } from '../game/campaign';
import type { CrewMember } from '../game/types';
import { ARCHETYPES } from '../data/crew';
import { TRAITS } from '../data/traits';
import { experienceLabel } from '../game/generation';

/** Shared furniture. Nothing in here decides anything; it only shows things. */

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
}: {
  title: string;
  onBack?: () => void;
  bankroll: number;
  heat: number;
  day: number;
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
    </header>
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
        {footer}
      </div>
      {selected ? <div className="crew-card__check">✓</div> : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="panel" style={{ textAlign: 'center', color: 'var(--text-dim)' }}>{children}</div>;
}
