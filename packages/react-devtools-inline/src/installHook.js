/** @flow */

import { installHook } from 'src/hook';
import { getSavedComponentFilters, getAppendComponentStack } from 'src/utils';

export default function() {
  // The renderer interface can't read saved component filters directly,
  // because they are stored in localStorage within the context of the extension.
  // Instead it relies on the extension to pass filters through.
  window.__REACT_DEVTOOLS_COMPONENT_FILTERS__ = getSavedComponentFilters();
  window.__REACT_DEVTOOLS_APPEND_COMPONENT_STACK__ = getAppendComponentStack();

  installHook(window);
}
