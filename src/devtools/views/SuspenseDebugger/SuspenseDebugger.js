// @flow

import React, { useEffect, useCallback, useContext, useReducer } from 'react';
import { createPortal } from 'react-dom';
import {
  SUSPENSE_STATE_PRIMARY,
  SUSPENSE_STATE_FALLBACK,
  SUSPENSE_STATE_FORCED_FALLBACK,
} from '../../../constants';
import { BridgeContext, StoreContext } from '../context';
import { ElementTypeSuspense } from '../../types';

export type Props = {|
  portalContainer?: Element,
|};

export default function SuspenseDebugger({ portalContainer }: Props) {
  const children = (
    <div style={{ overflow: 'scroll' }}>
      <Debugger />
    </div>
  );

  return portalContainer != null
    ? createPortal(children, portalContainer)
    : children;
}

function Debugger() {
  const store = useContext(StoreContext);
  const bridge = useContext(BridgeContext);
  const [, forceUpdate] = useReducer(x => x + 1, 0);

  useEffect(() => {
    store.addListener('mutated', forceUpdate);
    return () => store.removeListener('mutated', forceUpdate);
  }, [store]);

  function buildTree(cursor, element) {
    element.children.forEach(childID => {
      const child = store._idToElement.get(childID);
      if (child === undefined) {
        return;
      }
      if (child.type === ElementTypeSuspense) {
        buildTree(stepIn(cursor, child), child);
      } else {
        buildTree(cursor, child);
      }
    });
  }

  function stepIn(cursor, element) {
    let owner = store._idToElement.get(element.ownerID) || null;
    if (
      owner &&
      owner.displayName &&
      owner.displayName.indexOf('Placeholder') !== -1
    ) {
      // Go deeper.
      owner = store._idToElement.get(owner.ownerID) || null;
    }
    let node = { nested: [], element, owner };
    cursor.nested.push(node);
    return node;
  }

  let tree = { nested: [], element: null, owner: null };
  store._roots.forEach(id => {
    const element = store._idToElement.get(id);
    if (element !== undefined) {
      buildTree(tree, element);
    }
  });

  const handleMouseLeave = () => {
    bridge.send('clearHighlightedElementInDOM');
  };

  return (
    <ul onMouseLeave={handleMouseLeave}>
      {tree.nested.map(node => (
        <SuspenseNode
          key={node.element.id}
          element={node.element}
          nested={node.nested}
          owner={node.owner}
          bridge={bridge}
          store={store}
          node={node}
        />
      ))}
    </ul>
  );
}

function SuspenseNode({ bridge, store, element, nested, owner }) {
  const suspenseState = store.getSuspenseState(element.id);
  const rendererID = store.getRendererIDForElement(element.id);

  // TODO: also disable if toggling Suspense isn't supported by the renderer.
  // Or maybe even hide the whole tab then.
  const isDisabled = suspenseState === SUSPENSE_STATE_FALLBACK;

  const handleMouseEnter = useCallback(() => {
    bridge.send('highlightElementInDOM', {
      displayName: element.displayName,
      hideAfterTimeout: false,
      id: element.id,
      rendererID,
      scrollIntoView: false,
    });
  }, [bridge, element, rendererID]);

  return (
    <li style={{ userSelect: 'none' }} onMouseEnter={handleMouseEnter}>
      <label>
        <input
          type="checkbox"
          disabled={isDisabled}
          checked={suspenseState === SUSPENSE_STATE_PRIMARY}
          onChange={e => {
            bridge.send('overrideSuspense', {
              id: element.id,
              rendererID,
              forceFallback: suspenseState !== SUSPENSE_STATE_FORCED_FALLBACK,
            });
            bridge.send('highlightElementInDOM', {
              displayName: element.displayName,
              hideAfterTimeout: false,
              id: element.id,
              rendererID,
              scrollIntoView: false,
            });
          }}
        />
        <span style={{ opacity: isDisabled ? 0.5 : 1 }}>
          {element.displayName}{' '}
          {owner && owner.displayName && `(from ${owner.displayName})`}
        </span>
      </label>
      {nested.length > 0 && (
        <ul>
          {nested.map(child => (
            <SuspenseNode
              key={child.element.id}
              element={child.element}
              nested={child.nested}
              owner={child.owner}
              bridge={bridge}
              store={store}
              node={child}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
