/** @flow */

import Agent from 'src/backend/agent';
import Bridge from 'src/bridge';
import { initBackend } from 'src/backend';
import { installHook } from 'src/hook';
import { getSavedComponentFilters, getAppendComponentStack } from 'src/utils';
import setupNativeStyleEditor from 'src/backend/NativeStyleEditor/setupNativeStyleEditor';

export function activate(contentWindow: window): void {
  const bridge = new Bridge({
    listen(fn) {
      const listener = event => {
        fn(event.data);
      };
      contentWindow.addEventListener('message', listener);
      return () => {
        contentWindow.removeEventListener('message', listener);
      };
    },
    send(event: string, payload: any, transferable?: Array<any>) {
      contentWindow.parent.postMessage({ event, payload }, '*', transferable);
    },
  });

  const agent = new Agent(bridge);

  const hook = contentWindow.__REACT_DEVTOOLS_GLOBAL_HOOK__;

  initBackend(hook, agent, contentWindow);

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

export function initialize(contentWindow: window): void {
  // The renderer interface can't read saved component filters directly,
  // because they are stored in localStorage within the context of the extension.
  // Instead it relies on the extension to pass filters through.
  contentWindow.__REACT_DEVTOOLS_COMPONENT_FILTERS__ = getSavedComponentFilters();
  contentWindow.__REACT_DEVTOOLS_APPEND_COMPONENT_STACK__ = getAppendComponentStack();

  installHook(contentWindow);
}
