// @flow

// This context combines tree/selection state, search, and the owners stack.
// These values are managed together because changes in one often impact the others.
// Combining them enables us to avoid cascading renders.
//
// Changes to search state may impact tree state.
// For example, updating the selected search result also updates the tree's selected value.
// Search does not fundamanetally change the tree though.
// It is also possible to update the selected tree value independently.
//
// Changes to owners state mask search and tree values.
// When owners statck is not empty, search is temporarily disabnled,
// and tree values (e.g. num elements, selected element) are masked.
// Both tree and search values are restored when the owners stack is cleared.
//
// For this reason, changes to the tree context are processed in sequence: tree -> search -> owners
// This enables each section to potentially override (or mask) previous values.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import {
  unstable_next as next,
  unstable_runWithPriority as runWithPriority,
  unstable_UserBlockingPriority as UserBlockingPriority,
} from 'scheduler';
import { createRegExp } from '../utils';
import { BridgeContext, StoreContext } from '../context';
import Store from '../../store';

import type { Element } from './types';

export type StateContext = {|
  // Tree
  numElements: number,
  selectedElementID: number | null,
  selectedElementIndex: number | null,

  // Search
  searchIndex: number | null,
  searchResults: Array<number>,
  searchText: string,

  // Owners
  ownerID: number | null,
  ownerFlatTree: Array<Element> | null,

  // Inspection element panel
  inspectedElementID: number | null,
|};

type ACTION_GO_TO_NEXT_SEARCH_RESULT = {|
  type: 'GO_TO_NEXT_SEARCH_RESULT',
|};
type ACTION_GO_TO_PREVIOUS_SEARCH_RESULT = {|
  type: 'GO_TO_PREVIOUS_SEARCH_RESULT',
|};
type ACTION_HANDLE_STORE_MUTATION = {|
  type: 'HANDLE_STORE_MUTATION',
  payload: [Array<number>, Map<number, number>],
|};
type ACTION_RESET_OWNER_STACK = {|
  type: 'RESET_OWNER_STACK',
|};
type ACTION_SELECT_CHILD_ELEMENT_IN_TREE = {|
  type: 'SELECT_CHILD_ELEMENT_IN_TREE',
|};
type ACTION_SELECT_ELEMENT_AT_INDEX = {|
  type: 'SELECT_ELEMENT_AT_INDEX',
  payload: number | null,
|};
type ACTION_SELECT_ELEMENT_BY_ID = {|
  type: 'SELECT_ELEMENT_BY_ID',
  payload: number | null,
|};
type ACTION_SELECT_NEXT_ELEMENT_IN_TREE = {|
  type: 'SELECT_NEXT_ELEMENT_IN_TREE',
|};
type ACTION_SELECT_PARENT_ELEMENT_IN_TREE = {|
  type: 'SELECT_PARENT_ELEMENT_IN_TREE',
|};
type ACTION_SELECT_PREVIOUS_ELEMENT_IN_TREE = {|
  type: 'SELECT_PREVIOUS_ELEMENT_IN_TREE',
|};
type ACTION_SELECT_OWNER = {|
  type: 'SELECT_OWNER',
  payload: number,
|};
type ACTION_SET_SEARCH_TEXT = {|
  type: 'SET_SEARCH_TEXT',
  payload: string,
|};
type ACTION_UPDATE_INSPECTED_ELEMENT_ID = {|
  type: 'UPDATE_INSPECTED_ELEMENT_ID',
|};

type Action =
  | ACTION_GO_TO_NEXT_SEARCH_RESULT
  | ACTION_GO_TO_PREVIOUS_SEARCH_RESULT
  | ACTION_HANDLE_STORE_MUTATION
  | ACTION_RESET_OWNER_STACK
  | ACTION_SELECT_CHILD_ELEMENT_IN_TREE
  | ACTION_SELECT_ELEMENT_AT_INDEX
  | ACTION_SELECT_ELEMENT_BY_ID
  | ACTION_SELECT_NEXT_ELEMENT_IN_TREE
  | ACTION_SELECT_PARENT_ELEMENT_IN_TREE
  | ACTION_SELECT_PREVIOUS_ELEMENT_IN_TREE
  | ACTION_SELECT_OWNER
  | ACTION_SET_SEARCH_TEXT
  | ACTION_UPDATE_INSPECTED_ELEMENT_ID;

