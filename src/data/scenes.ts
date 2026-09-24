import type { ApproachId, StageId } from '../game/types';

/**
 * The words the night is staged in.
 *
 * `resolve.ts` decides what happens; this file only decides how it is framed
 * before it happens — where the crew are standing, what time it is, and what
 * the person about to do the work says to you. None of it moves a number.
 */

/** Where each stage takes place, per target. Falls back to the generic row. */
export const PLACES: Record<string, Record<StageId, string>> = {
  _default: {
    approach: 'The street',
    entry: 'The door',
    security: 'The panel',
    objective: 'The safe',
    extraction: 'The way out',
    escape: 'The road',
  },
  argent_vine: {
    approach: 'Vine Street',
    entry: 'The shutter',
    security: 'The back office',
    objective: 'The floor safe',
    extraction: 'The shop floor',
    escape: 'Old Town',
  },
  vantel_payroll: {
    approach: 'The lobby',
    entry: 'Ninth floor',
    security: 'The desk feeds',
    objective: 'The drawer safe',
    extraction: 'Service lift',
    escape: 'Downtown',
  },
  meridian_run: {
    approach: 'The haulage yard',
    entry: 'The cab',
    security: 'The tracker',
    objective: 'The rear door',
    extraction: 'The eleven minutes',
    escape: 'The ring road',
  },
  kestrel_gallery: {
    approach: 'The market square',
    entry: 'The skylight',
    security: 'The alarm board',
    objective: 'The touring cases',
    extraction: 'The upper gallery',
    escape: 'Old Town',
  },
  aeolia: {
    approach: 'The deep berth',
    entry: 'The tender dock',
    security: 'The bridge deck',
    objective: 'The stateroom',
    extraction: 'The gangway',
    escape: 'The harbour',
  },
  port_argent_savings: {
    approach: 'Exchange Street',
    entry: 'Night deposit corridor',
    security: 'The contractor feed',
    objective: 'The vault',
    extraction: 'The banking hall',
    escape: 'Four minutes',
  },
  bellweather_cage: {
    approach: 'The casino floor',
    entry: 'Staff only',
    security: 'The eye in the sky',
    objective: 'The count room',
    extraction: 'The trolley run',
    escape: 'The Strip',
  },
};

/**
 * When the job starts, by approach, in minutes after midnight (negative is
 * the evening before). A social job happens in business hours; an aggressive
 * one happens while the tills are full.
 */
export const START_MINUTES: Record<ApproachId, number> = {
  stealth: -10,
  technical: 20,
  distraction: -80,
  inside: -165,
  social: -440,
  aggressive: -560,
};

export type LeadMood = 'sure' | 'unsure' | 'grim' | 'hurt' | 'thrown';

/**
 * What the person leading a stage says as it starts. Their mood is read from
 * the live odds and their state, so a line of dialogue is also a readout.
 */
export const LEAD_LINES: Record<StageId, Record<LeadMood, string[]>> = {
  approach: {
    sure: ['“Street’s dead. I’ll walk us in.”', '“Same as the last three nights. Follow me.”'],
    unsure: ['“Too many lit windows. Give me a second.”', '“I don’t love this street tonight.”'],
    grim: ['“Somebody is going to see us. I’m just telling you.”', '“This is the wrong street for this many people.”'],
    hurt: ['“I’m fine. Walk slower.”', '“Don’t look at me. Look at the street.”'],
    thrown: ['“This isn’t the street I walked.”', '“Nobody said anything about that.”'],
  },
  entry: {
    sure: ['“Ninety seconds. Maybe less.”', '“I’ve opened worse than this blindfold.”'],
    unsure: ['“Give me thirty seconds. Don’t talk.”', '“It’ll go. It just won’t go quietly.”'],
    grim: ['“I can try. I want that on the record.”', '“This lock is better than I am.”'],
    hurt: ['“Hold the light. My hand isn’t steady.”', '“Still got it. Mostly.”'],
    thrown: ['“This isn’t the lock I practised on.”', '“Whoever wrote the file never stood here.”'],
  },
  security: {
    sure: ['“I own this building in two minutes.”', '“Cameras are a formality.”'],
    unsure: ['“It’s a newer system than it looks. Bear with me.”', '“I can loop most of it. Most.”'],
    grim: ['“This is watching back. I don’t like it.”', '“If I get this wrong, it calls somebody.”'],
    hurt: ['“Type for me. I’ll tell you what.”', '“Keep them off me for a minute.”'],
    thrown: ['“This isn’t the system in the file.”', '“There are more feeds than there should be.”'],
  },
  objective: {
    sure: ['“I’ve done this door on a kitchen table. Twice.”', '“It’s already open. It just doesn’t know.”'],
    unsure: ['“This is going to take as long as it takes.”', '“Quiet, all of you. I need to hear it.”'],
    grim: ['“I can get into this. I can’t promise when.”', '“Get the bags ready for half.”'],
    hurt: ['“Somebody hold this. I can’t grip.”', '“Talk me through it. I’ll do the hands.”'],
    thrown: ['“That is not the safe you paid to hear about.”', '“Who sold you this? Because it’s wrong.”'],
  },
  extraction: {
    sure: ['“Bags out, heads down, nobody runs.”', '“Walk it like it’s yours.”'],
    unsure: ['“Somebody’s moving upstairs. Quick and quiet.”', '“Two trips. Don’t argue.”'],
    grim: ['“They know. Carry what you can.”', '“If I say drop it, drop it.”'],
    hurt: ['“Take my bag. I’ll take the door.”', '“I can walk. I can’t carry.”'],
    thrown: ['“The way out isn’t where it was.”', '“That door wasn’t locked on the plan.”'],
  },
  escape: {
    sure: ['“Seatbelts. I’ll have you home before the kettle.”', '“Nobody follows me on these roads.”'],
    unsure: ['“Radio’s busy. Hold on to something.”', '“I’ll take the long way. Don’t argue.”'],
    grim: ['“They’re on every road out. I’ll find one.”', '“Hold on. I mean properly.”'],
    hurt: ['“I can drive. I can always drive.”', '“Just point. I’ll steer.”'],
    thrown: ['“That’s not where they’re meant to be.”', '“The route’s gone. Improvising.”'],
  },
};

