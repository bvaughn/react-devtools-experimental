// @flow

import React, { useCallback, useContext, useEffect, useState, useRef } from 'react';
import Button from '../Button';
import Icon from '../Icon';
import { TreeContext } from './TreeContext';
import { BridgeContext, StoreContext } from '../context';
import { hydrate } from 'src/hydration';

import type { Element } from './types';

import styles from './OwnersStack.css';

export default function OwnerStack({ onSearchClick }) {
  const { selectedElementID } = useContext(TreeContext);
  const bridge = useContext(BridgeContext);
  const store = useContext(StoreContext);
  const inspectedElement = useInspectedElement(selectedElementID);
  if (!inspectedElement) {
    return null
  }
  const {owners} = inspectedElement;
  if (!owners) {
    return null
  }

  const elements = owners.reverse().map(({id}, index) => (
    <ElementView key={id} id={id} index={index} />
  ));

  return (
    <div className={styles.OwnerStack}>
      <div onClick={onSearchClick}>
        <Icon className={styles.InputIcon} type="search" /> 
      </div>
      <div className={styles.VRule} />
      {elements}
    </div>
  );
}

type Props = {
  id: number,
  index: number,
};

function ElementView({ id, index }: Props) {
  const { ownerStackIndex, selectOwner } = useContext(TreeContext);
  const store = useContext(StoreContext);
  const { displayName } = ((store.getElementByID(id): any): Element);

  const isSelected = ownerStackIndex === index;

  const handleClick = useCallback(() => {
    if (!isSelected) {
      selectOwner(id);
    }
  }, [id, isSelected, selectOwner]);

  return (
    <button
      className={isSelected ? styles.FocusedComponent : styles.Component}
      onClick={handleClick}
    >
      {displayName}
    </button>
  );
}


function useInspectedElement(id: number | null): InspectedElement | null {
  const idRef = useRef(id);
  const bridge = useContext(BridgeContext);
  const store = useContext(StoreContext);

  const [inspectedElement, setInspectedElement] = useState(null);

  useEffect(() => {
    // Track the current selected element ID.
    // We ignore any backend updates about previously selected elements.
    idRef.current = id;

    // Hide previous/stale insepected element to avoid temporarily showing the wrong values.
    setInspectedElement(null);

    // A null id indicates that there's nothing currently selected in the tree.
    if (id === null) {
      return () => {};
    }

    const rendererID = store.getRendererIDForElement(id) || null;

    // Update the $r variable.
    bridge.send('selectElement', { id, rendererID });

    // Update props, state, and context in the side panel.
    const sendBridgeRequest = () => {
      bridge.send('inspectElement', { id, rendererID });
    };

    let timeoutID = null;

    const onInspectedElement = (inspectedElement: InspectedElement) => {
      if (!inspectedElement || inspectedElement.id !== idRef.current) {
        // Ignore bridge updates about previously selected elements.
        return;
      }

      setInspectedElement(inspectedElement);

      // Ask for an update in a second.
      // Make sure we only ask once though.
      clearTimeout(((timeoutID: any): TimeoutID));
      setTimeout(sendBridgeRequest, 1000);
    };

    bridge.addListener('inspectedElement', onInspectedElement);

    sendBridgeRequest();

    return () => {
      bridge.removeListener('inspectedElement', onInspectedElement);

      if (timeoutID !== null) {
        clearTimeout(timeoutID);
      }
    };
  }, [bridge, id, idRef, store]);

  return inspectedElement;
}

function hydrateHelper(dehydratedData: DehydratedData | null): Object | null {
  if (dehydratedData !== null) {
    return hydrate(dehydratedData.data, dehydratedData.cleaned);
  } else {
    return null;
  }
}
