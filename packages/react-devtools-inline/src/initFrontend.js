/** @flow */

import React from 'react';
import Bridge from 'src/bridge';
import Store from 'src/devtools/store';
import DevTools from 'src/devtools/views/DevTools';

let bridge = null;
let store = null;

export default function initFrontend(
  frame: HTMLIFrameElement,
  overrideProps?: Object
): React$Node {
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

  return <DevTools bridge={bridge} store={store} {...overrideProps} />;
}
