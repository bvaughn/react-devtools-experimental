// @flow

import Agent from 'src/backend/agent';
import Bridge from 'src/bridge';
import { installHook } from 'src/hook';
import { initBackend } from 'src/backend';
import { __DEBUG__ } from 'src/constants';
import setupNativeStyleEditor from 'src/backend/NativeStyleEditor/setupNativeStyleEditor';
import { getDefaultComponentFilters } from 'src/utils';

import type { ComponentFilter } from 'src/types';
import type { DevToolsHook } from 'src/backend/types';
import type { ResolveNativeStyle } from 'src/backend/NativeStyleEditor/setupNativeStyleEditor';

type ConnectOptions = {
  host?: string,
  nativeStyleEditorValidAttributes?: $ReadOnlyArray<string>,
  port?: number,
  resolveRNStyle?: ResolveNativeStyle,
  isAppActive?: () => boolean,
  websocket?: ?WebSocket,
};

installHook(window);

const hook: DevToolsHook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;

let savedComponentFilters: Array<ComponentFilter> = getDefaultComponentFilters();

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
    nativeStyleEditorValidAttributes,
    port = 8097,
    websocket,
    resolveRNStyle = null,
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
      'selectElement',
      ({ id, rendererID }: {| id: number, rendererID: number |}) => {
        const renderer = agent.rendererInterfaces[rendererID];
        if (renderer != null) {
          // Send event for RN to highlight.
          const nodes: ?Array<HTMLElement> = renderer.findNativeNodesForFiberID(
            id
          );
          if (nodes != null && nodes[0] != null) {
            agent.emit('showNativeHighlight', nodes[0]);
          }
        }
      }
    );
    bridge.addListener(
      'updateComponentFilters',
      (componentFilters: Array<ComponentFilter>) => {
        // Save filter changes in memory, in case DevTools is reloaded.
        // In that case, the renderer will already be using the updated values.
        // We'll lose these in between backend reloads but that can't be helped.
        savedComponentFilters = componentFilters;
      }
    );

    // The renderer interface doesn't read saved component filters directly,
    // because they are generally stored in localStorage within the context of the extension.
    // Because of this it relies on the extension to pass filters.
    // In the case of the standalone DevTools being used with a website,
    // saved filters are injected along with the backend script tag so we shouldn't override them here.
    // This injection strategy doesn't work for React Native though.
    // Ideally the backend would save the filters itself, but RN doesn't provide a sync storage solution.
    // So for now we just fall back to using the default filters...
    if (window.__REACT_DEVTOOLS_COMPONENT_FILTERS__ == null) {
      bridge.send('overrideComponentFilters', savedComponentFilters);
    }

    // TODO (npm-packages) Warn if "isBackendStorageAPISupported"
    const agent = new Agent(bridge);
    agent.addListener('shutdown', () => {
      // If we received 'shutdown' from `agent`, we assume the `bridge` is already shutting down,
      // and that caused the 'shutdown' event on the `agent`, so we don't need to call `bridge.shutdown()` here.
      hook.emit('shutdown');
    });

    initBackend(hook, agent, window);

    // Setup React Native style editor if the environment supports it.
    if (resolveRNStyle != null || hook.resolveRNStyle != null) {
      setupNativeStyleEditor(
        bridge,
        agent,
        ((resolveRNStyle || hook.resolveRNStyle: any): ResolveNativeStyle),
        nativeStyleEditorValidAttributes ||
          hook.nativeStyleEditorValidAttributes ||
          null
      );
    } else {
      // Otherwise listen to detect if the environment later supports it.
      // For example, Flipper does not eagerly inject these values.
      // Instead it relies on the React Native Inspector to lazily inject them.
      let lazyResolveRNStyle;
      let lazyNativeStyleEditorValidAttributes;

      const initAfterTick = () => {
        if (bridge !== null) {
          setupNativeStyleEditor(
            bridge,
            agent,
            lazyResolveRNStyle,
            lazyNativeStyleEditorValidAttributes
          );
        }
      };

      Object.defineProperty(
        hook,
        'resolveRNStyle',
        ({
          enumerable: false,
          get() {
            return lazyResolveRNStyle;
          },
          set(value) {
            lazyResolveRNStyle = value;
            initAfterTick();
          },
        }: Object)
      );
      Object.defineProperty(
        hook,
        'nativeStyleEditorValidAttributes',
        ({
          enumerable: false,
          get() {
            return lazyNativeStyleEditorValidAttributes;
          },
          set(value) {
            lazyNativeStyleEditorValidAttributes = value;
            initAfterTick();
          },
        }: Object)
      );
    }
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
