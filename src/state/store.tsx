import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import * as C from '../game/campaign';
import { seedFrom } from '../game/rng';
import { abortRun, chooseEventOption, resolveStage, startRun } from '../game/resolve';
import type { ApproachId, Campaign, Screen, StageTactic } from '../game/types';
import { clearCampaign, hasSave, loadCampaign, saveCampaign } from './persistence';

/**
 * The single place React and the engine meet.
 *
 * Every action here delegates to a pure function in `src/game`. If a
 * calculation ever appears in this file, it is in the wrong file.
 */

export interface Draft {
  targetId?: string;
  approachId?: ApproachId;
  crewIds: string[];
  equipmentIds: string[];
}

interface State {
  campaign?: Campaign;
  screen: Screen;
  draft: Draft;
  /** Set while a stage is being read out, to pace the execution screen. */
  busy: boolean;
}

type Action =
  | { type: 'NEW_GAME'; handle: string }
  | { type: 'CONTINUE' }
  | { type: 'RESET' }
  | { type: 'SCREEN'; screen: Screen }
  | { type: 'CAMPAIGN'; campaign: Campaign }
  | { type: 'DRAFT'; draft: Partial<Draft> }
  | { type: 'SELECT_TARGET'; targetId: string }
  | { type: 'TOGGLE_CREW'; id: string }
  | { type: 'TOGGLE_KIT'; id: string }
  | { type: 'BUSY'; busy: boolean };

const emptyDraft: Draft = { crewIds: [], equipmentIds: [] };

const initial: State = { screen: 'title', draft: emptyDraft, busy: false };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'NEW_GAME': {
      const campaign = C.newCampaign(seedFrom(`${action.handle}:${Date.now()}`), action.handle);
      return { ...state, campaign, screen: 'city', draft: emptyDraft };
    }
    case 'CONTINUE': {
      const campaign = loadCampaign();
      if (!campaign) return state;
      // A heist in progress carries its own plan; put the draft back to match
      // it so that Back from the report lands on the same job.
      const run = campaign.run;
      const draft = run
        ? { targetId: run.targetId, approachId: run.approachId, crewIds: run.crewIds, equipmentIds: run.equipmentIds }
        : emptyDraft;
      return { ...state, campaign, draft, screen: run ? 'execute' : 'city' };
    }
    case 'RESET':
      clearCampaign();
      return { ...initial };
    case 'SCREEN':
      return { ...state, screen: action.screen };
    case 'CAMPAIGN':
      return { ...state, campaign: action.campaign };
    case 'DRAFT':
      return { ...state, draft: { ...state.draft, ...action.draft } };
    case 'SELECT_TARGET':
      // Crew and kit are campaign-level things the player already chose, so
      // they carry across jobs; only the approach is specific to this target.
      // Clearing them meant re-picking the whole crew for every job, which over
      // a fifteen-job campaign is just typing.
      return {
        ...state,
        screen: 'target',
        draft: {
          ...state.draft,
          targetId: action.targetId,
          approachId: undefined,
        },
      };
    case 'TOGGLE_CREW': {
      const has = state.draft.crewIds.includes(action.id);
      return {
        ...state,
        draft: {
          ...state.draft,
          crewIds: has
            ? state.draft.crewIds.filter((id) => id !== action.id)
            : [...state.draft.crewIds, action.id],
        },
      };
    }
    case 'TOGGLE_KIT': {
      const has = state.draft.equipmentIds.includes(action.id);
      return {
        ...state,
        draft: {
          ...state.draft,
          equipmentIds: has
            ? state.draft.equipmentIds.filter((id) => id !== action.id)
            : [...state.draft.equipmentIds, action.id],
        },
      };
    }
    case 'BUSY':
      return { ...state, busy: action.busy };
  }
}

interface Store extends State {
  saveExists: boolean;
  dispatch: (a: Action) => void;
  update: (fn: (c: Campaign) => Campaign) => void;
  beginHeist: () => void;
  nextStage: (tactic?: StageTactic) => void;
  abort: () => void;
  choose: (choiceId: string) => void;
  bankHeist: () => void;
}

