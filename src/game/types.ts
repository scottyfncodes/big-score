/**
 * The whole vocabulary of the game, in one file.
 *
 * Rule for this codebase: nothing here imports anything. Types describe the
 * data; `src/game/*` computes over it; `src/ui/*` renders it. React never
 * calculates a number that the engine could calculate instead.
 */

export type Attribute =
  | 'driving'
  | 'security'
  | 'technical'
  | 'social'
  | 'stealth'
  | 'nerve';

export const ATTRIBUTES: Attribute[] = [
  'driving',
  'security',
  'technical',
  'social',
  'stealth',
  'nerve',
];

export type CrewRole =
  | 'driver'
  | 'hacker'
  | 'safecracker'
  | 'face'
  | 'scout'
  | 'engineer'
  | 'muscle'
  | 'insideman';

export type ApproachId =
  | 'stealth'
  | 'social'
  | 'technical'
  | 'distraction'
  | 'inside'
  | 'aggressive';

export type StageId =
  | 'approach'
  | 'entry'
  | 'security'
  | 'objective'
  | 'extraction'
  | 'escape';

export const STAGE_ORDER: StageId[] = [
  'approach',
  'entry',
  'security',
  'objective',
  'extraction',
  'escape',
];

/**
 * A stage never returns a bare pass/fail. The five bands are the reason the
 * game has stories in it: `partial` and `complication` are the interesting
 * middle, and `failure` changes the state of the run rather than ending it.
 */
export type StageOutcome =
  | 'critical'
  | 'success'
  | 'partial'
  | 'complication'
  | 'failure';

export type Grade = 'perfect' | 'clean' | 'messy' | 'botched' | 'catastrophic';

export type Stats = Record<Attribute, number>;

export interface Trait {
  id: string;
  name: string;
  /** Shown on the crew card. One line, in the crew member's own terms. */
  blurb: string;
  /** Flat stat shifts. Deliberately small — a trait is an event hook first. */
  mods?: Partial<Stats>;
  /** Multiplies the chance an event fires against this crew member's run. */
  complicationMul?: number;
}

export interface CrewMember {
  id: string;
  name: string;
  /** Two initials for the polaroid when there's no room for a full name. */
  initials: string;
  role: CrewRole;
  stats: Stats;
  loyalty: number;
  greed: number;
  nerveShown: number;
  traits: string[];
  experience: number;
  /** Up-front fee. The cut is taken from the score on top of this. */
  cost: number;
  /** Share of the take, as a fraction. Greed pushes this up. */
  cut: number;
  bio: string;
  hiredOnDay?: number;
}

export type CrewCondition = 'ready' | 'injured' | 'burned' | 'arrested' | 'dead';

/** Persistent, campaign-level state for a crew member on the payroll. */
export interface CrewRecord {
  member: CrewMember;
  condition: CrewCondition;
  /** Day the member becomes available again. */
  availableOnDay: number;
  jobsRun: number;
  /** Opinion of other crew, by id. Positive is trust, negative is friction. */
  bonds: Record<string, number>;
}

export type IntelConfidence = 'confirmed' | 'rumored' | 'false';

export interface IntelSource {
  id: string;
  name: string;
  /** 0-100. The player learns this over a campaign; it is never displayed raw. */
  reliability: number;
  costMul: number;
}

export interface IntelTopic {
  id: string;
  label: string;
  /** What buying it tells you, before it is known to be true. */
  claim: string;
  cost: number;
  /** Which stage the knowledge actually helps at. */
  stage: StageId;
  /** How much the opposition drops at that stage when the intel is true. */
  value: number;
  /** Set when the intel unlocks an approach that is otherwise unavailable. */
  unlocksApproach?: ApproachId;
}

export interface Intel {
  topicId: string;
  sourceId: string;
  confidence: IntelConfidence;
  /** What the player was told. False intel reads exactly like true intel. */
  reading: string;
  boughtOnDay: number;
}

export interface Security {
  guards: number;
  cameras: number;
  alarm: number;
  accessControl: number;
  /** Seconds before police reach the site once the clock starts. */
  responseTime: number;
}

export interface Target {
  id: string;
  name: string;
  districtId: string;
  type: string;
  tier: 1 | 2 | 3 | 4 | 5;
  /** Headline value. The real take is this multiplied by how the run went. */
  value: number;
  security: Security;
  /** Security the player can see without scouting. The rest is guesswork. */
  publicSecurity: (keyof Security)[];
  approaches: ApproachId[];
  topics: IntelTopic[];
  /** Flavour, and the reason to pick this job over the other one. */
  blurb: string;
  /** Written on the case board once scouted. */
  weakness: string;
  unlockAtScore: number;
}

export interface District {
  id: string;
  name: string;
  blurb: string;
  /** Where the district sits on the 100x100 map grid. */
  x: number;
  y: number;
  unlockAtScore: number;
}

export interface Equipment {
  id: string;
  name: string;
  cost: number;
  blurb: string;
  /** Stage-specific bonus to the crew's score. */
  bonus: Partial<Record<StageId, number>>;
  /** Attribute-wide bonus, applied wherever that attribute is tested. */
  attrBonus?: Partial<Stats>;
  heat?: number;
  /** Multiplies noise generated by every stage. Below 1 is quieter. */
  noiseMul?: number;
  timeMul?: number;
  /** 0-1. Below 1, the kit can simply not work on the night. */
  reliability: number;
  /** Some kit only makes sense for some approaches; shown as a hint, never a gate. */
  suits?: ApproachId[];
}