export type DispatcherContext = (action: Action) => void;

const TreeStateContext = createContext<StateContext>(
  ((null: any): StateContext)
);
TreeStateContext.displayName = 'TreeStateContext';

const TreeDispatcherContext = createContext<DispatcherContext>(
  ((null: any): DispatcherContext)
);
TreeDispatcherContext.displayName = 'TreeDispatcherContext';

type State = {|
  // Tree
  numElements: number,
  selectedElementID: number | null,
  selectedElementIndex: number | null,

  // Search
  searchIndex: number | null,
  searchResults: Array<number>,
  searchText: string,

  // Owners
  ownerID: number | null,
  ownerFlatTree: Array<Element> | null,

  // Inspection element panel
  inspectedElementID: number | null,
|};

function reduceTreeState(store: Store, state: State, action: Action): State {
  let { numElements, ownerID, selectedElementIndex, selectedElementID } = state;

  let lookupIDForIndex = true;

  // Base tree should ignore selected element changes when the owner's tree is active.
  if (ownerID === null) {
    switch (action.type) {
      case 'HANDLE_STORE_MUTATION':
        numElements = store.numElements;

        // If the currently-selected Element has been removed from the tree, update selection state.
        const removedIDs = action.payload[1];
        // Find the closest parent that wasn't removed during this batch.
        // We deduce the parent-child mapping from removedIDs (id -> parentID)
        // because by now it's too late to read them from the store.
        while (
          selectedElementID !== null &&
          removedIDs.has(selectedElementID)
        ) {
          selectedElementID = ((removedIDs.get(
            selectedElementID
          ): any): number);
        }
        if (selectedElementID === 0) {
          // The whole root was removed.
          selectedElementIndex = null;
        }
        break;
      case 'SELECT_CHILD_ELEMENT_IN_TREE':
        if (selectedElementIndex !== null) {
          const selectedElement = store.getElementAtIndex(
            ((selectedElementIndex: any): number)
          );
          if (
            selectedElement !== null &&
            selectedElement.children.length > 0 &&
            !selectedElement.isCollapsed
          ) {
            const firstChildID = selectedElement.children[0];
            const firstChildIndex = store.getIndexOfElementID(firstChildID);
            if (firstChildIndex !== null) {
              selectedElementIndex = firstChildIndex;
            }
          }
        }
        break;
      case 'SELECT_ELEMENT_AT_INDEX':
        selectedElementIndex = (action: ACTION_SELECT_ELEMENT_AT_INDEX).payload;
        break;
      case 'SELECT_ELEMENT_BY_ID':
        // Skip lookup in this case; it would be redundant.
        // It might also cause problems if the specified element was inside of a (not yet expanded) subtree.
        lookupIDForIndex = false;

        selectedElementID = (action: ACTION_SELECT_ELEMENT_BY_ID).payload;
        selectedElementIndex =
          selectedElementID === null
            ? null
            : store.getIndexOfElementID(selectedElementID);
        break;
      case 'SELECT_NEXT_ELEMENT_IN_TREE':
        if (
          selectedElementIndex === null ||
          selectedElementIndex + 1 >= numElements
        ) {
          selectedElementIndex = 0;
        } else {
          selectedElementIndex++;
        }
        break;
      case 'SELECT_PARENT_ELEMENT_IN_TREE':
        if (selectedElementIndex !== null) {
          const selectedElement = store.getElementAtIndex(
            ((selectedElementIndex: any): number)
          );
          if (selectedElement !== null && selectedElement.parentID !== null) {
            const parentIndex = store.getIndexOfElementID(
              selectedElement.parentID
            );
            if (parentIndex !== null) {
              selectedElementIndex = parentIndex;
            }
          }
        }
        break;
      case 'SELECT_PREVIOUS_ELEMENT_IN_TREE':
        if (selectedElementIndex === null || selectedElementIndex === 0) {
          selectedElementIndex = numElements - 1;
        } else {
          selectedElementIndex--;
        }
        break;
      default:
        // React can bailout of no-op updates.
        return state;
    }
  }

  // Keep selected item ID and index in sync.
  if (lookupIDForIndex && selectedElementIndex !== state.selectedElementIndex) {
    if (selectedElementIndex === null) {
      selectedElementID = null;
    } else {
      selectedElementID = store.getElementIDAtIndex(
        ((selectedElementIndex: any): number)
      );
    }
  }

  return {
    ...state,

    numElements,
    selectedElementIndex,
    selectedElementID,
  };
}

