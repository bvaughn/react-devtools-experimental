// @flow

import { createElement } from 'react';
import {
  // $FlowFixMe Flow does not yet know about createRoot()
  unstable_createRoot as createRoot,
} from 'react-dom';
import Bridge from 'src/bridge';
import Store from 'src/devtools/store';
import { Server } from 'ws';
import { readFileSync } from 'fs';
import { join } from 'path';
import { installHook } from 'src/hook';
import DevTools from 'src/devtools/views/DevTools';
import launchEditor from './launchEditor';

installHook(window);

export type StatusListener = (message: string) => void;

let node: HTMLElement = ((null: any): HTMLElement);
let projectRoots: Array<string> = [];
let statusListener: StatusListener = (message: string) => {};

function setContentDOMNode(value: HTMLElement) {
  node = value;
  return DevtoolsUI;
}

function setProjectRoots(value: Array<string>) {
  projectRoots = value;
}

function setStatusListener(value: StatusListener) {
  statusListener = value;
  return DevtoolsUI;
}

let bridge: Bridge | null = null;
let store: Store | null = null;
let root;

const log = (...args) => console.log('[React DevTools]', ...args);
log.warn = (...args) => console.warn('[React DevTools]', ...args);
log.error = (...args) => console.error('[React DevTools]', ...args);

function reload() {
  if (root !== null) {
    root.unmount();
    root = null;
  }

  node.innerHTML = '';

  setTimeout(() => {
    root = createRoot(node);
    root.render(
      createElement(DevTools, {
        bridge: ((bridge: any): Bridge),
        showTabBar: true,
        store: ((store: any): Store),
        viewElementSource: source => {
          // TODO (npm-packages) This isn't right
          launchEditor(source.fileName, source.lineNumber, projectRoots);
        },
      })
    );
  }, 100);
}

function onDisconnected() {
  if (root !== null) {
    root.unmount();
    root = null;
  }
  node.innerHTML =
    '<div id="waiting"><h2>Waiting for React to connect…</h2></div>';
}

function onError({ code, message }) {
  if (root !== null) {
    root.unmount();
    root = null;
  }

  if (code === 'EADDRINUSE') {
    node.innerHTML = `<div id="waiting"><h2>Another instance of DevTools is running</h2></div>`;
  } else {
    node.innerHTML = `<div id="waiting"><h2>Unknown error (${message})</h2></div>`;
  }
}

function initialize(socket: WebSocket) {
  const listeners = [];
  socket.onmessage = event => {
    const data = JSON.parse(((event.data: any): string));
    listeners.forEach(fn => fn(data));
  };

  bridge = new Bridge({
    listen(fn) {
      listeners.push(fn);
    },
    send(data) {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(data));
      }
    },
  });
  ((bridge: any): Bridge).addListener('shutdown', () => {
    socket.close();
  });

  store = new Store(bridge);

  log('Connected');
  reload();
}

let startServerTimeoutID: TimeoutID | null = null;

function connectToSocket(socket: WebSocket) {
  socket.onerror = err => {
    onDisconnected();
    log.error('Error with websocket connection', err);
  };
  socket.onclose = () => {
    onDisconnected();
    log('Connection to RN closed');
  };
  initialize(socket);

  return {
    close: function() {
      onDisconnected();
    },
  };
}

function startServer(port?: number = 8097) {
  const httpServer = require('http').createServer();
  const server = new Server({ server: httpServer });
  let connected: WebSocket | null = null;
  server.on('connection', (socket: WebSocket) => {
    if (connected !== null) {
      connected.close();
      log.warn(
        'Only one connection allowed at a time.',
        'Closing the previous connection'
      );
    }
    connected = socket;
    socket.onerror = error => {
      connected = null;
      onDisconnected();
      log.error('Error with websocket connection', error);
    };
    socket.onclose = () => {
      connected = null;
      onDisconnected();
      log('Connection to RN closed');
    };
    initialize(socket);
  });

  server.on('error', event => {
    onError(event);
    log.error('Failed to start the DevTools server', event);
    startServerTimeoutID = setTimeout(() => startServer(port), 1000);
  });

  httpServer.on('request', (req, res) => {
    // Serve a file that immediately sets up the connection.
    const backendFile = readFileSync(join(__dirname, 'backend.js'));
    res.end(
      backendFile.toString() + '\n;ReactDevToolsBackend.connectToDevTools();'
    );
  });

  httpServer.on('error', event => {
    onError(event);
    statusListener('Failed to start the server.');
    startServerTimeoutID = setTimeout(() => startServer(port), 1000);
  });

  httpServer.listen(port, () => {
    statusListener('The server is listening on the port ' + port + '.');
  });

  return {
    close: function() {
      connected = null;
      onDisconnected();
      clearTimeout(startServerTimeoutID);
      server.close();
      httpServer.close();
    },
  };
}

const DevtoolsUI = {
  setContentDOMNode,
  setProjectRoots,
  setStatusListener,
  connectToSocket,
  startServer,
};

export default DevtoolsUI;
