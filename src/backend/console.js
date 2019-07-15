// @flow

import type { Fiber, ReactRenderer } from './types';

let disabled: boolean = false;

export function disable(): void {
  disabled = true;
}

export function enable(): void {
  disabled = false;
}

const FRAME_REGEX = /\n {4}in /;

export function patch(
  targetConsole: Object,
  { describeComponentFrame, getComponentName, getCurrentFiber }: ReactRenderer
): void {
  for (let method in targetConsole) {
    const appendComponentStack =
      typeof describeComponentFrame === 'function' &&
      typeof getComponentName === 'function' &&
      typeof getCurrentFiber === 'function' &&
      (method === 'error' || method === 'warn' || method === 'trace');

    const originalMethod = targetConsole[method];
    const overrideMethod = (...args) => {
      if (disabled) return;

      if (appendComponentStack) {
        // If we are ever called with a string that already has a component stack, e.g. a React error/warning,
        // don't append a second stack.
        const alreadyHasComponentStack =
          args.length > 1 && FRAME_REGEX.exec(args[1]);

        if (!alreadyHasComponentStack) {
          // $FlowFixMe We know getCurrentFiber() is a function if appendComponentStack is true.
          let current: ?Fiber = getCurrentFiber();
          let ownerStack: string = '';
          while (current != null) {
            const name = getComponentName(current.type);
            const owner = current._debugOwner;
            const ownerName =
              owner != null ? getComponentName(owner.type) : null;

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