function reduceSearchState(store: Store, state: State, action: Action): State {
  let {
    ownerID,
    searchIndex,
    searchResults,
    searchText,
    selectedElementID,
    selectedElementIndex,
  } = state;

  const prevSearchText = searchText;
  const numPrevSearchResults = searchResults.length;

  // We track explicitly whether search was requested because
  // we might want to search even if search index didn't change.
  // For example, if you press "next result" on a search with a single
  // result but a different current selection, we'll set this to true.
  let didRequestSearch = false;

  // Search isn't supported when the owner's tree is active.
  if (ownerID === null) {
    switch (action.type) {
      case 'GO_TO_NEXT_SEARCH_RESULT':
        if (numPrevSearchResults > 0) {
          didRequestSearch = true;
          searchIndex =
            searchIndex + 1 < numPrevSearchResults ? searchIndex + 1 : 0;
        }
        break;
      case 'GO_TO_PREVIOUS_SEARCH_RESULT':
        if (numPrevSearchResults > 0) {
          didRequestSearch = true;
          searchIndex =
            ((searchIndex: any): number) > 0
              ? ((searchIndex: any): number) - 1
              : numPrevSearchResults - 1;
        }
        break;
      case 'HANDLE_STORE_MUTATION':
        if (searchText !== '') {
          const [
            addedElementIDs,
            removedElementIDs,
          ] = (action: ACTION_HANDLE_STORE_MUTATION).payload;

          removedElementIDs.forEach((parentID, id) => {
            // Prune this item from the search results.
            const index = searchResults.indexOf(id);
            if (index >= 0) {
              searchResults = searchResults
                .slice(0, index)
                .concat(searchResults.slice(index + 1));

              // If the results are now empty, also deselect things.
              if (searchResults.length === 0) {
                searchIndex = null;
              } else if (((searchIndex: any): number) >= searchResults.length) {
                searchIndex = searchResults.length - 1;
              }
            }
          });

          addedElementIDs.forEach(id => {
            const element = ((store.getElementByID(id): any): Element);

            // It's possible that multiple tree operations will fire before this action has run.
            // So it's important to check for elements that may have been added and then removed.
            if (element !== null) {
              const { displayName } = element;

              // Add this item to the search results if it matches.
              const regExp = createRegExp(searchText);
              if (displayName !== null && regExp.test(displayName)) {
                const newElementIndex = ((store.getIndexOfElementID(
                  id
                ): any): number);

                let foundMatch = false;
                for (let index = 0; index < searchResults.length; index++) {
                  const id = searchResults[index];
                  if (
                    newElementIndex <
                    ((store.getIndexOfElementID(id): any): number)
                  ) {
                    foundMatch = true;
                    searchResults = searchResults
                      .slice(0, index)
                      .concat(id)
                      .concat(searchResults.slice(index));
                    break;
                  }
                }
                if (!foundMatch) {
                  searchResults = searchResults.concat(id);
                }

                searchIndex = searchIndex === null ? 0 : searchIndex;
              }
            }
          });
        }
        break;
      case 'SET_SEARCH_TEXT':
        searchIndex = null;
        searchResults = [];
        searchText = (action: ACTION_SET_SEARCH_TEXT).payload;

        if (searchText !== '') {
          const regExp = createRegExp(searchText);
          store.roots.forEach(rootID => {
            recursivelySearchTree(store, rootID, regExp, searchResults);
          });
          if (searchResults.length > 0) {
            if (selectedElementID !== null) {
              searchIndex = getNearestResult(searchResults, selectedElementID);
            } else {
              searchIndex = 0;
            }
          }
        }
        break;
      default:
        // React can bailout of no-op updates.
        return state;
    }
  }

  if (searchText !== prevSearchText) {
    const newSearchIndex = searchResults.indexOf(selectedElementID);
    if (newSearchIndex === -1) {
      // Only move the selection if the new query
      // doesn't match the current selection anymore.
      didRequestSearch = true;
    } else {
      // Selected item still matches the new search query.
      // Adjust the index to reflect its position in new results.
      searchIndex = newSearchIndex;
    }
  }
  if (didRequestSearch && searchIndex !== null) {
    selectedElementID = ((searchResults[searchIndex]: any): number);
    selectedElementIndex = store.getIndexOfElementID(
      ((selectedElementID: any): number)
    );
  }

  return {
    ...state,

    selectedElementID,
    selectedElementIndex,

    searchIndex,
    searchResults,
    searchText,
  };
}

