# `react-devtools-inline`

React DevTools implementation for embedding within a browser-based IDE (e.g. [CodeSandbox](https://codesandbox.io/), [StackBlitz](https://stackblitz.com/)).

This is a low-level package. If you're looking for the standalone DevTools app, **use the `react-devtools` package instead.**

## Usage

This package exports two entry points: a frontend (to be run in the main `window`) and a backend (to be installed and run within an `iframe`<sup>1</sup>).

The frontend and backend can be initialized in any order, but **the backend must not be activated until after the frontend has been initialized**. Because of this, the simplest sequence is:

1. Frontend (DevTools interface) initialized in the main `window`.
1. Backend initialized in an `iframe`.
1. Backend activated.

<sup>1</sup> Sandboxed iframes are supported.

## API

## `react-devtools-inline/backend`

* **`initialize`** -
Installs the global hook on the window. This hook is how React and DevTools communicate. **This method must be called before React is loaded!** (This means before any `import` or `require` statements.)
* **`activate`** -
Lets the backend know when the frontend is ready. It should not be called until after the frontend has been initialized, else the frontend might miss important tree-initialiation events.

```js
import { activate, initialize } from 'react-devtools-inline/backend';

// Call this before importing React (or any other packages that might import React)
initialize();

// Call this only once the frontend has been initialized
activate();
```

## `react-devtools-inline/frontend`

* **`initialize`** -
Configures the DevTools interface to listen to a target `iframe`. This method returns a React element that can be rendered directly.

```js
import { initialize } from 'react-devtools-inline/frontend';

// This should be the iframe the backend hook has been installed in.
const iframe = document.getElementById(frameID);

// This returns a React component that can be rendered into your app.
// <DevTools {...props} />
const DevTools = initialize(iframe);
```
