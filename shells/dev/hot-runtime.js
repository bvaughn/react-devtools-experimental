/* eslint-disable */

let contextCache = new Map();
let currentContextIndex = 0;

const createContext = require('react').createContext;
require('react').createContext = function(defaultValue) {
  if (currentModuleID !== null) {
    let id = `${currentModuleID}:${currentContextIndex}`;
    let ctx;
    if (contextCache.has(id)) {
      ctx = contextCache.get(id);
    } else {
      ctx = createContext(defaultValue);
      contextCache.set(id, ctx);
    }
    currentContextIndex++;
    return ctx;
  }
  return createContext(defaultValue);
};

let currentModuleID = null;
window.__setCurrentModule__ = function(m) {
  currentModuleID = m.id;
  currentContextIndex = 0;
};

let familiesByID = new Map();
let familiesByType = new WeakMap();
let allTypes = new WeakSet();

let newFamilies = new Set();
let updatedFamilies = new Set();
let signaturesByType = new Map();
let scheduleHotUpdate;
let lastRoot;

if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    inject() {},
    onCommitFiberRoot: () => {},
    onCommitFiberUnmount: () => {},
  };
}
function patchHook(method, intercept) {
  let oldFn = window.__REACT_DEVTOOLS_GLOBAL_HOOK__[method];
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__[method] = (...args) => {
    intercept(...args);
    return oldFn(...args);
  };
}

patchHook('inject', injected => {
  scheduleHotUpdate = injected.scheduleHotUpdate;
});

patchHook('onCommitFiberRoot', (id, root) => {
  // TODO: properly track roots
  lastRoot = root;
});

const REACT_PROVIDER_TYPE = Symbol.for('react.provider');
const REACT_CONTEXT_TYPE = Symbol.for('react.context');
const REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref');
const REACT_MEMO_TYPE = Symbol.for('react.memo');

function unwrapHotReloadableType(type) {
  switch (typeof type) {
    case 'string':
      return null;
    case 'function':
      if (type.prototype && type.prototype.isReactComponent) {
        return null;
      }
      return type;
    case 'object':
      switch (type.$$typeof) {
        case REACT_MEMO_TYPE:
          return unwrapHotReloadableType(type.type);
        case REACT_FORWARD_REF_TYPE:
          // TODO: this doesn't really work if it doesn't get identity
          return type.render;
        default:
          return null;
      }
    default:
      return null;
  }
}

window.__shouldAccept__ = function(exports) {
  for (let key in exports) {
    const val = exports[key];
    if (
      val &&
      (val.$$typeof === REACT_PROVIDER_TYPE ||
        val.$$typeof === REACT_CONTEXT_TYPE)
    ) {
      // Context is fine too
      continue;
    }
    const type = val && unwrapHotReloadableType(val);
    if (type && type.name && /^use[A-Z]+/.test(type.name)) {
      // Propagate Hooks
      return false;
    }
    if (type) {
      if (allTypes.has(type)) {
        // This one is definitely ok
        continue;
      }
    }
    return false;
  }
  // All exports are component-ish.
  return true;
};

window.__signature__ = function(type, signature) {
  // TODO: deps
  signaturesByType.set(type, signature);
  return type;
};

window.__register__ = function(type, id) {
  allTypes.add(type);
  if (familiesByType.has(type)) {
    return type;
  }
  let family = familiesByID.get(id);
  let isNew = false;
  if (family === undefined) {
    isNew = true;
    family = { currentType: type, currentSignature: null };
    familiesByID.set(id, family);
  }
  const prevType = family.currentType;
  if (isNew) {
    // The first time a type is registered, we don't need
    // any special reconciliation logic. So we won't add it to the map.
    // Instead, this will happen the firt time it is edited.
    newFamilies.add(family);
  } else {
    family.currentType = type;
    // Point both previous and next types to this family.
    familiesByType.set(prevType, family);
    familiesByType.set(type, family);
    updatedFamilies.add(family);
  }

  if (typeof type === 'object' && type !== null) {
    switch (type.$$typeof) {
      case Symbol.for('react.forward_ref'):
        window.__register__(type.render, id + '$render');
        break;
      case Symbol.for('react.memo'):
        window.__register__(type.type, id + '$type');
        break;
      default:
        break;
    }
  }
  scheduleFlush();
  return type;
};

