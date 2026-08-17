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
import { chooseEventOption, resolveStage, startRun } from '../game/resolve';
import type { ApproachId, Campaign, Screen } from '../game/types';
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
      return { ...state, campaign, screen: campaign.run ? 'execute' : 'city' };
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
      return {
        ...state,
        screen: 'target',
        draft: { ...emptyDraft, targetId: action.targetId },
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
  nextStage: () => void;
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
      campaign: { ...campaign, run: startRun(plan, seed) },
    });
    dispatch({ type: 'SCREEN', screen: 'execute' });
  }, [planFromDraft]);

  const nextStage = useCallback(() => {
    const { campaign } = stateRef.current;
    const plan = planFromDraft();
    if (!campaign?.run || !plan || campaign.run.outcome) return;
    dispatch({
      type: 'CAMPAIGN',
      campaign: { ...campaign, run: resolveStage(plan, campaign.run) },
    });
  }, [planFromDraft]);

  const choose = useCallback(
    (choiceId: string) => {
      const { campaign } = stateRef.current;
      const plan = planFromDraft();
      if (!campaign?.run || !plan) return;
      dispatch({
        type: 'CAMPAIGN',
        campaign: { ...campaign, run: chooseEventOption(plan, campaign.run, choiceId) },
      });
    },
    [planFromDraft],
  );

  const bankHeist = useCallback(() => {
    const { campaign } = stateRef.current;
    const plan = planFromDraft();
    if (!campaign?.run?.outcome || !plan) return;
    dispatch({ type: 'CAMPAIGN', campaign: C.completeHeist(campaign, campaign.run, plan) });
    dispatch({ type: 'SCREEN', screen: 'report' });
  }, [planFromDraft]);

  const value = useMemo<Store>(
    () => ({
      ...state,
      saveExists: hasSave(),
      dispatch,
      update,
      beginHeist,
      nextStage,
      choose,
      bankHeist,
    }),
    [state, update, beginHeist, nextStage, choose, bankHeist],
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
