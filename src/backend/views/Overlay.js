// @flow

import assign from 'object-assign';

type Rect = {
  bottom: number,
  height: number,
  left: number,
  right: number,
  top: number,
  width: number,
};

// Note that the Overlay components are not affected by the active Theme,
// because they highlight elements in the main Chrome window (outside of devtools).
// The colors below were chosen to roughly match those used by Chrome devtools.

class OverlayRect {
  node: HTMLElement;
  border: HTMLElement;
  padding: HTMLElement;
  content: HTMLElement;

  constructor(doc, container) {
    this.node = doc.createElement('div');
    this.border = doc.createElement('div');
    this.padding = doc.createElement('div');
    this.content = doc.createElement('div');

    this.border.style.borderColor = overlayStyles.border;
    this.padding.style.borderColor = overlayStyles.padding;
    this.content.style.backgroundColor = overlayStyles.background;

    assign(this.node.style, {
      borderColor: overlayStyles.margin,
      pointerEvents: 'none',
      position: 'fixed',
    });

    this.node.style.zIndex = '10000000';

    this.node.appendChild(this.border);
    this.border.appendChild(this.padding);
    this.padding.appendChild(this.content);
    container.appendChild(this.node);
  }

  remove() {
    if (this.node.parentNode) {
      this.node.parentNode.removeChild(this.node);
    }
  }

  update(box, dims) {
    boxWrap(dims, 'margin', this.node);
    boxWrap(dims, 'border', this.border);
    boxWrap(dims, 'padding', this.padding);

    assign(this.content.style, {
      height:
        box.height -
        dims.borderTop -
        dims.borderBottom -
        dims.paddingTop -
        dims.paddingBottom +
        'px',
      width:
        box.width -
        dims.borderLeft -
        dims.borderRight -
        dims.paddingLeft -
        dims.paddingRight +
        'px',
    });

    assign(this.node.style, {
      top: box.top - dims.marginTop + 'px',
      left: box.left - dims.marginLeft + 'px',
    });
  }
}

const tipArrowSize = 12;
const tipBackgroundColor = '#333740';
const tipArrowColor = tipBackgroundColor; // A separate variable helps debugging just the tooltip.

// https://css-tricks.com/snippets/css/css-triangle/
// http://apps.eky.hk/css-triangle-generator/
const NORTH_TIP_ARROW_WIDTH = tipArrowSize * Math.sqrt(2);
const NORTH_TIP_ARROW_HEIGHT = (tipArrowSize * Math.sqrt(2)) / 2;
const NORTH_TIP_ARROW_STYLES = {
  // A "north" CSS triangle arrow 90deg-45deg-45deg: ▲ which we will rotate around the center of its wide side.
  // The 90deg corner will point to the element.
  borderTop: `0 solid transparent`,
  borderRight: `${NORTH_TIP_ARROW_HEIGHT}px solid transparent`,
  borderBottom: `${NORTH_TIP_ARROW_HEIGHT}px solid ${tipArrowColor}`,
  borderLeft: `${NORTH_TIP_ARROW_HEIGHT}px solid transparent`,
  transformOrigin: '0 0',
  transform: `translate(${-NORTH_TIP_ARROW_HEIGHT}px, ${-NORTH_TIP_ARROW_HEIGHT +
    1}px)`,
};
const NORTHWEST_TIP_ARROW_SIZE = tipArrowSize;
const NORTHWEST_TIP_ARROW_STYLES = {
  // A "northwest" CSS triangle arrow 90deg-45deg-45deg: ◤ which we will rotate around its 90deg tip.
  // One of the 45deg corners will point to the element.
  borderTop: `${NORTHWEST_TIP_ARROW_SIZE / 2}px solid ${tipArrowColor}`,
  borderRight: `${NORTHWEST_TIP_ARROW_SIZE / 2}px solid transparent`,
  borderBottom: `${NORTHWEST_TIP_ARROW_SIZE / 2}px solid transparent`,
  borderLeft: `${NORTHWEST_TIP_ARROW_SIZE / 2}px solid ${tipArrowColor}`,
  transformOrigin: '0 0',
  transform: `none`,
};

class OverlayTip {
  tip: HTMLElement;
  tipArrow: HTMLElement;
  tipArrowSymbol: HTMLElement;
  nameSpan: HTMLElement;
  dimSpan: HTMLElement;