const StoreContext = createContext<Store | undefined>(undefined);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  useEffect(() => {
    if (state.campaign) saveCampaign(state.campaign);
  }, [state.campaign]);

  // A ref keeps the callbacks below stable while always seeing the newest
  // campaign, so screens do not re-render every time one of them is passed on.
  const stateRef = useRef(state);
  stateRef.current = state;

  const update = useCallback((fn: (c: Campaign) => Campaign) => {
    dispatch({ type: 'CAMPAIGN', campaign: fn(stateRef.current.campaign!) });
  }, []);

  const planFromDraft = useCallback(() => {
    const { campaign, draft } = stateRef.current;
    if (!campaign || !draft.targetId || !draft.approachId) return undefined;
    return C.planFor(campaign, draft.targetId, draft.approachId, draft.crewIds, draft.equipmentIds);
  }, []);

  const beginHeist = useCallback(() => {
    const plan = planFromDraft();
    const campaign = stateRef.current.campaign;
    if (!plan || !campaign) return;
    // The seed is derived, not random: the same campaign, target and day
    // replays the same night, which is what makes a bug report reproducible.
    const seed = seedFrom(`${campaign.seed}:${plan.target.id}:${campaign.day}`);
    dispatch({
      type: 'CAMPAIGN',
      campaign: { ...campaign, run: startRun(plan, seed, campaign.seenEventIds ?? []) },
    });
    dispatch({ type: 'SCREEN', screen: 'execute' });
  }, [planFromDraft]);

  // Once a run exists, the run is the plan. Reading it back from the draft
  // meant a reload mid-heist rendered nothing at all: the draft lives in
  // memory and the run lives in the save.
  const planFromRun = useCallback(() => {
    const { campaign } = stateRef.current;
    if (!campaign?.run) return undefined;
    return C.planForRun(campaign, campaign.run);
  }, []);

  const nextStage = useCallback(
    (tactic: StageTactic = 'steady') => {
      const { campaign } = stateRef.current;
      const plan = planFromRun();
      if (!campaign?.run || !plan || campaign.run.outcome) return;
      dispatch({
        type: 'CAMPAIGN',
        campaign: { ...campaign, run: resolveStage(plan, campaign.run, tactic) },
      });
    },
    [planFromRun],
  );

  const abort = useCallback(() => {
    const { campaign } = stateRef.current;
    const plan = planFromRun();
    if (!campaign?.run || !plan) return;
    dispatch({ type: 'CAMPAIGN', campaign: { ...campaign, run: abortRun(plan, campaign.run) } });
  }, [planFromRun]);

  const choose = useCallback(
    (choiceId: string) => {
      const { campaign } = stateRef.current;
      const plan = planFromRun();
      if (!campaign?.run || !plan) return;
      dispatch({
        type: 'CAMPAIGN',
        campaign: { ...campaign, run: chooseEventOption(plan, campaign.run, choiceId) },
      });
    },
    [planFromRun],
  );

  const bankHeist = useCallback(() => {
    const { campaign } = stateRef.current;
    const plan = planFromRun();
    if (!campaign?.run?.outcome || !plan) return;
    dispatch({ type: 'CAMPAIGN', campaign: C.completeHeist(campaign, campaign.run, plan) });
    dispatch({ type: 'SCREEN', screen: 'report' });
  }, [planFromRun]);

  const value = useMemo<Store>(
    () => ({
      ...state,
      saveExists: hasSave(),
      dispatch,
      update,
      beginHeist,
      nextStage,
      abort,
      choose,
      bankHeist,
    }),
    [state, update, beginHeist, nextStage, abort, choose, bankHeist],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore outside StoreProvider');
  return store;
}

export function useCampaign(): Campaign {
  const { campaign } = useStore();
  if (!campaign) throw new Error('no campaign');
  return campaign;
}
