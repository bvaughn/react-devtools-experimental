# `react-devtools-inline`

React DevTools implementation for embedding within an `<iframe>`.

This is a low-level package. If you're looking for the standalone DevTools app, **use the `react-devtools` package instead.**

## API

## `react-devtools-inline/initBackend`

This method lets the backend know that the frontend is ready. It should not be called until after `initFrontend()` has been run, else the frontend might miss important tree-initialiation events.

```js
import initBackend from 'react-devtools-inline/initBackend';

initBackend();
```

## `react-devtools-inline/initFrontend`

Configures the DevTools interface to listen to a target `iframe`. This method returns a React element that can be rendered directly.

```js
import initFrontend from 'react-devtools-inline/initFrontend';

export default function DevTools({ frameID }) {
  const [ui, setUI] = useState(null);

  useEffect(() => {
    if (ui === null) {
      const frame = document.getElementById(frameID);

      const optionalProps = {
        // Custom props go here...
      };

      setUI(
        initFrontend(frame, optionalProps)
      );
    }
  }, [ui]);

  return ui;
}
```

## `react-devtools-inline/installHook`

Installs the global hook on the window. This hook is how React and DevTools communicate.

This method must be called before React is loaded! (This means before any `import` or `require` statements.)

```js
import installHook from 'react-devtools-inline/installHook';

installHook();
```