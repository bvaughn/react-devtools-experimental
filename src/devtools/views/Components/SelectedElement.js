// @flow

import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useReducer,
} from 'react';
import { TreeContext } from './TreeContext';
import { BridgeContext, StoreContext } from '../context';
import Button from '../Button';
import ButtonIcon from '../ButtonIcon';
import HooksTree from './HooksTree';
import InspectedElementTree from './InspectedElementTree';
import { hydrate } from 'src/hydration';
import styles from './SelectedElement.css';
import {
  ElementTypeClass,
  ElementTypeForwardRef,
  ElementTypeFunction,
  ElementTypeMemo,
  ElementTypeSuspense,
} from '../../types';

import type { InspectedElement } from './types';
import type { DehydratedData, Element } from './types';

export type Props = {||};

class Cache {
  constructor(bridge, store) {
    this.bridge = bridge;
    this.store = store;
    this.promises = new Map();
    this.resolves = new Map();
    this.results = new Map();
    this.bridge.addListener('inspectedElement', this.onInspectedElement);
  }

  onInspectedElement = value => {
    const { id } = value;
    const rendererID = this.store.getRendererIDForElement(id);

    value.context = hydrateHelper(value.context);
    value.hooks = hydrateHelper(value.hooks);
    value.props = hydrateHelper(value.props);
    value.state = hydrateHelper(value.state);

    const resolve = this.resolves.get(id);
    this.promises.delete(id);
    this.resolves.delete(id);
    this.results.set(id, {
      timestamp: Date.now(),
      value,
    });
    resolve();
  };

  read(id) {
    if (id === null) {
      return null;
    }
    if (this.results.has(id)) {
      const result = this.results.get(id);
      // TODO: this probably doesn't make sense?
      // Also it doesn't evict items we aren't reading.
      if (Date.now() - result.timestamp > 5000) {
        this.results.delete(id);
      } else {
        return result.value;
      }
    }
    if (this.promises.has(id)) {
      throw this.promises.get(id);
    }
    this.load(id);
    throw this.promises.get(id);
  }

  invalidate(id) {
    this.results.delete(id);
  }

  load(id) {
    this.promises.set(
      id,
      new Promise(resolve => {
        this.resolves.set(id, resolve);
      })
    );
    const rendererID = this.store.getRendererIDForElement(id);
    // TODO: is this the right time to send both?
    this.bridge.send('selectElement', { id, rendererID });
    this.bridge.send('inspectElement', { id, rendererID });
  }
}

let cache;

export default function SelectedElement(_: Props) {
  const {
    selectedElementID: realSelectedElementID,
    viewElementSource,
  } = useContext(TreeContext);
  const bridge = useContext(BridgeContext);
  const store = useContext(StoreContext);

  if (!cache) {
    // TODO: not a singleton
    cache = new Cache(bridge, store);
  }

  const [selectedElementID, setSelectedElementID] = useState(
    realSelectedElementID
  );
  // TODO: this is shady and also makes quick navigation janky.
  // What am I doing wrong?
  useEffect(() => {
    requestIdleCallback(() => {
      setSelectedElementID(realSelectedElementID);
    });
  });

  // TODO: this is gross?
  const [__, forceUpdate] = useReducer(x => x + 1, 0);
  useEffect(() => {
    const id = setInterval(() => {
      cache.invalidate(selectedElementID);
      forceUpdate();
    }, 1000);
    return () => clearInterval(id);
  }, [selectedElementID]);

  const element =
    selectedElementID !== null ? store.getElementByID(selectedElementID) : null;

  const inspectedElement = cache.read(selectedElementID);

  // const inspectedElement = useInspectedElement(selectedElementID);

  const highlightElement = useCallback(() => {
    if (element !== null && selectedElementID !== null) {
      const rendererID =
        store.getRendererIDForElement(selectedElementID) || null;
      if (rendererID !== null) {
        bridge.send('highlightElementInDOM', {
          displayName: element.displayName,
          id: selectedElementID,
          rendererID,
        });
      }
    }
  }, [bridge, element, selectedElementID, store]);

  const viewSource = useCallback(() => {
    if (viewElementSource != null && selectedElementID !== null) {
      viewElementSource(selectedElementID);
    }
  }, [selectedElementID, viewElementSource]);

  if (element === null) {
    return (
      <div className={styles.SelectedElement}>
        <div className={styles.TitleRow} />
      </div>
    );
  }

  const canViewSource =
    inspectedElement &&
    inspectedElement.canViewSource &&
    viewElementSource !== null;

  return (
    <div className={styles.SelectedElement}>
      <div className={styles.TitleRow}>
        <div className={styles.SelectedComponentName}>
          <div className={styles.Component} title={element.displayName}>
            {element.displayName}
          </div>
        </div>

        <Button
          className={styles.IconButton}
          onClick={highlightElement}
          title="Highlight this element in the page"
        >
          <ButtonIcon type="view-dom" />
        </Button>
        <Button
          className={styles.IconButton}
          disabled={!canViewSource}
          onClick={viewSource}
          title="View source for this element"
        >
          <ButtonIcon type="view-source" />
        </Button>
      </div>

      {inspectedElement === null && (
        <div className={styles.Loading}>Loading...</div>
      )}

      {inspectedElement !== null && (
        <InspectedElementView
          element={element}
          inspectedElement={inspectedElement}
        />
      )}
    </div>
  );
}

type InspectedElementViewProps = {|
  element: Element,
  inspectedElement: InspectedElement,
|};

const IS_SUSPENDED = 'Suspended';

