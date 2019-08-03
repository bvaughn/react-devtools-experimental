/** @flow */

import React, { forwardRef } from 'react';
import Bridge from 'src/bridge';
import Store from 'src/devtools/store';
import DevTools from 'src/devtools/views/DevTools';

import type { FrontendBridge } from 'src/bridge';
import type { Props } from 'src/devtools/views/DevTools';

let bridge: FrontendBridge = ((null: any): FrontendBridge);
let store: Store = ((null: any): Store);

export default function initFrontend(
  frame: HTMLIFrameElement,
  overrideProps?: Object
): React$AbstractComponent<Props, mixed> {
  if (bridge === null) {
    const { contentWindow } = frame;

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

  return forwardRef<Props, mixed>((props, ref) => (
    <DevTools ref={ref} bridge={bridge} store={store} {...props} />
  ));
}
