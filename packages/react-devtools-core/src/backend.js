// @flow

import Agent from 'src/backend/agent';
import Bridge from 'src/bridge';
import { installHook } from 'src/hook';
import { initBackend } from 'src/backend';
import { __DEBUG__ } from 'src/constants';
import { getSavedComponentFilters, saveComponentFilters } from 'src/utils';

import type { ComponentFilter } from 'src/types';
import type { DevToolsHook } from 'src/backend/types';

// TODO (npm-packages) setup RN style inspector

type ConnectOptions = {
  host?: string,
  port?: number,
  resolveRNStyle?: (style: number) => ?Object,
  isAppActive?: () => boolean,
  websocket?: ?WebSocket,
};

// The renderer interface doesn't read saved component filters directly,
// because they are generally stored in localStorage within the context of the extension.
// Because of this it relies on the extension to pass filters through.
// This particular shell also stores filters within the page,
// but we still need to set the __REACT_DEVTOOLS_COMPONENT_FILTERS__ global for the renderer.
let componentFilters: Array<ComponentFilter> = getSavedComponentFilters();
window.__REACT_DEVTOOLS_COMPONENT_FILTERS__ = componentFilters;

installHook(window);

const hook: DevToolsHook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;

if (window.document) {
  // This shell is universal, and might be used inside a web app.
  hook.on('react-devtools', agent => {
    // TODO (npm-packages) setup highlighter plug-in
  });
}

function debug(methodName: string, ...args) {
  if (__DEBUG__) {
    console.log(
      `%c[core/backend] %c${methodName}`,
      'color: teal; font-weight: bold;',
      'font-weight: bold;',
      ...args
    );
  }
}

export function connectToDevTools(options: ?ConnectOptions) {
  const {
    host = 'localhost',
    port = 8097,
    websocket,
    // TODO (npm-packages) resolveRNStyle = null,
    isAppActive = () => true,
  } = options || {};

  let retryTimeoutID: TimeoutID | null = null;

  function scheduleRetry() {
    if (retryTimeoutID === null) {
      // Two seconds because RN had issues with quick retries.
      retryTimeoutID = setTimeout(() => connectToDevTools(options), 2000);
    }
  }

  if (!isAppActive()) {
    // If the app is in background, maybe retry later.
    // Don't actually attempt to connect until we're in foreground.
    scheduleRetry();
    return;
  }

  let bridge: Bridge | null = null;

  const messageListeners = [];
  const uri = 'ws://' + host + ':' + port;

  // If existing websocket is passed, use it.
  // This is necessary to support our custom integrations.
  // See D6251744.
  const ws = websocket ? websocket : new window.WebSocket(uri);
  ws.onclose = handleClose;
  ws.onerror = handleFailed;
  ws.onmessage = handleMessage;
  ws.onopen = function() {
    bridge = new Bridge({
      listen(fn) {
        messageListeners.push(fn);
        return () => {
          const index = messageListeners.indexOf(fn);
          if (index >= 0) {
            messageListeners.splice(index, 1);
          }
        };
      },
      send(event: string, payload: any, transferable?: Array<any>) {
        if (ws.readyState === ws.OPEN) {
          if (__DEBUG__) {
            debug('wall.send()', event, payload);
          }

          ws.send(JSON.stringify({ event, payload }));
        } else {
          if (__DEBUG__) {
            debug(
              'wall.send()',
              'Shutting down bridge because of closed WebSocket connection'
            );
          }

          if (bridge !== null) {
            bridge.emit('shutdown');
          }

          scheduleRetry();
        }
      },
    });
    bridge.addListener(
      'updateComponentFilters',
      (newComponentFilters: Array<ComponentFilter>) => {
        componentFilters = newComponentFilters;
        console.log('updateComponentFilters()', componentFilters);
        saveComponentFilters(componentFilters);
      }
    );

    // Component filters are saved so they can be applied after a reload
    // (without waiting on the frontend to asynchronously send them).
    // However since the backend loaded as a script within a page, filters are saved per-domain.
    // This is different than the browser extension in a significant way.
    // In order for the frontend and backend to stay in sync then,
    // we need to notify the frontend to override its saved filters,
    // and instead use the ones that the backend/renderer is using,
    // otherwise filter preferences and applied filters will mismatch.
    bridge.send('overrideComponentFilters', componentFilters);

    const agent = new Agent(bridge);
    agent.addListener('shutdown', () => {
      // If we received 'shutdown' from `agent`, we assume the `bridge` is already shutting down,
      // and that caused the 'shutdown' event on the `agent`, so we don't need to call `bridge.shutdown()` here.
      hook.emit('shutdown');
    });

    initBackend(hook, agent, window);
  };

  function handleClose() {
    if (__DEBUG__) {
      debug('WebSocket.onclose');
    }

    if (bridge !== null) {
      bridge.emit('shutdown');
    }

    scheduleRetry();
  }

  function handleFailed() {
    if (__DEBUG__) {
      debug('WebSocket.onerror');
    }

    scheduleRetry();
  }

  function handleMessage(event) {
    let data;
    try {
      if (typeof event.data === 'string') {
        data = JSON.parse(event.data);
        if (__DEBUG__) {
          debug('WebSocket.onmessage', data);
        }
      } else {
        throw Error();
      }
    } catch (e) {
      console.error(
        '[React DevTools] Failed to parse JSON: ' + String(event.data)
      );
      return;
    }
    messageListeners.forEach(fn => {
      try {
        fn(data);
      } catch (error) {
        // jsc doesn't play so well with tracebacks that go into eval'd code,
        // so the stack trace here will stop at the `eval()` call. Getting the
        // message that caused the error is the best we can do for now.
        console.log('[React DevTools] Error calling listener', data);
        console.log('error:', error);
        throw error;
      }
    });
  }
}
