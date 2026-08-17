import { useState } from 'react';
import { EQUIPMENT } from '../data/equipment';
import { TRAITS } from '../data/traits';
import { ARCHETYPES } from '../data/crew';
import {
  bailCost,
  bailOut,
  buyEquipment,
  crewRecords,
  hire,
  hireCost,
  release,
} from '../game/campaign';
import { useStore } from '../state/store';
import { CrewCard, Empty, Hud, Meter, money } from './parts';
import type { CrewRecord } from '../game/types';

type Tab = 'roster' | 'market' | 'kit';

export function CrewRoom() {
  const { campaign, dispatch, update } = useStore();
  const c = campaign!;
  const [tab, setTab] = useState<Tab>(c.market.length && !Object.keys(c.crew).length ? 'market' : 'roster');
  const [inspect, setInspect] = useState<string | undefined>();

  const records = crewRecords(c);

  return (
    <>
      <Hud
        title="The crew"
        onBack={() => dispatch({ type: 'SCREEN', screen: 'city' })}
        bankroll={c.bankroll}
        heat={c.heat}
        day={c.day}
      />
      <div className="screen">
        <div className="tabs">
          {(['roster', 'market', 'kit'] as Tab[]).map((t) => (
            <button
              key={t}
              className={`tabs__tab${tab === t ? ' tabs__tab--on' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'roster' ? `Payroll (${records.length})` : t === 'market' ? 'Recruit' : 'Equipment'}
            </button>
          ))}
        </div>

        {tab === 'roster' ? (
          <div className="grid" style={{ marginTop: 12 }}>
            {records.length === 0 ? (
              <Empty>Nobody works for you yet. Try the Recruit tab.</Empty>
            ) : (
              records.map((record) => (
                <RosterCard
                  key={record.member.id}
                  record={record}
                  day={c.day}
                  bankroll={c.bankroll}
                  onBail={() => update((camp) => bailOut(camp, record.member.id))}
                  onRelease={() => update((camp) => release(camp, record.member.id))}
                  onInspect={() => setInspect(record.member.id)}
                  expanded={inspect === record.member.id}
                />
              ))
            )}
          </div>
        ) : null}

        {tab === 'market' ? (
          <div className="grid" style={{ marginTop: 12 }}>
            {c.market.map((member) => {
              const cost = hireCost(member, c);
              return (
                <CrewCard
                  key={member.id}
                  member={member}
                  disabled={c.bankroll < cost}
                  onClick={() => update((camp) => hire(camp, member.id))}
                  footer={
                    <div className="crew-card__foot">
                      <span>{member.bio}</span>
                      <strong className="num">{money(cost)}</strong>
                    </div>
                  }
                />
              );
            })}
          </div>
        ) : null}

        {tab === 'kit' ? (
          <div className="grid" style={{ marginTop: 12 }}>
            {EQUIPMENT.map((item) => {
              const owned = c.ownedEquipment.includes(item.id);
              return (
                <div key={item.id} className={`kit${owned ? ' kit--owned' : ''}`}>
                  <div className="spread">
                    <div className="kit__name">{item.name}</div>
                    {owned ? (
                      <span className="tag tag--green">Owned</span>
                    ) : (
                      <button
                        className="btn btn--sm"
                        disabled={c.bankroll < item.cost}
                        onClick={() => update((camp) => buyEquipment(camp, item.id))}
                      >
                        {money(item.cost)}
                      </button>
                    )}
                  </div>
                  <p className="kit__blurb">{item.blurb}</p>
                  <div className="kit__meta">
                    {Object.entries(item.bonus).map(([stage, value]) => (
                      <span key={stage} className="tag">
                        {stage} +{value}
                      </span>
                    ))}
                    {item.heat ? <span className="tag tag--red">+{item.heat} heat</span> : null}
                    {item.reliability < 1 ? (
                      <span className="tag tag--gold">
                        {Math.round(item.reliability * 100)}% reliable
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </>
  );
}

function RosterCard({
  record,
  day,
  bankroll,
  onBail,
  onRelease,
  onInspect,
  expanded,
}: {
  record: CrewRecord;
  day: number;
  bankroll: number;
  onBail: () => void;
  onRelease: () => void;
  onInspect: () => void;
  expanded: boolean;
}) {
  const { member, condition, availableOnDay, jobsRun } = record;
  const unavailable = condition !== 'ready' || availableOnDay > day;
  const bail = bailCost(member);

  return (
    <div className="stack" style={{ gap: 6 }}>
      <CrewCard
        member={member}
        disabled={unavailable}
        onClick={onInspect}
        footer={
          <div className="crew-card__foot">
            <span>
              {condition === 'arrested'
                ? 'In custody'
                : condition === 'injured'
                  ? `Injured — back day ${availableOnDay}`
                  : `${jobsRun} job${jobsRun === 1 ? '' : 's'} together`}
            </span>
            <span className="num">{Math.round(member.cut * 100)}% cut</span>
          </div>
        }
      />
      {expanded ? (
        <div className="panel roster__detail">
          <p className="dim" style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.55 }}>
            {member.bio}
          </p>
          <div className="roster__bars">
            <Bar label="Loyalty" value={member.loyalty} color="var(--green)" />
            <Bar label="Greed" value={member.greed} color="var(--red)" />
            <Bar label="Nerve" value={member.stats.nerve} color="var(--gold)" />
          </div>
          <div className="roster__traits">
            {member.traits.map((id) => (
              <div key={id} className="roster__trait">
                <strong>{TRAITS[id]?.name}</strong>
                <span className="faint"> — {TRAITS[id]?.blurb}</span>
              </div>
            ))}
          </div>
          <p className="faint" style={{ fontSize: 11.5, margin: '10px 0' }}>
            Covers: {ARCHETYPES[member.role].covers}
          </p>
          <div className="row">
            {condition === 'arrested' ? (
              <button className="btn btn--sm btn--gold" disabled={bankroll < bail} onClick={onBail}>
                Bail out — {money(bail)}
              </button>
            ) : null}
            <button className="btn btn--sm btn--ghost" onClick={onRelease}>
              Let them go
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="roster__bar">
      <div className="spread" style={{ marginBottom: 4 }}>
        <span className="eyebrow">{label}</span>
        <span className="num" style={{ fontSize: 12 }}>{value}</span>
      </div>
      <Meter value={value} color={color} />
    </div>
  );
}
