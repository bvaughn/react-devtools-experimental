// @flow

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { unstable_batchedUpdates as batchedUpdates } from 'react-dom';
import { useLocalStorage, useSubscription } from '../hooks';
import {
  TreeDispatcherContext,
  TreeStateContext,
} from '../Components/TreeContext';
import { StoreContext } from '../context';
import Store from '../../store';

import type { ImportedProfilingData } from './types';

export type TabID = 'flame-chart' | 'ranked-chart' | 'interactions';

// TODO (profiling selector) Maybe replace multiple useState() with useReducer()
// TODO (profiling selector) Maybe separate state and dispatcher contexts like TreeContext does

type Context = {|
  // Which tab is selexted in the Profiler UI?
  selectedTabID: TabID,
  selectTab(id: TabID): void,

  // Have we recorded any profiling data?
  // Are we currently profiling?
  // This value may be modified by the record button in the Profiler toolbar,
  // or from the backend itself (after a reload-and-profile action).
  // It is synced between the backend and frontend via a Store subscription.
  hasProfilingData: boolean,
  isProfiling: boolean,
  startProfiling(value: boolean): void,
  stopProfiling(value: boolean): void,

  // Which renderer and root should profiling data be shown for?
  // This value should be initialized to either:
  // 1. The selected root in the Components tree (if it has any profiling data) or
  // 2. The first root in the list with profiling data.
  rendererID: number | null,
  rootID: number | null,
  rootHasProfilingData: boolean,
  selectRootID: (id: number) => void,

  // Controls whether commits are filtered by duration.
  // This value is controlled by a filter toggle UI in the Profiler toolbar.
  // It impacts the commit selector UI as well as the fiber commits bar chart.
  isCommitFilterEnabled: boolean,
  setIsCommitFilterEnabled: (value: boolean) => void,
  minCommitDuration: number,
  setMinCommitDuration: (value: number) => void,

  // Which commit is currently selected in the commit selector UI.
  // Note that this is the index of the commit in all commits (non-filtered) that were profiled.
  // This value is controlled by the commit selector UI in the Profiler toolbar.
  // It impacts the flame graph and ranked charts.
  selectedCommitIndex: number | null,
  selectCommitIndex: (value: number | null) => void,

  // Which fiber is currently selected in the Ranked or Flamegraph charts?
  selectedFiberID: number | null,
  selectedFiberName: string | null,
  selectFiber: (id: number | null, name: string | null) => void,

  // Which interaction is currently selected in the Interactions graph?
  selectedInteractionID: number | null,
  selectInteraction: (id: number | null) => void,
|};

const ProfilerContext = createContext<Context>(((null: any): Context));
ProfilerContext.displayName = 'ProfilerContext';

type StoreProfilingState = {|
  hasProfilingData: boolean,
  importedProfilingData: ImportedProfilingData | null,
  isProfiling: boolean,
|};

type Props = {|
  children: React$Node,
|};

