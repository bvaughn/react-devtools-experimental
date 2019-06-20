// @flow

import Agent from 'src/backend/agent';
import Bridge from 'src/bridge';
import { installHook } from 'src/hook';
import { initBackend } from 'src/backend';

import type { DevToolsHook } from 'src/backend/types';

// TODO (npm-packages) setup RN style inspector

type ConnectOptions = {
  host?: string,
  port?: number,
  resolveRNStyle?: (style: number) => ?Object,
  isAppActive?: () => boolean,
  websocket?: ?WebSocket,
};

installHook(window);

const hook: DevToolsHook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;

if (window.document) {
  // This shell is universal, and might be used inside a web app.
  hook.on('react-devtools', agent => {
    // TODO (npm-packages) setup highlighter plug-in
  });
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
    const bridge: Bridge = new Bridge({
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
          ws.send(JSON.stringify({ event, payload }));
        } else {
          bridge.emit('shutdown');
        }
      },
    });

    const agent = new Agent(bridge);
    agent.addListener('shutdown', () => {
      // If we received 'shutdown' from `agent`, we assume the `bridge` is already shutting down,
      // and that caused the 'shutdown' event on the `agent`, so we don't need to call `bridge.shutdown()` here.
      hook.emit('shutdown');
    });

    initBackend(hook, agent, window);
  };

  function handleClose() {
    scheduleRetry();
  }

  function handleFailed() {}

  function handleMessage(event) {
    let data;
    try {
      if (typeof event.data === 'string') {
        data = JSON.parse(event.data);
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
        throw error;
      }
    });
  }
}