  constructor(doc, container) {
    this.tip = doc.createElement('div');
    assign(this.tip.style, {
      display: 'flex',
      flexFlow: 'row nowrap',
      backgroundColor: tipBackgroundColor,
      borderRadius: '2px',
      fontFamily:
        '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace',
      fontWeight: 'bold',
      padding: '3px 5px',
      pointerEvents: 'none',
      position: 'fixed',
      fontSize: '12px',
      lineHeight: '18px',
      whiteSpace: 'nowrap',
      zIndex: '10000000',
    });

    this.tipArrow = doc.createElement('span');

    this.tipArrowSymbol = doc.createElement('span');
    this.tipArrow.appendChild(this.tipArrowSymbol);
    assign(this.tipArrowSymbol.style, {
      display: 'block',
      width: 0,
      height: 0,
    });
    this.tip.appendChild(this.tipArrow);
    assign(this.tipArrow.style, {
      display: 'none',
      width: 0,
      height: 0,
      transformOrigin: '0 0',
      transform: 'none',
      position: 'absolute',
      zIndex: '1',
      overflow: 'visible',
    });

    this.nameSpan = doc.createElement('span');
    this.tip.appendChild(this.nameSpan);
    assign(this.nameSpan.style, {
      color: '#ee78e6',
      borderRight: '1px solid #aaaaaa',
      paddingRight: '0.5rem',
      marginRight: '0.5rem',
    });

    this.dimSpan = doc.createElement('span');
    this.tip.appendChild(this.dimSpan);
    assign(this.dimSpan.style, {
      color: '#d7d7d7',
    });

    container.appendChild(this.tip);
  }

  remove() {
    if (this.tip.parentNode) {
      this.tip.parentNode.removeChild(this.tip);
    }
  }

  updateText(name, width, height) {
    this.nameSpan.textContent = name;
    this.dimSpan.textContent =
      Math.round(width) + 'px × ' + Math.round(height) + 'px';
  }

  updatePosition(dims, bounds) {
    // Reset the size before measuring. The size will be assigned based on the results from `findTipPos`.
    assign(this.tip.style, { width: 'auto', height: 'auto' });
    const tipRect = this.tip.getBoundingClientRect();
    const tipPos = findTipPos(dims, bounds, {
      width: tipRect.width,
      height: tipRect.height,
    });
    assign(this.tip.style, tipPos.tipStyles);
    assign(this.tipArrow.style, tipPos.tipArrowStyles);
    assign(this.tipArrowSymbol.style, tipPos.tipArrowSymbolStyles);
  }
}

export default class Overlay {
  window: window;
  tipBoundsWindow: window;
  container: HTMLElement;
  tip: OverlayTip;
  rects: Array<OverlayRect>;

  constructor() {
    // Find the root window, because overlays are positioned relative to it.
    let currentWindow = window;
    while (currentWindow !== currentWindow.parent) {
      currentWindow = currentWindow.parent;
    }
    this.window = currentWindow;

    // When opened in shells/dev, the tooltip should be bound by the app iframe, not by the topmost window.
    let tipBoundsWindow = window;
    while (
      tipBoundsWindow !== tipBoundsWindow.parent &&
      !tipBoundsWindow.hasOwnProperty('__REACT_DEVTOOLS_GLOBAL_HOOK__')
    ) {
      tipBoundsWindow = tipBoundsWindow.parent;
    }
    this.tipBoundsWindow = tipBoundsWindow;

    const doc = currentWindow.document;
    this.container = doc.createElement('div');
    this.container.style.zIndex = '10000000';

    this.tip = new OverlayTip(doc, this.container);
    this.rects = [];

    doc.body.appendChild(this.container);
  }

