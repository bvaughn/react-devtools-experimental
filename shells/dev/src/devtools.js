/** @flow */

import { createElement } from 'react';
// $FlowFixMe Flow does not yet know about createRoot()
import { unstable_createRoot as createRoot, flushSync } from 'react-dom';
import Bridge from 'src/bridge';
import { installHook } from 'src/hook';
import { initDevTools } from 'src/devtools';
import Store from 'src/devtools/store';
import DevTools from 'src/devtools/views/DevTools';

const iframe = ((document.getElementById('target'): any): HTMLIFrameElement);
const container = ((document.getElementById('devtools'): any): HTMLElement);

let isTestAppMounted = true;

const mountButton = ((document.getElementById(
  'mountButton'
): any): HTMLButtonElement);
mountButton.addEventListener('click', function() {
  if (isTestAppMounted) {
    if (typeof window.unmountTestApp === 'function') {
      window.unmountTestApp();
      mountButton.innerText = 'Mount test app';
      isTestAppMounted = false;
    }
  } else {
    if (typeof window.mountTestApp === 'function') {
      window.mountTestApp();
      mountButton.innerText = 'Unmount test app';
      isTestAppMounted = true;
    }
  }
});

// It's safe to close over `iframe.contentWindow` as it does not change with iframe reload.
// But we'll have to `installHook` every time the iframe loads empty.
const { contentWindow } = iframe;

let bridge = null;
let store = null;
let root = null;
let render = null;

// Unlike the extension, here we only have one port, which is the `iframe.contentWindow`, which we do not recreate.
// So we ensure that we stop listening as soon as the bridge is shutdown to prevent the old bridge from receiving
// the messages sent to the newly created one.
const listeners = [];
let bridgeId = null;

function initBridgeAndStore() {
  const thisBridgeId = (bridgeId = Math.random());
  bridge = new Bridge({
    listen(fn) {
      // Prevent the subscriptions via the older bridge to the newer bridge messages.
      if (bridgeId !== thisBridgeId) {
        return;
      }
      const listener = ({ data }) => {
        fn(data);
      };
      listeners.push(listener);
      contentWindow.parent.addEventListener('message', listener);
    },
    send(event: string, payload: any, transferable?: Array<any>) {
      // Prevent the message from being sent via the older bridge to the newer bridge.
      if (bridgeId !== thisBridgeId) {
        return;
      }
      contentWindow.postMessage({ event, payload }, '*', transferable);
    },
  });

  bridge.addListener('reloadAppForShowNativeElements', () => {
    // Prevent the events from the older bridge to be handled when the newer bridge is active.
    if (bridgeId !== thisBridgeId) {
      return;
    }
    // Use the same approach to reload the iframe window as the browser extension uses.
    contentWindow.eval('window.location.reload();');
  });

  store = new Store(bridge, {
    supportsCaptureScreenshots: true,
    supportsShowingNativeElements: true,
  });

  // Initialize the backend only once the Store has been initialized.
  // Otherwise the Store may miss important initial tree op codes.
  inject('./build/backend.js');

  root = createRoot(container);

  render = () => {
    if (!root || !bridge || !store) {
      throw new Error(
        'Missing root, bridge, or store inside render. Should never happen.'
      );
    }
    root.render(
      createElement(DevTools, {
        bridge,
        browserName: 'Chrome',
        browserTheme: 'light',
        showTabBar: true,
        store,
      })
    );
  };

  render();
}

// Shutdown bridge and re-initialize DevTools panel when a new page is loaded.
function onNavigated() {
  if (!bridge) {
    throw new Error('Missing bridge inside onNavigated. Should never happen.');
  }

  bridge.send('shutdown');

  // Remove all listeners of this bridge to prevent stale messages from being handled after shutdown.
  listeners.forEach(fn => {
    window.removeEventListener('message', fn);
  });
  listeners.splice(0);

  // It's easiest to recreate the DevTools panel (to clean up potential stale state).
  // We can revisit this in the future as a small optimization.
  flushSync(() => {
    if (!root) {
      throw new Error(
        'Missing root inside flushSync callback. Should never happen.'
      );
    }

    root.unmount();
  });
}

function onEmptyAppIframe() {
  // Ensure unloaded here, more reliable than iframe 'beforeunload'.
  if (bridge) {
    onNavigated();
  }

  installHook(contentWindow);

  inject('./build/app.js', () => {
    initDevTools({
      connect(cb) {
        initBridgeAndStore();
        cb(bridge);
      },

      onReload(reloadFn) {
        iframe.onload = reloadFn;
      },
    });
  });
}

function inject(sourcePath, callback) {
  // `iframe.contentDocument` changes on iframe reload, so we do not close over it.
  const script = iframe.contentDocument.createElement('script');
  script.onload = callback;
  script.src = sourcePath;

  ((iframe.contentDocument.body: any): HTMLBodyElement).appendChild(script);
}

onEmptyAppIframe();
// 'DOMContentLoaded' does not trigger when iframe loads empty, but 'load' does.
iframe.addEventListener('load', onEmptyAppIframe);
