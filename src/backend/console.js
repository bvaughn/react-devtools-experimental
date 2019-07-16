// @flow

import { getInternalReactConstants } from './renderer';
import describeComponentFrame from './describeComponentFrame';

import type { Fiber, ReactRenderer } from './types';

let isDisabled: boolean = false;
let hasPatched: boolean = false;

export function disable(): void {
  isDisabled = true;
}

export function enable(): void {
  isDisabled = false;
}

const FRAME_REGEX = /\n {4}in /;

export function patch(
  targetConsole: Object,
  { getCurrentFiber, findFiberByHostInstance, version }: ReactRenderer
): void {
  if (hasPatched) {
    return;
  }

  if (typeof findFiberByHostInstance !== 'function') {
    return;
  }

  const { getDisplayNameForFiber } = getInternalReactConstants(version);

  hasPatched = true;

  for (let method in targetConsole) {
    const appendComponentStack =
      typeof getCurrentFiber === 'function' &&
      (method === 'error' || method === 'warn' || method === 'trace');

    const originalMethod = targetConsole[method];
    const overrideMethod = (...args) => {
      if (isDisabled) return;

      if (appendComponentStack) {
        // If we are ever called with a string that already has a component stack, e.g. a React error/warning,
        // don't append a second stack.
        const alreadyHasComponentStack =
          args.length > 0 && FRAME_REGEX.exec(args[args.length - 1]);

        if (!alreadyHasComponentStack) {
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
      }

      originalMethod(...args);
    };

    try {
      // $FlowFixMe property error|warn is not writable.
      targetConsole[method] = overrideMethod;
    } catch (error) {}
  }
}
