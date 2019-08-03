/** @flow */

import Agent from 'src/backend/agent';
import Bridge from 'src/bridge';
import { initBackend } from 'src/backend';
import { installHook } from 'src/hook';
import { getSavedComponentFilters, getAppendComponentStack } from 'src/utils';
import setupNativeStyleEditor from 'src/backend/NativeStyleEditor/setupNativeStyleEditor';

export function activate() {
  const bridge = new Bridge({
    listen(fn) {
      const listener = event => {
        fn(event.data);
      };
      window.addEventListener('message', listener);
      return () => {
        window.removeEventListener('message', listener);
      };
    },
    send(event: string, payload: any, transferable?: Array<any>) {
      window.parent.postMessage({ event, payload }, '*', transferable);
    },
  });

  const agent = new Agent(bridge);

  const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;

  initBackend(hook, agent, window);

  // Setup React Native style editor if a renderer like react-native-web has injected it.
  if (!!hook.resolveRNStyle) {
    setupNativeStyleEditor(
      bridge,
      agent,
      hook.resolveRNStyle,
      hook.nativeStyleEditorValidAttributes
    );
  }
}

export function initialize(targetWindow: window = window) {
  // The renderer interface can't read saved component filters directly,
  // because they are stored in localStorage within the context of the extension.
  // Instead it relies on the extension to pass filters through.
  targetWindow.__REACT_DEVTOOLS_COMPONENT_FILTERS__ = getSavedComponentFilters();
  targetWindow.__REACT_DEVTOOLS_APPEND_COMPONENT_STACK__ = getAppendComponentStack();

  installHook(targetWindow);
}