  remove() {
    this.tip.remove();
    this.rects.forEach(rect => {
      rect.remove();
    });
    this.rects.length = 0;
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  inspect(nodes: Array<HTMLElement>, name?: ?string) {
    // We can't get the size of text nodes or comment nodes. React as of v15
    // heavily uses comment nodes to delimit text.
    const elements = nodes.filter(node => node.nodeType === Node.ELEMENT_NODE);

    while (this.rects.length > elements.length) {
      const rect = this.rects.pop();
      rect.remove();
    }
    if (elements.length === 0) {
      return;
    }

    while (this.rects.length < elements.length) {
      this.rects.push(new OverlayRect(this.window.document, this.container));
    }

    const outerBox = {
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
      left: Number.POSITIVE_INFINITY,
    };
    elements.forEach((element, index) => {
      const box = getNestedBoundingClientRect(element, this.window);
      const dims = getElementDimensions(element);

      outerBox.top = Math.min(outerBox.top, box.top - dims.marginTop);
      outerBox.right = Math.max(
        outerBox.right,
        box.left + box.width + dims.marginRight
      );
      outerBox.bottom = Math.max(
        outerBox.bottom,
        box.top + box.height + dims.marginBottom
      );
      outerBox.left = Math.min(outerBox.left, box.left - dims.marginLeft);

      const rect = this.rects[index];
      rect.update(box, dims);
    });

    if (!name) {
      name = elements[0].nodeName.toLowerCase();
      const ownerName = getOwnerDisplayName(elements[0]);
      if (ownerName) {
        name += ' (in ' + ownerName + ')';
      }
    }

    this.tip.updateText(
      name,
      outerBox.right - outerBox.left,
      outerBox.bottom - outerBox.top
    );
    const tipBounds = getNestedBoundingClientRect(
      this.tipBoundsWindow.document.documentElement,
      this.window
    );
    this.tip.updatePosition(
      {
        top: outerBox.top,
        left: outerBox.left,
        height: outerBox.bottom - outerBox.top,
        width: outerBox.right - outerBox.left,
      },
      {
        top: tipBounds.top + this.tipBoundsWindow.scrollY,
        left: tipBounds.left + this.tipBoundsWindow.scrollX,
        height: this.tipBoundsWindow.innerHeight,
        width: this.tipBoundsWindow.innerWidth,
      }
    );
  }
}

function getOwnerDisplayName(node) {
  const fiber = getFiber(node);
  if (fiber === null) {
    return null;
  }
  const owner = fiber._debugOwner;
  if (owner && owner.type) {
    const ownerName = owner.type.displayName || owner.type.name;
    return ownerName || null;
  }
  return null;
}

let lastFoundInternalKey = null;
function getFiber(node) {
  if (
    lastFoundInternalKey !== null &&
    node.hasOwnProperty(lastFoundInternalKey)
  ) {
    return (node: any)[lastFoundInternalKey];
  }
  let internalKey = Object.keys(node).find(
    key => key.indexOf('__reactInternalInstance') === 0
  );
  if (internalKey) {
    lastFoundInternalKey = internalKey;
    return (node: any)[lastFoundInternalKey];
  }
  return null;
}

function findTipPos(dims, bounds, tipSize) {
  const tipHeight = Math.max(tipSize.height, 20);
  const tipWidth = Math.max(tipSize.width, 60);
  const offscreenIconWidth = 16;
  const margin = 5;

  let offscreenY = 'none';
  let top;
  if (dims.top + dims.height + tipHeight <= bounds.top + bounds.height) {
    if (dims.top + dims.height < bounds.top + 0) {
      top = bounds.top + margin;
      offscreenY = 'top';
    } else {
      top = dims.top + dims.height + margin;
    }
  } else if (dims.top - tipHeight <= bounds.top + bounds.height) {
    if (dims.top - tipHeight - margin < bounds.top + margin) {
      top = bounds.top + margin;
      offscreenY = 'top';
    } else {
      top = dims.top - tipHeight - margin;
    }
  } else {
    top = bounds.top + bounds.height - tipHeight - margin;
    offscreenY = 'bottom';
  }

  let offscreenX = 'none';
  let left = dims.left + margin;
  if (dims.left < bounds.left) {
    offscreenX = dims.left + dims.width < bounds.left ? 'left' : 'none';
    left = bounds.left + margin;
  }
  if (dims.left + tipWidth > bounds.left + bounds.width) {
    offscreenX = dims.left > bounds.left + bounds.width ? 'right' : 'none';
    left = bounds.left + bounds.width - tipWidth - offscreenIconWidth - margin;
  }

  // Show where to look for the elements if they are positioned offscreen.
  let tipArrowStyles = {
    display: 'block',
    // We will position based on each arrow type anchor point (wide side base for "north", corner for "northwest").
    top: 'auto',
    right: 'auto',
    bottom: 'auto',
    left: 'auto',
    // We will rotate around the "north" arrow: ▲ wide side center.
    transform: 'rotate(0deg)',
  };
  let tipArrowSymbolStyles = {};
  const tipArrowSafeOffset = 2;
  if (offscreenX === 'left') {
    if (offscreenY === 'none') {
      // ◀
      assign(tipArrowSymbolStyles, NORTH_TIP_ARROW_STYLES);
      left += NORTH_TIP_ARROW_HEIGHT;
      tipArrowStyles.transform = 'rotate(-90deg)';
      tipArrowStyles.left = `0px`;
      tipArrowStyles.top = `${Math.max(
        NORTH_TIP_ARROW_WIDTH / 2 + tipArrowSafeOffset,
        Math.min(
          tipHeight - (NORTH_TIP_ARROW_WIDTH / 2 + tipArrowSafeOffset),
          top - dims.top
        )
      )}px`;
    } else if (offscreenY === 'top') {
      // ◥
      assign(tipArrowSymbolStyles, NORTHWEST_TIP_ARROW_STYLES);
      left += NORTHWEST_TIP_ARROW_SIZE;
      tipArrowStyles.transform = `rotate(90deg)`;
      tipArrowStyles.left = `0px`;
      tipArrowStyles.top = `${tipArrowSafeOffset}px`;
    } else if (offscreenY === 'bottom') {
      // ◢
      left += NORTHWEST_TIP_ARROW_SIZE;
      assign(tipArrowSymbolStyles, NORTHWEST_TIP_ARROW_STYLES);
      tipArrowStyles.transform = `rotate(180deg)`;
      tipArrowStyles.left = `0px`;
      tipArrowStyles.bottom = `${tipArrowSafeOffset}px`;
    }
  } else if (offscreenX === 'right') {
    if (offscreenY === 'none') {
      // ▶
      assign(tipArrowSymbolStyles, NORTH_TIP_ARROW_STYLES);
      left -= NORTH_TIP_ARROW_HEIGHT;
      tipArrowStyles.transform = 'rotate(90deg)';
      tipArrowStyles.right = `0px`;
      tipArrowStyles.top = `${Math.max(
        NORTH_TIP_ARROW_WIDTH / 2 + tipArrowSafeOffset,
        Math.min(
          tipHeight - (NORTH_TIP_ARROW_WIDTH / 2 + tipArrowSafeOffset),
          top - dims.top
        )
      )}px`;
    } else if (offscreenY === 'top') {
      // ◤
      assign(tipArrowSymbolStyles, NORTHWEST_TIP_ARROW_STYLES);
      left -= NORTHWEST_TIP_ARROW_SIZE;
      tipArrowStyles.transform = `rotate(0deg)`;
      tipArrowStyles.right = `0px`;
      tipArrowStyles.top = `${tipArrowSafeOffset}px`;
    } else if (offscreenY === 'bottom') {
      // ◣
      assign(tipArrowSymbolStyles, NORTHWEST_TIP_ARROW_STYLES);
      left -= NORTHWEST_TIP_ARROW_SIZE;
      tipArrowStyles.transform = `rotate(-90deg)`;
      tipArrowStyles.right = `0px`;
      tipArrowStyles.bottom = `${tipArrowSafeOffset}px`;
    }
  } else {
    tipArrowStyles.left = `${Math.max(
      NORTH_TIP_ARROW_WIDTH / 2 + tipArrowSafeOffset,
      Math.min(
        tipWidth - (NORTH_TIP_ARROW_WIDTH / 2 + tipArrowSafeOffset),
        left - dims.left
      )
    )}px`;
    if (offscreenY === 'none') {
      // none
      tipArrowStyles.display = 'none';
    } else if (offscreenY === 'top') {
      // ▲
      assign(tipArrowSymbolStyles, NORTH_TIP_ARROW_STYLES);
      top += NORTH_TIP_ARROW_HEIGHT;
      tipArrowStyles.transform = 'rotate(0deg)';
      tipArrowStyles.top = `0px`;
    } else if (offscreenY === 'bottom') {
      // ▼
      assign(tipArrowSymbolStyles, NORTH_TIP_ARROW_STYLES);
      top -= NORTH_TIP_ARROW_HEIGHT;
      tipArrowStyles.transform = 'rotate(180deg)';
      tipArrowStyles.bottom = `0px`;
    }
  }

  return {
    tipStyles: {
      top: top + 'px',
      left: left + 'px',
      width: tipWidth + 'px',
      height: tipHeight + 'px',
    },
    tipArrowStyles,
    tipArrowSymbolStyles,
  };
}

export function getElementDimensions(domElement: Element) {
  const calculatedStyle = window.getComputedStyle(domElement);
  return {
    borderLeft: parseInt(calculatedStyle.borderLeftWidth, 10),
    borderRight: parseInt(calculatedStyle.borderRightWidth, 10),
    borderTop: parseInt(calculatedStyle.borderTopWidth, 10),
    borderBottom: parseInt(calculatedStyle.borderBottomWidth, 10),
    marginLeft: parseInt(calculatedStyle.marginLeft, 10),
    marginRight: parseInt(calculatedStyle.marginRight, 10),
    marginTop: parseInt(calculatedStyle.marginTop, 10),
    marginBottom: parseInt(calculatedStyle.marginBottom, 10),
    paddingLeft: parseInt(calculatedStyle.paddingLeft, 10),
    paddingRight: parseInt(calculatedStyle.paddingRight, 10),
    paddingTop: parseInt(calculatedStyle.paddingTop, 10),
    paddingBottom: parseInt(calculatedStyle.paddingBottom, 10),
  };
}

// Get the window object for the document that a node belongs to,
// or return null if it cannot be found (node not attached to DOM,
// etc).
function getOwnerWindow(node: HTMLElement): typeof window | null {
  if (!node.ownerDocument) {
    return null;
  }
  return node.ownerDocument.defaultView;
}

// Get the iframe containing a node, or return null if it cannot
// be found (node not within iframe, etc).
function getOwnerIframe(node: HTMLElement): HTMLElement | null {
  const nodeWindow = getOwnerWindow(node);
  if (nodeWindow) {
    return nodeWindow.frameElement;
  }
  return null;
}

// Get a bounding client rect for a node, with an
// offset added to compensate for its border.
function getBoundingClientRectWithBorderOffset(node: HTMLElement) {
  const dimensions = getElementDimensions(node);
  return mergeRectOffsets([
    node.getBoundingClientRect(),
    {
      top: dimensions.borderTop,
      left: dimensions.borderLeft,
      bottom: dimensions.borderBottom,
      right: dimensions.borderRight,
      // This width and height won't get used by mergeRectOffsets (since this
      // is not the first rect in the array), but we set them so that this
      // object typechecks as a ClientRect.
      width: 0,
      height: 0,
    },
  ]);
}

// Add together the top, left, bottom, and right properties of
// each ClientRect, but keep the width and height of the first one.
function mergeRectOffsets(rects: Array<Rect>): Rect {
  return rects.reduce((previousRect, rect) => {
    if (previousRect == null) {
      return rect;
    }

    return {
      top: previousRect.top + rect.top,
      left: previousRect.left + rect.left,
      width: previousRect.width,
      height: previousRect.height,
      bottom: previousRect.bottom + rect.bottom,
      right: previousRect.right + rect.right,
    };
  });
}

// Calculate a boundingClientRect for a node relative to boundaryWindow,
// taking into account any offsets caused by intermediate iframes.
function getNestedBoundingClientRect(
  node: HTMLElement,
  boundaryWindow: typeof window
): Rect {
  const ownerIframe = getOwnerIframe(node);
  if (ownerIframe && ownerIframe !== boundaryWindow) {
    const rects = [node.getBoundingClientRect()];
    let currentIframe = ownerIframe;
    let onlyOneMore = false;
    while (currentIframe) {
      const rect = getBoundingClientRectWithBorderOffset(currentIframe);
      rects.push(rect);
      currentIframe = getOwnerIframe(currentIframe);

      if (onlyOneMore) {
        break;
      }
      // We don't want to calculate iframe offsets upwards beyond
      // the iframe containing the boundaryWindow, but we
      // need to calculate the offset relative to the boundaryWindow.
      if (currentIframe && getOwnerWindow(currentIframe) === boundaryWindow) {
        onlyOneMore = true;
      }
    }

    return mergeRectOffsets(rects);
  } else {
    return node.getBoundingClientRect();
  }
}

function boxWrap(dims, what, node) {
  assign(node.style, {
    borderTopWidth: dims[what + 'Top'] + 'px',
    borderLeftWidth: dims[what + 'Left'] + 'px',
    borderRightWidth: dims[what + 'Right'] + 'px',
    borderBottomWidth: dims[what + 'Bottom'] + 'px',
    borderStyle: 'solid',
  });
}

const overlayStyles = {
  background: 'rgba(120, 170, 210, 0.7)',
  padding: 'rgba(77, 200, 0, 0.3)',
  margin: 'rgba(255, 155, 0, 0.3)',
  border: 'rgba(255, 200, 50, 0.3)',
};
