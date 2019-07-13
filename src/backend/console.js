// @flow

import type { ReactRenderer } from './types';

let disabled: boolean = false;

export function disable(): void {
  disabled = true;
}

export function enable(): void {
  disabled = false;
}

export function patch({ debugCurrentFrame }: ReactRenderer): void {
  for (let method in console) {
    const originalMethod = console[method];
    const appendComponentStack =
      debugCurrentFrame != null &&
      (method === 'error' || method === 'warn' || method === 'trace');
    try {
      // $FlowFixMe property error|warn is not writable.
      console[method] = (...args) => {
        if (disabled) return;
        if (appendComponentStack) {
          const componentStack = debugCurrentFrame.getStackAddendum();
          if (componentStack) {
            args.push(componentStack);
          }
        }
        originalMethod(...args);
      };
    } catch (error) {}
  }
}