let waitHandle = null;
let isFirstTime = true;

function scheduleFlush() {
  if (!waitHandle) {
    waitHandle = setTimeout(() => {
      waitHandle = null;
      currentModuleID = null;

      // Fill in the signatures.
      for (let family of newFamilies) {
        const latestSignature =
          signaturesByType.get(family.currentType) || null;
        family.currentSignature = latestSignature;
      }

      if (isFirstTime) {
        isFirstTime = false;
        return;
      }

      // Now that all registration and signatures are collected,
      // find which registrations changed their signatures since last time.
      const staleFamilies = new Set();
      for (let family of updatedFamilies) {
        const latestSignature =
          signaturesByType.get(family.currentType) || null;
        if (family.currentSignature !== latestSignature) {
          family.currentSignature = latestSignature;
          staleFamilies.add(family);
        }
      }

      let { hostNodesForVisualFeedback } = scheduleHotUpdate({
        root: lastRoot,
        familiesByType,
        updatedFamilies,
        staleFamilies,
      });
      highlightNodes(hostNodesForVisualFeedback);

      newFamilies = new Set();
      updatedFamilies = new Set();
      signaturesByType = new Map();

      // TODO: this is weird because we want to ignore spurious multiple updates
      // like when you save with typo in render, fix typo, and then get two versions.
    }, 30);
  }
}

function highlightNodes(nodes) {
  let rects = nodes.map(node => node.getBoundingClientRect());
  rects = coalesceRects(rects);
  let canvas = ensureLayer();

  canvas.width = window.innerWidth * window.devicePixelRatio;
  canvas.height = window.innerHeight * window.devicePixelRatio;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(255, 255, 255, 0)';
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.shadowColor = 'black';
  ctx.shadowBlur = 16;

  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    const div = document.createElement('div');
    if (rect.width > 0 && rect.height > 0) {
      for (let i = 0; i < 2; i++) {
        roundRect(
          ctx,
          rect.left + 2,
          rect.top + 2,
          rect.width - 4,
          rect.height - 4,
          4
        );
        ctx.stroke();
      }
      clearRoundRect(
        ctx,
        rect.left + 1,
        rect.top + 1,
        rect.width - 2,
        rect.height - 2,
        4
      );
    }
  }

  canvas.style.transition = 'none';
  canvas.style.opacity = 1;

  setTimeout(() => {
    canvas.style.transition = 'opacity 0.2s ease-in';
    canvas.style.opacity = 0;
  }, 200);
}

function clearRoundRect(ctx, x, y, width, height, radius) {
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, x, y, width, height, radius, false, true);
  ctx.clip();
  ctx.clearRect(x, y, width, height);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const layerStyles = {
  position: 'fixed',
  top: '0',
  left: '0',
  width: '100%',
  height: '100%',
  border: 'none',
  pointerEvents: 'none',
  zIndex: 2147483647,
};

let l;
function ensureLayer() {
  if (l) {
    return l;
  }
  // TODO: iframe
  l = document.createElement('canvas');
  Object.assign(l.style, layerStyles);
  document.body.appendChild(l);
  return l;
}

// TODO: this is extremely naïve and slow
function coalesceRects(rects) {
  function rnd(r) {
    return {
      top: Math.round(r.top),
      left: Math.round(r.left),
      bottom: Math.round(r.bottom),
      right: Math.round(r.right),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  }
  let result = [];
  rects.forEach(rect => {
    rect = rnd(rect);
    let matchAbove = result.find(
      r =>
        r.left === rect.left &&
        r.right === rect.right &&
        Math.abs(r.bottom - rect.top) < 10
    );
    let matchLeft = result.find(
      r =>
        r.top === rect.top &&
        r.bottom === rect.bottom &&
        Math.abs(r.right - rect.left) < 10
    );
    if (matchAbove) {
      matchAbove.bottom = rect.bottom;
      matchAbove.height += rect.height;
    } else if (matchLeft) {
      matchLeft.right = rect.right;
      matchLeft.width += rect.width;
    } else {
      result.push(rect);
    }
  });
  return result;
}
