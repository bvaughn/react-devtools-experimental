/** @flow */

import { installHook } from 'src/hook';
import { getSavedComponentFilters, getAppendComponentStack } from 'src/utils';

export default function(targetWindow: window = window) {
  // The renderer interface can't read saved component filters directly,
  // because they are stored in localStorage within the context of the extension.
  // Instead it relies on the extension to pass filters through.
  targetWindow.__REACT_DEVTOOLS_COMPONENT_FILTERS__ = getSavedComponentFilters();
  targetWindow.__REACT_DEVTOOLS_APPEND_COMPONENT_STACK__ = getAppendComponentStack();

  installHook(targetWindow);
}