function reduceOwnersState(store: Store, state: State, action: Action): State {
  let {
    numElements,
    selectedElementID,
    selectedElementIndex,
    ownerID,
    ownerFlatTree,
    searchIndex,
    searchResults,
    searchText,
  } = state;

  let prevSelectedElementIndex = selectedElementIndex;

  switch (action.type) {
    case 'HANDLE_STORE_MUTATION':
      if (ownerID !== null) {
        if (!store.containsElement(ownerID)) {
          ownerID = null;
          ownerFlatTree = null;
          selectedElementID = null;
        } else {
          ownerFlatTree = store.getOwnersListForElement(ownerID);
          if (selectedElementID !== null) {
            // Mutation might have caused the index of this ID to shift.
            selectedElementIndex = ownerFlatTree.findIndex(
              element => element.id === selectedElementID
            );
          }
        }
      } else {
        if (selectedElementID !== null) {
          // Mutation might have caused the index of this ID to shift.
          selectedElementIndex = store.getIndexOfElementID(selectedElementID);
        }
      }
      if (selectedElementIndex === -1) {
        // If we couldn't find this ID after mutation, unselect it.
        selectedElementIndex = null;
        selectedElementID = null;
      }
      break;
    case 'RESET_OWNER_STACK':
      ownerID = null;
      ownerFlatTree = null;
      selectedElementIndex =
        selectedElementID !== null
          ? store.getIndexOfElementID(selectedElementID)
          : null;
      break;
    case 'SELECT_ELEMENT_AT_INDEX':
      if (ownerFlatTree !== null) {
        selectedElementIndex = (action: ACTION_SELECT_ELEMENT_AT_INDEX).payload;
      }
      break;
    case 'SELECT_ELEMENT_BY_ID':
      if (ownerFlatTree !== null) {
        const payload = (action: ACTION_SELECT_ELEMENT_BY_ID).payload;
        if (payload === null) {
          selectedElementIndex = null;
        } else {
          selectedElementIndex = ownerFlatTree.findIndex(
            element => element.id === payload
          );

          // If the selected element is outside of the current owners list,
          // exit the list and select the element in the main tree.
          // This supports features like toggling Suspense.
          if (selectedElementIndex !== null && selectedElementIndex < 0) {
            ownerID = null;
            ownerFlatTree = null;
            selectedElementIndex = store.getIndexOfElementID(payload);
          }
        }
      }
      break;
    case 'SELECT_NEXT_ELEMENT_IN_TREE':
      if (ownerFlatTree !== null && ownerFlatTree.length > 0) {
        if (selectedElementIndex === null) {
          selectedElementIndex = 0;
        } else if (selectedElementIndex + 1 < ownerFlatTree.length) {
          selectedElementIndex++;
        }
      }
      break;
    case 'SELECT_PREVIOUS_ELEMENT_IN_TREE':
      if (ownerFlatTree !== null && ownerFlatTree.length > 0) {
        if (selectedElementIndex !== null && selectedElementIndex > 0) {
          selectedElementIndex--;
        }
      }
      break;
    case 'SELECT_OWNER':
      // If the Store doesn't have any owners metadata, don't drill into an empty stack.
      // This is a confusing user experience.
      if (store.hasOwnerMetadata) {
        ownerID = (action: ACTION_SELECT_OWNER).payload;
        ownerFlatTree = store.getOwnersListForElement(ownerID);

        // Always force reset selection to be the top of the new owner tree.
        selectedElementIndex = 0;
        prevSelectedElementIndex = null;
      }
      break;
    default:
      // React can bailout of no-op updates.
      return state;
  }

  // Changes in the selected owner require re-calculating the owners tree.
  if (
    ownerFlatTree !== state.ownerFlatTree ||
    action.type === 'HANDLE_STORE_MUTATION'
  ) {
    if (ownerFlatTree === null) {
      numElements = store.numElements;
    } else {
      numElements = ownerFlatTree.length;
    }
  }

  // Keep selected item ID and index in sync.
  if (selectedElementIndex !== prevSelectedElementIndex) {
    if (selectedElementIndex === null) {
      selectedElementID = null;
    } else {
      if (ownerFlatTree !== null) {
        selectedElementID = ownerFlatTree[selectedElementIndex].id;
      }
    }
  }

  return {
    ...state,

    numElements,
    selectedElementID,
    selectedElementIndex,

    searchIndex,
    searchResults,
    searchText,

    ownerID,
    ownerFlatTree,
  };
}