/** Before the quote: what they do. Picked alongside it. */
export const GESTURES = [
  'looks at you.',
  'doesn’t look up.',
  'says it into the radio, low.',
  'checks the time, then you.',
  'breathes out.',
  'holds up a hand.',
];

/** The three calls, named for what they are at this stage. */
export const CALLS: Record<StageId, { careful: string; steady: string; push: string }> = {
  approach: { careful: 'Walk it twice', steady: 'In as drawn', push: 'Straight in' },
  entry: { careful: 'Let {who} work', steady: 'Open it', push: 'Force it' },
  security: { careful: 'Map it first', steady: 'Loop the cameras', push: 'Rip it out' },
  objective: { careful: 'Slow and quiet', steady: 'Work the door', push: 'Cut it now' },
  extraction: { careful: 'One bag at a time', steady: 'Out as planned', push: 'Everything, now' },
  escape: { careful: 'Back streets, lights off', steady: 'The planned route', push: 'Floor it' },
};

/** What a lie looks like at the moment it stops being believable. */
export const LIE_FOUND: Record<string, string> = {
  rotation: 'The night man is not where the rotation said he would be.',
  cameras: 'There are cameras here the coverage map does not show.',
  access: 'The door is not the one described in the file.',
  vault: 'The safe is not the model you paid to learn about.',
  response: 'The patrol car is not where the response report put it.',
  insider: 'Your name on the inside has not done what was promised.',
};

/** And what the truth looks like when it holds. */
export const INTEL_HOLDS: Record<string, string> = {
  rotation: 'The rotation holds. The night man is exactly where he should be.',
  cameras: 'The camera map is right. Every blind spot where it was drawn.',
  access: 'The door is the one in the file.',
  vault: 'The safe is the model in the file.',
  response: 'The patrol pattern is the one you paid for.',
  insider: 'Your inside name is doing their part.',
};

/**
 * The plan, read back as a theory. One sentence per stage, in three strengths.
 * `{who}` is whoever the engine will put on it.
 */
export const THEORY: Record<StageId, { strong: string; fair: string; weak: string }> = {
  approach: {
    strong: '{who} walks you in.',
    fair: '{who} should get you to the door.',
    weak: 'Getting to the door rests on {who}, and it should not.',
  },
  entry: {
    strong: '{who} has the door.',
    fair: '{who} can probably open it.',
    weak: 'The door could beat {who}.',
  },
  security: {
    strong: '{who} owns the cameras.',
    fair: '{who} should handle the cameras.',
    weak: 'The cameras are a problem {who} may not solve.',
  },
  objective: {
    strong: '{who} opens the safe.',
    fair: '{who} can open it, given time.',
    weak: 'Nobody here can reliably open what you came for.',
  },
  extraction: {
    strong: '{who} walks it out.',
    fair: '{who} gets it out, probably.',
    weak: 'Carrying it out is where this comes apart.',
  },
  escape: {
    strong: '{who} drives you home.',
    fair: '{who} should lose them.',
    weak: 'If it is loud by the end, {who} will not outrun it.',
  },
};
