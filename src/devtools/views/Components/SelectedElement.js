// @flow

import React, { useCallback, useContext } from 'react';
import { TreeDispatcherContext, TreeStateContext } from './TreeContext';
import { BridgeContext, StoreContext } from '../context';
import Button from '../Button';
import ButtonIcon from '../ButtonIcon';
import HooksTree from './HooksTree';
import InspectedElementTree from './InspectedElementTree';
import { InspectedElementContext } from './InspectedElementContext';
import ViewElementSourceContext from './ViewElementSourceContext';
import styles from './SelectedElement.css';
import {
  ElementTypeClass,
  ElementTypeForwardRef,
  ElementTypeFunction,
  ElementTypeMemo,
  ElementTypeSuspense,
  ElementTypeHostComponent,
  ElementTypeHostText,
} from '../../types';

import type { Element, InspectedElement } from './types';

export type Props = {||};

export default function SelectedElement(_: Props) {
  const { inspectedElementID } = useContext(TreeStateContext);
  const viewElementSource = useContext(ViewElementSourceContext);
  const bridge = useContext(BridgeContext);
  const store = useContext(StoreContext);

  const { read } = useContext(InspectedElementContext);

  const element =
    inspectedElementID !== null
      ? store.getElementByID(inspectedElementID)
      : null;

  const inspectedElement =
    inspectedElementID != null ? read(inspectedElementID) : null;

  const highlightElement = useCallback(() => {
    if (element !== null && inspectedElementID !== null) {
      const rendererID = store.getRendererIDForElement(inspectedElementID);
      if (rendererID !== null) {
        bridge.send('highlightElementInDOM', {
          displayName: element.displayName,
          hideAfterTimeout: true,
          id: inspectedElementID,
          openNativeElementsPanel: true,
          rendererID,
          scrollIntoView: true,
        });
      }
    }
  }, [bridge, element, inspectedElementID, store]);

  const logElement = useCallback(() => {
    if (inspectedElementID !== null) {
      const rendererID = store.getRendererIDForElement(inspectedElementID);
      if (rendererID !== null) {
        bridge.send('logElementToConsole', {
          id: inspectedElementID,
          rendererID,
        });
      }
    }
  }, [bridge, inspectedElementID, store]);

  const viewSource = useCallback(() => {
    if (viewElementSource != null && inspectedElementID !== null) {
      viewElementSource(inspectedElementID);
    }
  }, [inspectedElementID, viewElementSource]);

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

  const { type } = element;

  return (
    <div className={styles.SelectedElement}>
      <div className={styles.TitleRow}>
        <div className={styles.SelectedComponentName}>
          <div
            className={
              type === ElementTypeHostComponent
                ? styles.HostComponent
                : type === ElementTypeHostText
                ? styles.HostText
                : styles.Component
            }
            title={element.displayName}
          >
            {element.displayName}
          </div>
        </div>

        <Button
          className={styles.IconButton}
          onClick={highlightElement}
          title="Inspect the matching DOM element"
        >
          <ButtonIcon type="view-dom" />
        </Button>
        <Button
          className={styles.IconButton}
          onClick={logElement}
          title="Log this component data to the console"
        >
          <ButtonIcon type="log-data" />
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

  const { ownerStack } = useContext(TreeStateContext);
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
      {type === ElementTypeHostText ? (
        <InspectedElementTree
          label="text"
          data={props}
          overrideValueFn={null}
          showWhenEmpty
        />
      ) : (
        <InspectedElementTree
          label="props"
          data={props}
          overrideValueFn={overridePropsFn}
          showWhenEmpty
        />
      )}
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
          <div className={styles.OwnersHeader}>rendered by</div>
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
  const dispatch = useContext(TreeDispatcherContext);

  const handleClick = useCallback(
    () =>
      dispatch({
        type: 'SELECT_ELEMENT_BY_ID',
        payload: id,
      }),
    [dispatch, id]
  );

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
