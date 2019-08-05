/** @flow */

import Agent from 'src/backend/agent';
import Bridge from 'src/bridge';
import { initBackend } from 'src/backend';
import setupNativeStyleEditor from 'src/backend/NativeStyleEditor/setupNativeStyleEditor';

export default function() {
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
