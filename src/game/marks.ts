import { pAtLeast, OUTCOME_BANDS, type Plan } from './calc';
import type { Campaign, CampaignRecords, HeistResult, RunState } from './types';

/**
 * Marks: the things a crew gets known for.
 *
 * None of these are asked for. The player is never shown a checklist — an
 * unearned mark is a line of rumour in the paper's back pages, and the first
 * time one lands it lands in the middle of the count, which is the only
 * place a discovery should be announced. Every mark is something the engine
 * already allows; the mark is the game noticing that you did it.
 */

export interface MarkContext {
  result: HeistResult;
  run: RunState;
  plan: Plan;
}

export interface Mark {
  id: string;
  name: string;
  /** What the street says before you have earned it. Never the rule itself. */
  rumour: string;
  /** What it means, once you know. */
  line: string;
  earned: (ctx: MarkContext) => boolean;
}

const clean = (r: HeistResult) => r.grade === 'perfect' || r.grade === 'clean';
const landed = (o: string) => o === 'success' || o === 'critical';

export const MARKS: Mark[] = [
  {
    id: 'unseen',
    name: 'Unseen',
    rumour: 'Some crews finish a whole night without anyone outside ever looking up.',
    line: 'In and out, and nobody outside ever started counting.',
    earned: ({ run, result }) => !result.aborted && result.gross > 0 && run.exposedAt === null,
  },
  {
    id: 'ghost',
    name: 'Nobody Was Ever There',
    rumour: 'There is a grade above clean. Hardly anyone has seen it.',
    line: 'A perfect night. No alarm, no trouble, the whole take.',
    earned: ({ result }) => result.grade === 'perfect',
  },
  {
    id: 'clockwork',
    name: 'Clockwork',
    rumour: 'A crew in rhythm gets paid for it. A crew that never misses a beat gets talked about.',
    line: 'Six clean stages in a row.',
    earned: ({ result }) => (result.bestStreak ?? 0) >= 6,
  },
  {
    id: 'one_more',
    name: 'One More Drawer',
    rumour: 'The best crews never leave when the safe is empty. There is always more in there.',
    line: 'Went back in after the objective, and came out with more.',
    earned: ({ run }) => (run.greed ?? []).some((g) => landed(g.outcome)),
  },
  {
    id: 'greedy',
    name: 'Should Not Have Done That',
    rumour: 'Going back once is brave. Going back twice is a story.',
    line: 'Went back twice, and landed both.',
    earned: ({ run }) => (run.greed ?? []).filter((g) => landed(g.outcome)).length >= 2,
  },
  {
    id: 'grain',
    name: 'Against the Grain',
    rumour: 'The odds are a description, not a promise.',
    line: 'Landed a stage the crew called grim.',
    earned: ({ run }) =>
      run.results.some(
        (r) => landed(r.outcome) && pAtLeast(r.score - r.opposition - OUTCOME_BANDS.partial) < 0.22,
      ),
  },
  {
    id: 'photo',
    name: 'Photo Finish',
    rumour: 'The police being outside is not the same as the police catching you.',
    line: 'Police on site, and the driver got everyone out anyway.',
    earned: ({ run, result }) =>
      run.policeOnSite &&
      result.arrests === 0 &&
      run.results.some((r) => r.stage === 'escape' && landed(r.outcome)),
  },
  {
    id: 'ghost_money',
    name: 'More Than It Was Worth',
    rumour: 'Every building is worth exactly what the file says. Except when it isn’t.',
    line: 'Walked out with more than the job’s headline value.',
    earned: ({ result, plan }) => result.gross > plan.target.value,
  },
  {
    id: 'front_door',
    name: 'Through the Front',
    rumour: 'Loud does not have to mean caught.',
    line: 'Went in aggressive, came out clean, nobody held.',
    earned: ({ plan, result }) => plan.approach.id === 'aggressive' && clean(result) && result.arrests === 0,
  },
  {
    id: 'lie',
    name: 'Planned Around It',
    rumour: 'A bad file does not have to mean a bad night.',
    line: 'A source lied to you, and the job went clean anyway.',
    earned: ({ run, result }) => (run.revealedLies ?? []).length > 0 && clean(result),
  },
  {
    id: 'walk',
    name: 'The Long Way Round',
    rumour: 'Sometimes the best job is the one you walk away from.',
    line: 'Called it off before anyone noticed you were there.',
    earned: ({ run, result }) => Boolean(result.aborted) && run.exposedAt === null,
  },
  {
    id: 'old_friends',
    name: 'Old Friends',
    rumour: 'Some people stop being freelancers.',
    line: 'Ran a job with somebody on their fifth night with you.',
    earned: ({ plan }) => plan.crew.some((m) => (m.jobsWithYou ?? 0) >= 4),
  },
  {
    id: 'big_score',
    name: 'The Big Score',
    rumour: 'Everybody in this city is waiting for one night. Seven figures. Yours.',
    line: 'A million dollars, yours, in one night.',
    earned: ({ result }) => result.net >= 1_000_000,
  },
];

export const markById = (id: string) => MARKS.find((m) => m.id === id);

export const EMPTY_RECORDS: CampaignRecords = {
  bestNet: 0,
  bestGross: 0,
  bestStreak: 0,
  perfectNights: 0,
  jobs: 0,
};

/**
 * What tonight added to the campaign's legend. Marks are earned once; records
 * only count a night as a record once there was a night before it to beat.
 */
export function scoreNight(
  campaign: Campaign,
  ctx: MarkContext,
): { marks: Record<string, number>; fresh: string[]; records: CampaignRecords; record: boolean } {
  const had = campaign.marks ?? {};
  const fresh = MARKS.filter((m) => !had[m.id] && m.earned(ctx)).map((m) => m.id);
  const marks = { ...had };
  for (const id of fresh) marks[id] = campaign.day;

  const was = campaign.records ?? EMPTY_RECORDS;
  const { result } = ctx;
  const record = was.jobs > 0 && result.net > was.bestNet;
  const records: CampaignRecords = {
    bestNet: Math.max(was.bestNet, result.net),
    bestGross: Math.max(was.bestGross, result.gross),
    bestStreak: Math.max(was.bestStreak, result.bestStreak ?? 0),
    perfectNights: was.perfectNights + (result.grade === 'perfect' ? 1 : 0),
    jobs: was.jobs + 1,
  };
  return { marks, fresh, records, record };
}
