import { useEffect, useState } from 'react';
import { EQUIPMENT, MAX_EQUIPMENT_LEVEL, equipmentAtLevel } from '../data/equipment';
import { TRAITS } from '../data/traits';
import { ARCHETYPES } from '../data/crew';
import {
  LOYALTY_RETAIN,
  bailCost,
  bailOut,
  buyEquipment,
  canTrain,
  canUpgradeEquipment,
  contactsAvailable,
  crewRecords,
  dailyUpkeep,
  equipmentLevel,
  equipmentUpgradeCost,
  hire,
  hireCost,
  isRetained,
  release,
  train,
  trainingCost,
  upgradeEquipment,
} from '../game/campaign';
import { useStore } from '../state/store';
import { ATTRIBUTES, type Attribute, type CrewRecord } from '../game/types';
import { CrewCard, Empty, Hud, Meter, money } from './parts';

type Tab = 'roster' | 'market' | 'kit';

const ATTR_NAMES: Record<Attribute, string> = {
  driving: 'Driving',
  security: 'Security',
  technical: 'Technical',
  social: 'Social',
  stealth: 'Stealth',
  nerve: 'Nerve',
};

export function CrewRoom() {
  const { campaign, screen, dispatch, update } = useStore();
  const c = campaign!;
  const [tab, setTab] = useState<Tab>(screen === 'kit' ? 'kit' : 'roster');
  const [inspect, setInspect] = useState<string | undefined>();

  // Crew and Equipment are two entries in the nav but one component, so the
  // tab has to follow the screen — without this, pressing Equipment while
  // already in the crew room does nothing at all.
  useEffect(() => {
    setTab(screen === 'kit' ? 'kit' : 'roster');
  }, [screen]);

  const records = crewRecords(c);
  const known = contactsAvailable(c);
  const upkeep = dailyUpkeep(c);

  return (
    <>
      <Hud
        title="The crew"
        bankroll={c.bankroll}
        heat={c.heat}
        day={c.day}
        nav={{ screen, go: (next) => dispatch({ type: 'SCREEN', screen: next }) }}
      />
      <div className="screen">
        <div className="tabs">
          {(['roster', 'market', 'kit'] as Tab[]).map((t) => (
            <button
              key={t}
              className={`tabs__tab${tab === t ? ' tabs__tab--on' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'roster' ? `Payroll (${records.length})` : t === 'market' ? 'Hire' : 'Equipment'}
            </button>
          ))}
        </div>

        {tab === 'roster' ? (
          <>
            {upkeep > 0 ? (
              <div className="panel upkeep">
                <span className="dim">
                  Permanent crew draw a retainer whether or not there is work.
                </span>
                <strong className="money">{money(Math.round(upkeep))}/day</strong>
              </div>
            ) : null}
            <div className="grid" style={{ marginTop: 12 }}>
              {records.length === 0 ? (
                <Empty>Nobody works for you yet. Try the Hire tab.</Empty>
              ) : (
                records.map((record) => (
                  <RosterCard
                    key={record.member.id}
                    record={record}
                    day={c.day}
                    bankroll={c.bankroll}
                    onBail={() => update((camp) => bailOut(camp, record.member.id))}
                    onRelease={() => update((camp) => release(camp, record.member.id))}
                    onTrain={(attr) => update((camp) => train(camp, record.member.id, attr))}
                    onInspect={() =>
                      setInspect(inspect === record.member.id ? undefined : record.member.id)
                    }
                    expanded={inspect === record.member.id}
                  />
                ))
              )}
            </div>
          </>
        ) : null}

        {tab === 'market' ? (
          <div className="stack" style={{ marginTop: 12 }}>
            {known.length ? (
              <>
                <div className="eyebrow">People you know · {known.length}</div>
                <p className="faint hire-note">
                  Loyalty carries across every rehire. At {LOYALTY_RETAIN} they stop going home
                  after the job and stay on the payroll — for a retainer.
                </p>
                <div className="grid">
                  {known.map((member) => {
                    const cost = hireCost(member, c);
                    return (
                      <CrewCard
                        key={member.id}
                        member={member}
                        disabled={c.bankroll < cost}
                        onClick={() => update((camp) => hire(camp, member.id))}
                        footer={
                          <div className="crew-card__foot">
                            <span>
                              {member.jobsWithYou ?? 0} job{(member.jobsWithYou ?? 0) === 1 ? '' : 's'} with you ·{' '}
                              {member.loyalty} loyalty
                            </span>
                            <strong className="num">{money(cost)}</strong>
                          </div>
                        }
                      />
                    );
                  })}
                </div>
              </>
            ) : null}

            <div className="eyebrow" style={{ marginTop: 6 }}>New faces</div>
            <div className="grid">
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
          </div>
        ) : null}

        {tab === 'kit' ? (
          <div className="grid" style={{ marginTop: 12 }}>
            {EQUIPMENT.map((base) => {
              const owned = c.ownedEquipment.includes(base.id);
              const level = equipmentLevel(c, base.id);
              const item = owned ? equipmentAtLevel(base, level) : base;
              const upgradeable = canUpgradeEquipment(c, base.id);
              const upCost = equipmentUpgradeCost(c, base.id);

              return (
                <div key={base.id} className={`kit${owned ? ' kit--owned' : ''}`}>
                  <div className="spread">
                    <div>
                      <div className="kit__name">{item.name}</div>
                      {owned ? (
                        <div className="kit__level">
                          {'●'.repeat(level)}
                          <span className="faint">{'○'.repeat(MAX_EQUIPMENT_LEVEL - level)}</span>
                          <span className="faint"> level {level}</span>
                        </div>
                      ) : null}
                    </div>
                    {owned ? (
                      upgradeable ? (
                        <button
                          className="btn btn--sm btn--gold"
                          disabled={c.bankroll < upCost}
                          onClick={() => update((camp) => upgradeEquipment(camp, base.id))}
                        >
                          Upgrade {money(upCost)}
                        </button>
                      ) : (
                        <span className="tag tag--green">Maxed</span>
                      )
                    ) : (
                      <button
                        className="btn btn--sm"
                        disabled={c.bankroll < base.cost}
                        onClick={() => update((camp) => buyEquipment(camp, base.id))}
                      >
                        {money(base.cost)}
                      </button>
                    )}
                  </div>
                  <p className="kit__blurb">{base.blurb}</p>
                  <div className="kit__meta">
                    {Object.entries(item.bonus).map(([stage, value]) => (
                      <span key={stage} className="tag">
                        {stage} +{value}
                      </span>
                    ))}
                    {item.heat ? <span className="tag tag--red">+{item.heat} heat</span> : null}
                    <span className={`tag ${item.reliability > 0.96 ? 'tag--green' : 'tag--gold'}`}>
                      {Math.round(item.reliability * 100)}% reliable
                    </span>
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
  onTrain,
  onInspect,
  expanded,
}: {
  record: CrewRecord;
  day: number;
  bankroll: number;
  onBail: () => void;
  onRelease: () => void;
  onTrain: (attr: Attribute) => void;
  onInspect: () => void;
  expanded: boolean;
}) {
  const { member, condition, availableOnDay, jobsRun } = record;
  const unavailable = condition !== 'ready' || availableOnDay > day;
  const bail = bailCost(member);
  const retained = record.retained || isRetained(member);

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
                  : retained
                    ? 'Stays between jobs'
                    : 'Goes home after the job'}
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
            <Bar
              label={retained ? 'Loyalty — yours' : `Loyalty — stays at ${LOYALTY_RETAIN}`}
              value={member.loyalty}
              color={retained ? 'var(--gold)' : 'var(--green)'}
            />
            <Bar label="Greed" value={member.greed} color="var(--red)" />
          </div>

          <div className="eyebrow" style={{ margin: '14px 0 8px' }}>
            Training — {jobsRun} job{jobsRun === 1 ? '' : 's'} run
            {member.trained ? ` · ${member.trained} lessons paid for` : ''}
          </div>
          <div className="train">
            {ATTRIBUTES.map((attr) => {
              const cost = trainingCost(member, attr);
              const able = canTrain(member, attr) && bankroll >= cost;
              return (
                <button
                  key={attr}
                  className="train__row"
                  disabled={!able}
                  onClick={() => onTrain(attr)}
                >
                  <span className="train__name">{ATTR_NAMES[attr]}</span>
                  <span className="train__value num">{member.stats[attr]}</span>
                  <span className="train__cost money">
                    {canTrain(member, attr) ? money(cost) : 'max'}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="faint" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
            A lesson costs a day and raises the skill by five. The planning board tells you
            which skill each stage of a job will actually test.
          </p>

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
