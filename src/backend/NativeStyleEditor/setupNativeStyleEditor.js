// @flow

import Agent from 'src/backend/agent';
import Bridge from 'src/bridge';
import resolveBoxStyle from './resolveBoxStyle';

import type { RendererID } from '../types';
import type { StyleAndLayout } from './types';

export type ResolveNativeStyle = (stylesheetID: number) => ?Object;

export default function setupNativeStyleEditor(
  bridge: Bridge,
  agent: Agent,
  resolveNativeStyle: ResolveNativeStyle,
  validAttributes?: $ReadOnlyArray<string> | null
) {
  bridge.addListener(
    'NativeStyleEditor_measure',
    ({ id, rendererID }: {| id: number, rendererID: RendererID |}) => {
      measureStyle(agent, bridge, resolveNativeStyle, id, rendererID);
    }
  );

  bridge.addListener(
    'NativeStyleEditor_renameAttribute',
    ({
      id,
      rendererID,
      oldName,
      newName,
      value,
    }: {|
      id: number,
      rendererID: RendererID,
      oldName: string,
      newName: string,
      value: string,
    |}) => {
      renameStyle(agent, id, rendererID, oldName, newName, value);
      setTimeout(() =>
        measureStyle(agent, bridge, resolveNativeStyle, id, rendererID)
      );
    }
  );

  bridge.addListener(
    'NativeStyleEditor_setValue',
    ({
      id,
      rendererID,
      name,
      value,
    }: {|
      id: number,
      rendererID: number,
      name: string,
      value: string,
    |}) => {
      setStyle(agent, id, rendererID, name, value);
      setTimeout(() =>
        measureStyle(agent, bridge, resolveNativeStyle, id, rendererID)
      );
    }
  );

  bridge.send('isNativeStyleEditorSupported', {
    isSupported: true,
    validAttributes,
  });
}

