import type { IntelTopic, Target } from '../game/types';

/**
 * Seven targets, authored rather than generated.
 *
 * Each one exists to make a different plan the obvious one and then punish
 * that obviousness somewhere else — the jeweller is soft everywhere except the
 * exit, the armoured run is a timing problem, the bank is a response-time
 * problem, and the cage cannot be done quietly at all.
 *
 * `value` is the headline number. What the crew actually carries out is that
 * multiplied by how the night went, so a target is never worth a fixed amount.
 */

type TopicSeed = Partial<IntelTopic> & Pick<IntelTopic, 'id' | 'claim'>;

const TOPIC_DEFAULTS: Record<string, Omit<IntelTopic, 'id' | 'claim'>> = {
  rotation: {
    label: 'Guard rotation',
    cost: 2500,
    stage: 'approach',
    value: 18,
  },
  cameras: {
    label: 'Camera coverage',
    cost: 3000,
    stage: 'security',
    value: 20,
  },
  access: {
    label: 'Access control',
    cost: 3500,
    stage: 'entry',
    value: 20,
  },
  vault: {
    label: 'Vault specification',
    cost: 5000,
    stage: 'objective',
    value: 22,
  },
  response: {
    label: 'Police response',
    cost: 2000,
    stage: 'escape',
    value: 16,
  },
  insider: {
    label: 'A name on the inside',
    cost: 6500,
    stage: 'entry',
    value: 14,
    unlocksApproach: 'inside',
  },
};

const topics = (seeds: TopicSeed[]): IntelTopic[] =>
  seeds.map((seed) => ({ ...TOPIC_DEFAULTS[seed.id], ...seed }) as IntelTopic);