export interface Approach {
  id: ApproachId;
  name: string;
  blurb: string;
  /** Overrides the attribute a stage tests. */
  attrFor?: Partial<Record<StageId, Attribute>>;
  oppositionMul?: Partial<Record<StageId, number>>;
  timeMul: number;
  noiseMul: number;
  /** Heat charged for choosing this approach at all, before anything happens. */
  heatBase: number;
  takeMul: number;
  /**
   * Roles the approach leans on. Missing one is a penalty at the stages that
   * need it — never a block. "Can I make this work anyway" is the whole game.
   */
  keyRoles: CrewRole[];
  /** Intel topic that must be held for the approach to be offered at all. */
  requiresTopic?: string;
}

/** A crew member's state inside one running heist. */
export interface CrewRunState {
  id: string;
  /** Rattled crew test worse and draw more events. */
  composure: number;
  separated: boolean;
  injured: boolean;
  caught: boolean;
  /** Personal narration, shown in the post-heist report. */
  notes: string[];
}

export interface StageResult {
  stage: StageId;
  outcome: StageOutcome;
  attr: Attribute;
  score: number;
  opposition: number;
  margin: number;
  roll: number;
  /** Who did the work. Every stage has a name attached to it. */
  actorId?: string;
  headline: string;
  detail: string;
  timeSpent: number;
  noiseAdded: number;
}

export interface EventChoice {
  id: string;
  label: string;
  /** One line of consequence framing. Never states the odds outright. */
  hint: string;
  /** When set, the choice is resolved against a crew check. */
  check?: { attr: Attribute; dc: number };
  /** Only offered when true. Used for kit-dependent and role-dependent outs. */
  when?: (ctx: EventContext) => boolean;
  resolve: (ctx: EventContext, passed: boolean) => EventResolution;
}

export interface EventResolution {
  text: string;
  time?: number;
  noise?: number;
  heat?: number;
  takeMul?: number;
  bonusTake?: number;
  alarm?: boolean;
  /** Composure delta applied to the crew member the event named. */
  composure?: number;
  separate?: boolean;
  injure?: boolean;
  capture?: boolean;
  /** Ends the run here — used only by abort choices. */
  abort?: boolean;
  loyalty?: Record<string, number>;
}

export interface GameEvent {
  id: string;
  /** Stages the event can interrupt. */
  stages: StageId[];
  weight: number;
  /** Every event must be able to name someone. This picks who. */
  actor: { role?: CrewRole; trait?: string; any?: boolean };
  when?: (ctx: EventContext) => boolean;
  title: string;
  /** `{actor}` and `{target}` are substituted when the event is shown. */
  body: string;
  choices: EventChoice[];
}

export interface EventContext {
  run: RunState;
  target: Target;
  approach: Approach;
  /** The crew member the event named. Always present. */
  actor: CrewMember;
  crew: CrewMember[];
  equipment: Equipment[];
  stage: StageId;
  /** Attribute score the crew can bring to bear, for choice checks. */
  scoreFor: (attr: Attribute) => number;
  has: (role: CrewRole) => boolean;
  hasKit: (equipmentId: string) => boolean;
  knows: (topicId: string) => boolean;
}

export interface RunLogEntry {
  kind: 'stage' | 'event' | 'note';
  stage: StageId;
  text: string;
  tone: 'good' | 'bad' | 'neutral' | 'great' | 'awful';
}

export interface PendingEvent {
  eventId: string;
  actorId: string;
  stage: StageId;
}

export interface RunState {
  seed: number;
  /** Increments on every draw. The stream is a pure function of (seed, cursor). */
  cursor: number;
  targetId: string;
  approachId: ApproachId;
  crewIds: string[];
  equipmentIds: string[];
  /** Kit that failed its reliability check tonight and is doing nothing. */
  deadKitIds: string[];
  stageIndex: number;
  /** Seconds elapsed on site, from the first move to the last. */
  clock: number;
  /**
   * The clock value at which somebody outside the building started counting.
   * Null while the crew are still invisible — which is the whole point of
   * being quiet. Police arrive at `exposedAt + window`, not at `window`.
   */
  exposedAt: number | null;
  window: number;
  noise: number;
  alarm: boolean;
  policeOnSite: boolean;
  takeMul: number;
  bonusTake: number;
  heat: number;
  results: StageResult[];
  /** Events already fired tonight. Nothing repeats within one run. */
  firedEventIds: string[];
  log: RunLogEntry[];
  crewRun: Record<string, CrewRunState>;
  pending?: PendingEvent;
  /** Set once the run is over, however it ended. */
  outcome?: HeistResult;
}

export interface HeistResult {
  grade: Grade;
  gross: number;
  crewCut: number;
  net: number;
  heat: number;
  durationSeconds: number;
  complications: number;
  injuries: number;
  arrests: number;
  policeContact: boolean;
  stars: 1 | 2 | 3 | 4 | 5;
  notableMoment: string;
  loyaltyDeltas: Record<string, number>;
  headline: string;
  standfirst: string;
}

export interface NewsStory {
  id: string;
  day: number;
  masthead: string;
  headline: string;
  standfirst: string;
  body: string;
  take: number;
}

export type Screen =
  | 'title'
  | 'city'
  | 'target'
  | 'crew'
  | 'plan'
  | 'execute'
  | 'report'
  | 'news';

export interface Campaign {
  version: number;
  seed: number;
  day: number;
  bankroll: number;
  heat: number;
  score: number;
  crew: Record<string, CrewRecord>;
  /** Recruits currently on offer. Refreshes as days pass. */
  market: CrewMember[];
  ownedEquipment: string[];
  intel: Record<string, Intel[]>;
  scouted: Record<string, number>;
  completed: string[];
  news: NewsStory[];
  reports: HeistResult[];
  handle: string;
  run?: RunState;
  lastReport?: HeistResult;
}