const EMPTY_BOX_STYLE = {
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

const componentIDToStyleOverrides: Map<number, Object> = new Map();

function measureStyle(
  agent: Agent,
  bridge: Bridge,
  resolveNativeStyle: ResolveNativeStyle,
  id: number,
  rendererID: RendererID
) {
  const data = agent.getInstanceAndStyle({ id, rendererID });
  if (!data || !data.style) {
    bridge.send(
      'NativeStyleEditor_styleAndLayout',
      ({
        id,
        layout: null,
        style: null,
      }: StyleAndLayout)
    );
    return;
  }

  const { instance, style } = data;

  let resolvedStyle = resolveNativeStyle(style);

  // If it's a host component we edited before, amend styles.
  const styleOverrides = componentIDToStyleOverrides.get(id);
  if (styleOverrides != null) {
    resolvedStyle = Object.assign({}, resolvedStyle, styleOverrides);
  }

  if (!instance || typeof instance.measure !== 'function') {
    bridge.send(
      'NativeStyleEditor_styleAndLayout',
      ({
        id,
        layout: null,
        style: resolvedStyle || null,
      }: StyleAndLayout)
    );
    return;
  }

  // $FlowFixMe the parameter types of an unknown function are unknown
  instance.measure((x, y, width, height, left, top) => {
    // RN Android sometimes returns undefined here. Don't send measurements in this case.
    // https://github.com/jhen0409/react-native-debugger/issues/84#issuecomment-304611817
    if (typeof x !== 'number') {
      bridge.send(
        'NativeStyleEditor_styleAndLayout',
        ({
          id,
          layout: null,
          style: resolvedStyle || null,
        }: StyleAndLayout)
      );
      return;
    }
    const margin = resolveBoxStyle('margin', resolvedStyle) || EMPTY_BOX_STYLE;
    const padding =
      resolveBoxStyle('padding', resolvedStyle) || EMPTY_BOX_STYLE;
    bridge.send(
      'NativeStyleEditor_styleAndLayout',
      ({
        id,
        layout: {
          x,
          y,
          width,
          height,
          left,
          top,
          margin,
          padding,
        },
        style: resolvedStyle || null,
      }: StyleAndLayout)
    );
  });
}

function shallowClone(object: Object): Object {
  const cloned = {};
  for (let n in object) {
    cloned[n] = object[n];
  }
  return cloned;
}

function renameStyle(
  agent: Agent,
  id: number,
  rendererID: RendererID,
  oldName: string,
  newName: string,
  value: string
): void {
  const data = agent.getInstanceAndStyle({ id, rendererID });
  if (!data || !data.style) {
    return;
  }

  const { instance, style } = data;

  const newStyle = newName
    ? { [oldName]: undefined, [newName]: value }
    : { [oldName]: undefined };

  let customStyle;

  // TODO It would be nice if the renderer interface abstracted this away somehow.
  if (instance !== null && typeof instance.setNativeProps === 'function') {
    // In the case of a host component, we need to use setNativeProps().
    // Remember to "correct" resolved styles when we read them next time.
    const styleOverrides = componentIDToStyleOverrides.get(id);
    if (!styleOverrides) {
      componentIDToStyleOverrides.set(id, newStyle);
    } else {
      Object.assign(styleOverrides, newStyle);
    }
    // TODO Fabric does not support setNativeProps; chat with Sebastian or Eli
    instance.setNativeProps({ style: newStyle });
  } else if (Array.isArray(style)) {
    const lastIndex = style.length - 1;
    if (
      typeof style[lastIndex] === 'object' &&
      !Array.isArray(style[lastIndex])
    ) {
      customStyle = shallowClone(style[lastIndex]);
      delete customStyle[oldName];
      if (newName) {
        customStyle[newName] = value;
      } else {
        customStyle[oldName] = undefined;
      }

      agent.overrideProps({
        id,
        rendererID,
        path: ['style', lastIndex],
        value: customStyle,
      });
    } else {
      agent.overrideProps({
        id,
        rendererID,
        path: ['style'],
        value: style.concat([newStyle]),
      });
    }
  } else if (typeof style === 'object') {
    customStyle = shallowClone(style);
    delete customStyle[oldName];
    if (newName) {
      customStyle[newName] = value;
    } else {
      customStyle[oldName] = undefined;
    }

    agent.overrideProps({
      id,
      rendererID,
      path: ['style'],
      value: customStyle,
    });
  } else {
    agent.overrideProps({
      id,
      rendererID,
      path: ['style'],
      value: [style, newStyle],
    });
  }

  agent.emit('hideNativeHighlight');
}

function setStyle(
  agent: Agent,
  id: number,
  rendererID: RendererID,
  name: string,
  value: string
) {
  const data = agent.getInstanceAndStyle({ id, rendererID });
  if (!data || !data.style) {
    return;
  }

  const { instance, style } = data;
  const newStyle = { [name]: value };

  // TODO It would be nice if the renderer interface abstracted this away somehow.
  if (instance !== null && typeof instance.setNativeProps === 'function') {
    // In the case of a host component, we need to use setNativeProps().
    // Remember to "correct" resolved styles when we read them next time.
    const styleOverrides = componentIDToStyleOverrides.get(id);
    if (!styleOverrides) {
      componentIDToStyleOverrides.set(id, newStyle);
    } else {
      Object.assign(styleOverrides, newStyle);
    }
    // TODO Fabric does not support setNativeProps; chat with Sebastian or Eli
    instance.setNativeProps({ style: newStyle });
  } else if (Array.isArray(style)) {
    const lastLength = style.length - 1;
    if (
      typeof style[lastLength] === 'object' &&
      !Array.isArray(style[lastLength])
    ) {
      agent.overrideProps({
        id,
        rendererID,
        path: ['style', lastLength, name],
        value,
      });
    } else {
      agent.overrideProps({
        id,
        rendererID,
        path: ['style'],
        value: style.concat([newStyle]),
      });
    }
  } else {
    agent.overrideProps({
      id,
      rendererID,
      path: ['style'],
      value: [style, newStyle],
    });
  }

  agent.emit('hideNativeHighlight');
}
