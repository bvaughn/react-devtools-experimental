// @flow

import type { Fiber, ReactRenderer } from './types';

let disabled: boolean = false;

export function disable(): void {
  disabled = true;
}

export function enable(): void {
  disabled = false;
}

export function patch(
  { getCurrentFiber }: ReactRenderer,
  getDisplayNameForFiber: (fiber: Fiber) => string | null
): void {
  for (let method in console) {
    const originalMethod = console[method];
    const appendComponentStack =
      typeof getCurrentFiber === 'function' &&
      (method === 'error' || method === 'warn' || method === 'trace');
    try {
      // $FlowFixMe property error|warn is not writable.
      console[method] = (...args) => {
        if (disabled) return;

        if (appendComponentStack) {
          // $FlowFixMe We know getCurrentFiber() is a function if appendComponentStack is true.
          let current: ?Fiber = getCurrentFiber();
          let ownerStack: string = '';
          while (current != null) {
            const name = getDisplayNameForFiber(current);
            const owner = current._debugOwner;
            const ownerName =
              owner != null ? getDisplayNameForFiber(owner) : null;

            ownerStack += describeComponentFrame(
              name,
              current._debugSource,
              ownerName
            );

            current = owner;
          }

          if (ownerStack !== '') {
            args.push(ownerStack);
          }
        }
        originalMethod(...args);
      };
    } catch (error) {}
  }
}

const BEFORE_SLASH_RE = /^(.*)[\\/]/;

// Copied from React repo:
// https://github.com/facebook/react/blob/master/packages/shared/describeComponentFrame.js
function describeComponentFrame(
  name: null | string,
  source: any,
  ownerName: null | string
) {
  let sourceInfo = '';
  if (source) {
    let path = source.fileName;
    let fileName = path.replace(BEFORE_SLASH_RE, '');
    if (__DEV__) {
      // In DEV, include code for a common special case:
      // prefer "folder/index.js" instead of just "index.js".
      if (/^index\./.test(fileName)) {
        const match = path.match(BEFORE_SLASH_RE);
        if (match) {
          const pathBeforeSlash = match[1];
          if (pathBeforeSlash) {
            const folderName = pathBeforeSlash.replace(BEFORE_SLASH_RE, '');
            fileName = folderName + '/' + fileName;
          }
        }
      }
    }
    sourceInfo = ' (at ' + fileName + ':' + source.lineNumber + ')';
  } else if (ownerName) {
    sourceInfo = ' (created by ' + ownerName + ')';
  }
  return '\n    in ' + (name || 'Unknown') + sourceInfo;
}
