/** @flow */

import Agent from 'src/backend/agent';
import Bridge from 'src/bridge';
import { initBackend } from 'src/backend';
import { installHook } from 'src/hook';
import setupNativeStyleEditor from 'src/backend/NativeStyleEditor/setupNativeStyleEditor';

function startActivation(contentWindow: window) {
  const { parent } = contentWindow;

  const listener = ({ data }) => {
    switch (data.type) {
      case 'saved-filters':
        contentWindow.removeEventListener('message', listener);

        const { appendComponentStack, componentFilters } = data;

        contentWindow.__REACT_DEVTOOLS_APPEND_COMPONENT_STACK__ = appendComponentStack;
        contentWindow.__REACT_DEVTOOLS_COMPONENT_FILTERS__ = componentFilters;

        // TRICKY
        // The backend entry point may be required in the context of an iframe or the parent window.
        // If it's required within the parent window, store the saved values on it as well,
        // since the injected renderer interface will read from window.
        // Technically we don't need to store them on the contentWindow in this case,
        // but it doesn't really hurt anything to store them there too.
        if (contentWindow !== window) {
          window.__REACT_DEVTOOLS_APPEND_COMPONENT_STACK__ = appendComponentStack;
          window.__REACT_DEVTOOLS_COMPONENT_FILTERS__ = componentFilters;
        }

        finishActivation(contentWindow);
        break;
      default:
        break;
    }
  };

  contentWindow.addEventListener('message', listener);

  // The backend may be unable to read saved component filters directly,
  // because they are stored in localStorage within the context of the extension (on the frnotend).
  // It relies on the extension to pass filters through.
  // Because we might be in a sandboxed iframe, we have to ask for them by way of postMessage().
  parent.postMessage({ type: 'get-saved-filters' }, '*');
}

function finishActivation(contentWindow: window) {
  const { parent } = contentWindow;

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
      parent.postMessage({ event, payload }, '*', transferable);
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

export function activate(contentWindow: window): void {
  startActivation(contentWindow);
}

export function initialize(contentWindow: window): void {
  installHook(contentWindow);
}