function InspectedElementView({
  element,
  inspectedElement,
}: InspectedElementViewProps) {
  const { id, type } = element;
  const {
    canEditFunctionProps,
    canEditHooks,
    canToggleSuspense,
    context,
    hooks,
    owners,
    props,
    state,
  } = inspectedElement;

  const { ownerStack } = useContext(TreeContext);
  const bridge = useContext(BridgeContext);
  const store = useContext(StoreContext);

  let overrideContextFn = null;
  let overridePropsFn = null;
  let overrideStateFn = null;
  let overrideSuspenseFn = null;
  if (type === ElementTypeClass) {
    overrideContextFn = (path: Array<string | number>, value: any) => {
      const rendererID = store.getRendererIDForElement(id);
      bridge.send('overrideContext', { id, path, rendererID, value });
    };
    overridePropsFn = (path: Array<string | number>, value: any) => {
      const rendererID = store.getRendererIDForElement(id);
      bridge.send('overrideProps', { id, path, rendererID, value });
    };
    overrideStateFn = (path: Array<string | number>, value: any) => {
      const rendererID = store.getRendererIDForElement(id);
      bridge.send('overrideState', { id, path, rendererID, value });
    };
  } else if (
    (type === ElementTypeFunction ||
      type === ElementTypeMemo ||
      type === ElementTypeForwardRef) &&
    canEditFunctionProps
  ) {
    overridePropsFn = (path: Array<string | number>, value: any) => {
      const rendererID = store.getRendererIDForElement(id);
      bridge.send('overrideProps', { id, path, rendererID, value });
    };
  } else if (type === ElementTypeSuspense && canToggleSuspense) {
    overrideSuspenseFn = (path: Array<string | number>, value: boolean) => {
      if (path.length !== 1 && path !== IS_SUSPENDED) {
        throw new Error('Unexpected path.');
      }
      const rendererID = store.getRendererIDForElement(id);
      bridge.send('overrideSuspense', { id, rendererID, forceFallback: value });
    };
  }

  return (
    <div className={styles.InspectedElement}>
      <InspectedElementTree
        label="props"
        data={props}
        overrideValueFn={overridePropsFn}
        showWhenEmpty
      />
      {type === ElementTypeSuspense ? (
        <InspectedElementTree
          label="suspense"
          data={{
            [IS_SUSPENDED]: state !== null,
          }}
          overrideValueFn={overrideSuspenseFn}
        />
      ) : (
        <InspectedElementTree
          label="state"
          data={state}
          overrideValueFn={overrideStateFn}
        />
      )}
      <HooksTree canEditHooks={canEditHooks} hooks={hooks} id={id} />
      <InspectedElementTree
        label="context"
        data={context}
        overrideValueFn={overrideContextFn}
      />

      {ownerStack.length === 0 && owners !== null && owners.length > 0 && (
        <div className={styles.Owners}>
          <div className={styles.OwnersHeader}>owner stack</div>
          {owners.map(owner => (
            <OwnerView
              key={owner.id}
              displayName={owner.displayName}
              id={owner.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OwnerView({ displayName, id }: { displayName: string, id: number }) {
  const { selectElementByID } = useContext(TreeContext);

  const handleClick = useCallback(() => selectElementByID(id), [
    id,
    selectElementByID,
  ]);

  return (
    <button
      key={id}
      className={styles.Owner}
      onClick={handleClick}
      title={displayName}
    >
      {displayName}
    </button>
  );
}

function hydrateHelper(dehydratedData: DehydratedData | null): Object | null {
  if (dehydratedData !== null) {
    return hydrate(dehydratedData.data, dehydratedData.cleaned);
  } else {
    return null;
  }
}

// function useInspectedElement(id: number | null): InspectedElement | null {
//   const idRef = useRef(id);
//   const bridge = useContext(BridgeContext);
//   const store = useContext(StoreContext);

//   const [inspectedElement, setInspectedElement] = useState(null);

//   useEffect(() => {
//     // Track the current selected element ID.
//     // We ignore any backend updates about previously selected elements.
//     idRef.current = id;

//     // Hide previous/stale insepected element to avoid temporarily showing the wrong values.
//     setInspectedElement(null);

//     // A null id indicates that there's nothing currently selected in the tree.
//     if (id === null) {
//       return () => {};
//     }

//     const rendererID = store.getRendererIDForElement(id) || null;

//     // Update the $r variable.
//     bridge.send('selectElement', { id, rendererID });

//     // Update props, state, and context in the side panel.
//     const sendBridgeRequest = () => {
//       bridge.send('inspectElement', { id, rendererID });
//     };

//     let timeoutID = null;

//     const onInspectedElement = (inspectedElement: InspectedElement) => {
//       if (!inspectedElement || inspectedElement.id !== idRef.current) {
//         // Ignore bridge updates about previously selected elements.
//         return;
//       }

//       if (inspectedElement !== null) {
//         inspectedElement.context = hydrateHelper(inspectedElement.context);
//         inspectedElement.hooks = hydrateHelper(inspectedElement.hooks);
//         inspectedElement.props = hydrateHelper(inspectedElement.props);
//         inspectedElement.state = hydrateHelper(inspectedElement.state);
//       }

//       setInspectedElement(inspectedElement);

//       // Ask for an update in a second.
//       // Make sure we only ask once though.
//       clearTimeout(((timeoutID: any): TimeoutID));
//       setTimeout(sendBridgeRequest, 1000);
//     };

//     bridge.addListener('inspectedElement', onInspectedElement);

//     sendBridgeRequest();

//     return () => {
//       bridge.removeListener('inspectedElement', onInspectedElement);

//       if (timeoutID !== null) {
//         clearTimeout(timeoutID);
//       }
//     };
//   }, [bridge, id, idRef, store]);

//   return inspectedElement;
// }