function ProfilerContextController({ children }: Props) {
  const store = useContext(StoreContext);
  const { selectedElementID } = useContext(TreeStateContext);
  const dispatch = useContext(TreeDispatcherContext);

  const subscription = useMemo(
    () => ({
      getCurrentValue: () => ({
        hasProfilingData: store.hasProfilingData,
        importedProfilingData: store.importedProfilingData,
        isProfiling: store.isProfiling,
      }),
      subscribe: (callback: Function) => {
        store.addListener('importedProfilingData', callback);
        store.addListener('isProfiling', callback);
        return () => {
          store.removeListener('importedProfilingData', callback);
          store.removeListener('isProfiling', callback);
        };
      },
    }),
    [store]
  );

  const [rendererID, setRendererID] = useState<number | null>(null);
  const [rootHasProfilingData, setRootHasProfilingData] = useState<boolean>(
    false
  );
  const [rootID, setRootID] = useState<number | null>(null);

  const storeProfilingState = useSubscription<StoreProfilingState, Store>(
    subscription
  );
  const {
    isProfiling,
    hasProfilingData,
    importedProfilingData,
  } = storeProfilingState;

  const [
    prevStoreProfilingState,
    setPrevStoreProfilingState,
  ] = useState<StoreProfilingState>(storeProfilingState);
  if (prevStoreProfilingState !== storeProfilingState) {
    setPrevStoreProfilingState(storeProfilingState);

    if (store.importedProfilingData !== null) {
      const { profilingOperations } = store.importedProfilingData;
      const firstRootID = profilingOperations.keys().next().value;
      setRootID(firstRootID || null);
      setRendererID(null);
      setRootHasProfilingData(firstRootID != null);
    } else if (!isProfiling) {
      setRootHasProfilingData(hasProfilingData);

      if (rootID !== null && store.profilingOperations.has(rootID)) {
        // If there is profiling data for the previously selected root, don't change it.
      } else {
        const componentsTreeRootID =
          selectedElementID !== null
            ? store.getRootIDForElement(selectedElementID)
            : null;

        if (
          componentsTreeRootID !== null &&
          store.profilingOperations.has(componentsTreeRootID)
        ) {
          // If there's profiling data for the element currently selected in the Components tree, use it.
          setRootID(componentsTreeRootID);
          setRendererID(store.getRendererIDForElement(componentsTreeRootID));
        } else {
          // Just select the first root by default
          const firstRootID = store.profilingOperations.keys().next().value;
          if (firstRootID != null) {
            setRootID(firstRootID);
            setRendererID(store.getRendererIDForElement(firstRootID));
          }
        }
      }
    } else {
      setRootHasProfilingData(false);
    }
  }

  const selectRootID = useCallback((rootID: number) => {
    setRendererID(store.getRendererIDForElement(rootID));
    setRootID(rootID);
  }, []);

  const startProfiling = useCallback(() => store.startProfiling(), [store]);
  const stopProfiling = useCallback(() => store.stopProfiling(), [store]);

  const [
    isCommitFilterEnabled,
    setIsCommitFilterEnabled,
  ] = useLocalStorage<boolean>('React::DevTools::isCommitFilterEnabled', false);
  const [minCommitDuration, setMinCommitDuration] = useLocalStorage<number>(
    'minCommitDuration',
    0
  );

  const [selectedCommitIndex, selectCommitIndex] = useState<number | null>(
    null
  );
  const [selectedTabID, selectTab] = useState<TabID>('flame-chart');
  const [selectedFiberID, selectFiberID] = useState<number | null>(null);
  const [selectedFiberName, selectFiberName] = useState<string | null>(null);
  const [selectedInteractionID, selectInteraction] = useState<number | null>(
    null
  );

  const selectFiber = useCallback(
    (id: number | null, name: string | null) => {
      selectFiberID(id);
      selectFiberName(name);
      if (id !== null) {
        // If this element is still in the store, then select it in the Components tab as well.
        const element = store.getElementByID(id);
        if (element !== null) {
          dispatch({
            type: 'SELECT_ELEMENT_BY_ID',
            payload: id,
          });
        }
      }
    },
    [dispatch, selectFiberID, selectFiberName, store]
  );

  if (isProfiling) {
    batchedUpdates(() => {
      if (selectedCommitIndex !== null) {
        selectCommitIndex(null);
      }
      if (selectedFiberID !== null) {
        selectFiberID(null);
        selectFiberName(null);
      }
      if (selectedInteractionID !== null) {
        selectInteraction(null);
      }
    });
  }

  const value = useMemo(
    () => ({
      selectedTabID,
      selectTab,

      hasProfilingData,
      isProfiling,
      startProfiling,
      stopProfiling,

      rendererID,
      rootID,
      rootHasProfilingData,
      selectRootID,

      isCommitFilterEnabled,
      setIsCommitFilterEnabled,
      minCommitDuration,
      setMinCommitDuration,

      selectedCommitIndex,
      selectCommitIndex,

      selectedFiberID,
      selectedFiberName,
      selectFiber,

      selectedInteractionID,
      selectInteraction,
    }),
    [
      selectedTabID,
      selectTab,

      hasProfilingData,
      isProfiling,
      startProfiling,
      stopProfiling,

      rendererID,
      rootID,
      rootHasProfilingData,
      selectRootID,

      isCommitFilterEnabled,
      setIsCommitFilterEnabled,
      minCommitDuration,
      setMinCommitDuration,

      selectedCommitIndex,
      selectCommitIndex,

      selectedFiberID,
      selectedFiberName,
      selectFiber,

      selectedInteractionID,
      selectInteraction,
    ]
  );

  return (
    <ProfilerContext.Provider value={value}>
      {children}
    </ProfilerContext.Provider>
  );
}

export { ProfilerContext, ProfilerContextController };