export const TARGETS: Target[] = [
  {
    id: 'argent_vine',
    name: 'Argent & Vine',
    districtId: 'oldtown',
    type: 'Jewellery Store',
    tier: 1,
    value: 62000,
    security: { guards: 22, cameras: 34, alarm: 40, accessControl: 30, responseTime: 480 },
    publicSecurity: ['cameras', 'guards'],
    approaches: ['stealth', 'social', 'technical', 'aggressive', 'inside'],
    needs: [
      { tag: 'entry', stage: 'entry', note: 'The shutter lock is the only thing between the street and the counter.' },
      { tag: 'cutting', stage: 'objective', critical: true, note: 'It is a floor safe set in concrete. Nobody is talking it open.' },
    ],
    blurb:
      'Family jewellers on a corner of Vine Street. Two staff, a good safe, and a window display worth more than the safe.',
    weakness: 'The only way out is the street you came in on.',
    unlockAtScore: 0,
    topics: topics([
      { id: 'rotation', claim: 'When the night man walks his round, and how long he is gone.' },
      { id: 'cameras', claim: 'Which of the four cameras actually records.' },
      { id: 'vault', claim: 'Make and age of the floor safe under the counter.' },
      { id: 'response', claim: 'Which car covers Vine Street after midnight.' },
      { id: 'insider', claim: 'The Saturday girl has debts and a key.' },
    ]),
  },
  {
    id: 'vantel_payroll',
    name: 'Vantel Payroll Floor',
    districtId: 'downtown',
    type: 'Corporate Office',
    tier: 1,
    value: 48000,
    security: { guards: 30, cameras: 42, alarm: 28, accessControl: 44, responseTime: 540 },
    publicSecurity: ['cameras', 'accessControl'],
    approaches: ['social', 'technical', 'stealth', 'inside', 'distraction'],
    needs: [
      { tag: 'cover', stage: 'approach', critical: true, note: 'Nine floors of people who will ask who you are unless you look like an answer.' },
      { tag: 'signal', stage: 'security', note: 'The lobby desk watches six feeds. Give it nothing to watch.' },
    ],
    blurb:
      'Nine floors of a building that empties at seven. Cash payroll for the haulage contracts sits in a drawer safe until Friday.',
    weakness: 'Nobody on that floor has ever been asked for identification.',
    unlockAtScore: 0,
    topics: topics([
      { id: 'access', claim: 'Which badges open the ninth floor after hours.' },
      { id: 'cameras', claim: 'The lobby desk watches six feeds and reads one.' },
      { id: 'rotation', claim: 'The cleaning contract, and who props which door.' },
      { id: 'insider', claim: 'A payroll clerk who was passed over in March.' },
    ]),
  },
  {
    id: 'meridian_run',
    name: 'The Meridian Run',
    districtId: 'industrial',
    type: 'Armored Truck',
    tier: 1,
    value: 88000,
    security: { guards: 48, cameras: 20, alarm: 30, accessControl: 55, responseTime: 360 },
    publicSecurity: ['guards'],
    approaches: ['aggressive', 'technical', 'distraction', 'stealth'],
    needs: [
      { tag: 'vehicle', stage: 'escape', critical: true, note: 'You are taking this on an open road. What you leave in decides everything.' },
      { tag: 'cutting', stage: 'objective', critical: true, note: 'The rear door is armoured and it is not going to be persuaded.' },
      { tag: 'comms', stage: 'extraction', note: 'Eleven minutes, three positions, one timing. Somebody has to call it.' },
    ],
    blurb:
      'A Meridian Security truck runs the haulage yards every Tuesday. Between the third and fourth stop it sits alone for eleven minutes.',
    weakness: 'Eleven minutes is the whole job. There is no version of this that is slow.',
    unlockAtScore: 0,
    topics: topics([
      { id: 'rotation', claim: 'The stop order, and where the eleven minutes fall.' },
      { id: 'access', claim: 'How the rear door interlock is released.', cost: 4000 },
      { id: 'response', claim: 'Meridian calls its own control room before it calls the police.' },
    ]),
  },
  {
    id: 'kestrel_gallery',
    name: 'The Kestrel Gallery',
    districtId: 'oldtown',
    type: 'Art Gallery',
    tier: 2,
    value: 240000,
    security: { guards: 40, cameras: 62, alarm: 66, accessControl: 48, responseTime: 400 },
    publicSecurity: ['cameras'],
    approaches: ['stealth', 'social', 'technical', 'distraction', 'inside'],
    needs: [
      { tag: 'entry', stage: 'entry', note: 'The skylight hatch is 1890s ironwork with a modern padlock through it.' },
      { tag: 'signal', stage: 'security', critical: true, note: 'The alarm reports out of the building. It has to stop reporting.' },
      { tag: 'surveillance', stage: 'approach', note: 'The upper gallery has a blind arch, if you have watched long enough to find it.' },
    ],
    blurb:
      'A touring collection sits in the Kestrel for eleven days. The building is Victorian, the alarm system is not.',
    weakness: 'The alarm is beautiful. The skylight is 1890s ironwork.',
    unlockAtScore: 0,
    topics: topics([
      { id: 'cameras', claim: 'Coverage of the upper gallery and the blind arch.' },
      { id: 'vault', claim: 'The case locks on the touring pieces, and their tolerances.' },
      { id: 'access', claim: 'The skylight hatch and what holds it.' },
      { id: 'response', claim: 'The Old Town car covers four streets and the market.' },
      { id: 'insider', claim: 'A night guard who has opinions about his employer.' },
    ]),
  },
  {
    id: 'aeolia',
    name: 'The Aeolia',
    districtId: 'harbor',
    type: 'Luxury Yacht',
    tier: 2,
    value: 275000,
    security: { guards: 52, cameras: 44, alarm: 50, accessControl: 60, responseTime: 300 },
    publicSecurity: ['guards', 'accessControl'],
    approaches: ['social', 'stealth', 'inside', 'aggressive'],
    needs: [
      { tag: 'cover', stage: 'approach', critical: true, note: 'Nobody walks onto a berth like that. They are expected, or they are met.' },
      { tag: 'vehicle', stage: 'escape', critical: true, note: 'A boat has one road off it and it is made of water.' },
      { tag: 'comms', stage: 'extraction', note: 'Four crew aboard and three decks. Silence is not the same as coordination.' },
    ],
    blurb:
      'Moored at the deep berth for the season. The owner is not aboard; the safe, the art and four crew are.',
    weakness: 'A boat has one road off it, and it is made of water.',
    unlockAtScore: 120000,
    topics: topics([
      { id: 'rotation', claim: 'Which two crew stay aboard overnight.', cost: 3500 },
      { id: 'access', claim: 'The tender dock code and when it cycles.', cost: 4500 },
      { id: 'vault', claim: 'The stateroom safe is bolted to a bulkhead, not a floor.' },
      { id: 'response', claim: 'Harbour patrol runs on the hour and is easily an hour late.' },
      { id: 'insider', claim: 'The second steward is owed three months.' },
    ]),
  },
  {
    id: 'port_argent_savings',
    name: 'Port Argent Savings',
    districtId: 'financial',
    type: 'Small Bank',
    tier: 2,
    value: 320000,
    security: { guards: 55, cameras: 70, alarm: 72, accessControl: 66, responseTime: 260 },
    publicSecurity: ['cameras', 'guards', 'alarm'],
    approaches: ['technical', 'inside', 'aggressive', 'stealth', 'distraction'],
    needs: [
      { tag: 'cutting', stage: 'objective', critical: true, note: 'A vault door on a time lock. Bring something that argues with steel.' },
      { tag: 'signal', stage: 'security', critical: true, note: 'The feed runs to a contractor who is paid to be watching it.' },
      { tag: 'vehicle', stage: 'escape', critical: true, note: 'Four minutes, and the station is two hundred metres away.' },
    ],
    blurb:
      'Two hundred metres from a police station, which is exactly why the branch keeps a light guard and a heavy vault.',
    weakness: 'Four minutes. Everything about this job is four minutes.',
    unlockAtScore: 120000,
    topics: topics([
      { id: 'vault', claim: 'The vault time-lock and the window it leaves open.', cost: 7000 },
      { id: 'cameras', claim: 'The feed runs to a contractor, not the branch.', cost: 4000 },
      { id: 'response', claim: 'The station’s night shift and what it is already doing.', cost: 3500 },
      { id: 'access', claim: 'The night deposit corridor and its interlock.' },
      { id: 'insider', claim: 'An assistant manager with a gambling problem.', cost: 9000 },
    ]),
  },
  {
    id: 'bellweather_cage',
    name: 'The Bellweather Cage',
    districtId: 'casino',
    type: 'Casino Cage',
    tier: 3,
    value: 940000,
    security: { guards: 78, cameras: 84, alarm: 70, accessControl: 76, responseTime: 240 },
    publicSecurity: ['guards', 'cameras', 'accessControl'],
    approaches: ['inside', 'technical', 'distraction', 'aggressive', 'social'],
    needs: [
      { tag: 'cover', stage: 'approach', critical: true, note: 'The floor is the safest place in the building, if you belong on it.' },
      { tag: 'signal', stage: 'security', critical: true, note: 'The eye in the sky is two men whose whole job is looking at you.' },
      { tag: 'cutting', stage: 'objective', note: 'The count room door is a door. The trolley is not.' },
      { tag: 'vehicle', stage: 'escape', critical: true, note: 'Their response is faster than the police and less interested in arrest.' },
    ],
    blurb:
      'The count room behind the Bellweather floor holds the weekend in cash until the Tuesday collection. Their security does not call the police; it deals with things itself.',
    weakness: 'They will not call the police. That is not as good for you as it sounds.',
    unlockAtScore: 500000,
    topics: topics([
      { id: 'rotation', claim: 'Pit shift change, and the ninety seconds it costs them.', cost: 6000 },
      { id: 'cameras', claim: 'The eye in the sky, and the two men who read it.', cost: 7000 },
      { id: 'vault', claim: 'The count room door, the drop schedule, the trolley.', cost: 9000 },
      { id: 'response', claim: 'Their own response, which is faster and less lawful.', cost: 5000 },
      { id: 'insider', claim: 'A cage supervisor who has been skimming for a year.', cost: 14000 },
    ]),
  },
];

export function targetById(id: string): Target | undefined {
  return TARGETS.find((t) => t.id === id);
}

export function targetsInDistrict(districtId: string): Target[] {
  return TARGETS.filter((t) => t.districtId === districtId);
}
