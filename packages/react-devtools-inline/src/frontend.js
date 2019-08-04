/** @flow */

import React, { forwardRef } from 'react';
import Bridge from 'src/bridge';
import Store from 'src/devtools/store';
import DevTools from 'src/devtools/views/DevTools';
import { getSavedComponentFilters, getAppendComponentStack } from 'src/utils';

import type { FrontendBridge } from 'src/bridge';
import type { Props } from 'src/devtools/views/DevTools';

let bridge: FrontendBridge = ((null: any): FrontendBridge);
let store: Store = ((null: any): Store);

export function initialize(
  contentWindow: window
): React$AbstractComponent<Props, mixed> {
  const listener = ({ data, origin, source }) => {
    switch (data.type) {
      case 'get-saved-filters':
        window.removeEventListener('message', listener);

        // The renderer interface can't read saved component filters directly,
        // because they are stored in localStorage within the context of the extension.
        // Instead it relies on the extension to pass filters through.
        contentWindow.postMessage(
          {
            type: 'saved-filters',
            appendComponentStack: getAppendComponentStack(),
            componentFilters: getSavedComponentFilters(),
          },
          '*'
        );
        break;
      default:
        break;
    }
  };

  window.addEventListener('message', listener);

  if (bridge === null) {
    bridge = new Bridge({
      listen(fn) {
        const listener = ({ data }) => {
          fn(data);
        };
        window.addEventListener('message', listener);
        return () => {
          window.removeEventListener('message', listener);
        };
      },
      send(event: string, payload: any, transferable?: Array<any>) {
        contentWindow.postMessage({ event, payload }, '*', transferable);
      },
    });
  }

  if (store === null) {
    store = new Store(bridge);
  }

  const ForwardRef = forwardRef<Props, mixed>((props, ref) => (
    <DevTools ref={ref} bridge={bridge} store={store} {...props} />
  ));
  ForwardRef.displayName = 'DevTools';

  return ForwardRef;
}