function reduceSuspenseState(
  store: Store,
  state: State,
  action: Action
): State {
  const { type } = action;
  switch (type) {
    case 'UPDATE_INSPECTED_ELEMENT_ID':
      if (state.inspectedElementID !== state.selectedElementID) {
        return {
          ...state,
          inspectedElementID: state.selectedElementID,
        };
      }
      break;
    default:
      break;
  }

  // React can bailout of no-op updates.
  return state;
}

type Props = {|
  children: React$Node,

  // Used for automated testing
  defaultOwnerID?: ?number,
  defaultSelectedElementID?: ?number,
  defaultSelectedElementIndex?: ?number,
|};

// TODO Remove TreeContextController wrapper element once global ConsearchText.write API exists.
function TreeContextController({
  children,
  defaultOwnerID,
  defaultSelectedElementID,
  defaultSelectedElementIndex,
}: Props) {
  const bridge = useContext(BridgeContext);
  const store = useContext(StoreContext);

  const initialRevision = useMemo(() => store.revision, [store]);

  // This reducer is created inline because it needs access to the Store.
  // The store is mutable, but the Store itself is global and lives for the lifetime of the DevTools,
  // so it's okay for the reducer to have an empty dependencies array.
  const reducer = useMemo(
    () => (state: State, action: Action): State => {
      const { type } = action;
      switch (type) {
        case 'GO_TO_NEXT_SEARCH_RESULT':
        case 'GO_TO_PREVIOUS_SEARCH_RESULT':
        case 'HANDLE_STORE_MUTATION':
        case 'RESET_OWNER_STACK':
        case 'SELECT_ELEMENT_AT_INDEX':
        case 'SELECT_ELEMENT_BY_ID':
        case 'SELECT_CHILD_ELEMENT_IN_TREE':
        case 'SELECT_NEXT_ELEMENT_IN_TREE':
        case 'SELECT_PARENT_ELEMENT_IN_TREE':
        case 'SELECT_PREVIOUS_ELEMENT_IN_TREE':
        case 'SELECT_OWNER':
        case 'UPDATE_INSPECTED_ELEMENT_ID':
        case 'SET_SEARCH_TEXT':
          state = reduceTreeState(store, state, action);
          state = reduceSearchState(store, state, action);
          state = reduceOwnersState(store, state, action);
          state = reduceSuspenseState(store, state, action);

          // If the selected ID is in a collapsed subtree, reset the selected index to null.
          // We'll know the correct index after the layout effect will toggle the tree,
          // and the store tree is mutated to account for that.
          if (
            state.selectedElementID !== null &&
            store.isInsideCollapsedSubTree(state.selectedElementID)
          ) {
            return {
              ...state,
              selectedElementIndex: null,
            };
          }

          return state;
        default:
          throw new Error(`Unrecognized action "${type}"`);
      }
    },
    [store]
  );

  const [state, dispatch] = useReducer(reducer, {
    // Tree
    numElements: store.numElements,
    selectedElementID:
      defaultSelectedElementID == null ? null : defaultSelectedElementID,
    selectedElementIndex:
      defaultSelectedElementIndex == null ? null : defaultSelectedElementIndex,

    // Search
    searchIndex: null,
    searchResults: [],
    searchText: '',

    // Owners
    ownerID: defaultOwnerID == null ? null : defaultOwnerID,
    ownerFlatTree: null,

    // Inspection element panel
    inspectedElementID: null,
  });

  const dispatchWrapper = useCallback(
    (action: Action) => {
      // Run the first update at "user-blocking" priority in case dispatch is called from a non-React event.
      // In this case, the current (and "next") priorities would both be "normal",
      // and suspense would potentially block both updates.
      runWithPriority(UserBlockingPriority, () => dispatch(action));
      next(() => dispatch({ type: 'UPDATE_INSPECTED_ELEMENT_ID' }));
    },
    [dispatch]
  );

  // Listen for host element selections.
  useEffect(() => {
    const handleSelectFiber = (id: number) =>
      dispatchWrapper({ type: 'SELECT_ELEMENT_BY_ID', payload: id });
    bridge.addListener('selectFiber', handleSelectFiber);
    return () => bridge.removeListener('selectFiber', handleSelectFiber);
  }, [bridge, dispatchWrapper]);

  // If a newly-selected search result or inspection selection is inside of a collapsed subtree, auto expand it.
  // This needs to be a layout effect to avoid temporarily flashing an incorrect selection.
  const prevSelectedElementID = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (state.selectedElementID !== prevSelectedElementID.current) {
      prevSelectedElementID.current = state.selectedElementID;

      if (state.selectedElementID !== null) {
        let element = store.getElementByID(state.selectedElementID);
        if (element !== null && element.parentID > 0) {
          store.toggleIsCollapsed(element.parentID, false);
        }
      }
    }
  }, [state.selectedElementID, store]);

  // Mutations to the underlying tree may impact this context (e.g. search results, selection state).
  useEffect(() => {
    const handleStoreMutated = ([addedElementIDs, removedElementIDs]: [
      Array<number>,
      Map<number, number>,
    ]) => {
      dispatchWrapper({
        type: 'HANDLE_STORE_MUTATION',
        payload: [addedElementIDs, removedElementIDs],
      });
    };

    // Since this is a passive effect, the tree may have been mutated before our initial subscription.
    if (store.revision !== initialRevision) {
      // At the moment, we can treat this as a mutation.
      // We don't know which Elements were newly added/removed, but that should be okay in this case.
      // It would only impact the search state, which is unlikely to exist yet at this point.
      dispatchWrapper({
        type: 'HANDLE_STORE_MUTATION',
        payload: [[], new Map()],
      });
    }

    store.addListener('mutated', handleStoreMutated);

    return () => store.removeListener('mutated', handleStoreMutated);
  }, [dispatchWrapper, initialRevision, store]);

  return (
    <TreeStateContext.Provider value={state}>
      <TreeDispatcherContext.Provider value={dispatchWrapper}>
        {children}
      </TreeDispatcherContext.Provider>
    </TreeStateContext.Provider>
  );
}
function recursivelySearchTree(
  store: Store,
  elementID: number,
  regExp: RegExp,
  searchResults: Array<number>
): void {
  const { children, displayName } = ((store.getElementByID(
    elementID
  ): any): Element);
  if (displayName !== null) {
    if (regExp.test(displayName)) {
      searchResults.push(elementID);
    }
  }
  children.forEach(childID =>
    recursivelySearchTree(store, childID, regExp, searchResults)
  );
}

function getNearestResult(
  searchResults: Array<number>,
  selectedElementID: number | null
) {
  const result = searchResults.findIndex(
    value => value >= ((selectedElementID: any): number)
  );

  return result === -1 ? 0 : result;
}

export { TreeDispatcherContext, TreeStateContext, TreeContextController };
