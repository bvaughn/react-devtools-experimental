// @flow

/**
 * This is mirror from
 * https://github.com/facebook/react-native/blob/master/Libraries/Inspector/resolveBoxStyle.js
 *
 * Resolve a style property into it's component parts, e.g.
 *
 * resolveBoxStyle('margin', {margin: 5, marginBottom: 10})
 * -> {top: 5, left: 5, right: 5, bottom: 10}
 */
export default function resolveBoxStyle(
  prefix: string,
  style: Object
): ?Object {
  const res = {};
  const subs = ['top', 'left', 'bottom', 'right'];
  let set = false;
  subs.forEach(sub => {
    res[sub] = style[prefix] || 0;
  });
  if (style[prefix]) {
    set = true;
  }
  if (style[prefix + 'Vertical']) {
    res.top = res.bottom = style[prefix + 'Vertical'];
    set = true;
  }
  if (style[prefix + 'Horizontal']) {
    res.left = res.right = style[prefix + 'Horizontal'];
    set = true;
  }
  subs.forEach(sub => {
    const val = style[prefix + capFirst(sub)];
    if (val) {
      res[sub] = val;
      set = true;
    }
  });
  if (!set) {
    return null;
  }
  return res;
}

function capFirst(text: string): string {
  return text[0].toUpperCase() + text.slice(1);
}
