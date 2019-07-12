// @flow

import React, { useContext, useMemo, useState } from 'react';
import { unstable_batchedUpdates as batchedUpdates } from 'react-dom';
import { BridgeContext, StoreContext } from 'src/devtools/views/context';
import AutoSizeInput from './AutoSizeInput';
import styles from './StyleEditor.css';

import type { Style } from './types';

type Props = {|
  id: number,
  style: Style,
|};

type ChangeAttributeFn = (oldName: string, newName: string, value: any) => void;
type ChangeValueFn = (name: string, value: any) => void;

export default function StyleEditor({ id, style }: Props) {
  const bridge = useContext(BridgeContext);
  const store = useContext(StoreContext);

  // TODO (RN style editor) Clone style Object into state for local edits.
  // This would enable us to insert new style rules in stable positions without updates overriding.

  const appendStyleAttributeToEnd = event => {
    // TODO (RN style editor) Append a new, empty style to the end of the cloned keys array
  };

  const changeAttribute = (oldName: string, newName: string, value: any) => {
    console.log('changeAttribute()', oldName, newName, value);
    bridge.send('NativeStyleEditor_renameAttribute', {
      id,
      rendererID: store.getRendererIDForElement(id),
      oldName,
      newName,
      value,
    });
  };

  const changeValue = (name: string, value: any) => {
    console.log('changeValue()', name, value);
    bridge.send('NativeStyleEditor_setValue', {
      id,
      rendererID: store.getRendererIDForElement(id),
      name,
      value,
    });
  };

  const keys = useMemo(() => Array.from(Object.keys(style)), [style]);

  return (
    <div className={styles.StyleEditor}>
      <div onClick={appendStyleAttributeToEnd}>
        <div className={styles.Brackets}>{'style {'}</div>
        {keys.length > 0 &&
          keys.map(attribute => (
            <Row
              key={attribute}
              attribute={attribute}
              changeAttribute={changeAttribute}
              changeValue={changeValue}
              value={style[attribute]}
            />
          ))}
        {keys.length === 0 && <div className={styles.Empty}>Empty</div>}
        <div className={styles.Brackets}>{'}'}</div>
      </div>
    </div>
  );
}

type RowProps = {|
  attribute: string,
  changeAttribute: ChangeAttributeFn,
  changeValue: ChangeValueFn,
  value: any,
|};

function Row({ attribute, changeAttribute, changeValue, value }: RowProps) {
  const appendStyleAttributeAfterRow = event => {
    // TODO (RN style editor) Append a new, empty style after the current row,
    // and prevent event from bubbling.
  };

  // TODO (RN style editor) Use @reach/combobox to auto-complete attributes.
  // The list of valid attributes would need to be injected by RN backend,
  // which would need to require them from ReactNativeViewViewConfig "validAttributes.style" keys.
  // This would need to degrade gracefully for RNW,
  // and maybe even let them inject a custom set of whitelisted attributes.

  const [localAttribute, setLocalAttribute] = useState(attribute);
  const [localValue, setLocalValue] = useState(JSON.stringify(value));
  const [isValueValid, setIsValueValid] = useState(true);

  const validateAndSetLocalValue = value => {
    let isValid = false;
    try {
      JSON.parse(value);
      isValid = true;
    } catch (error) {}

    batchedUpdates(() => {
      setLocalValue(value);
      setIsValueValid(isValid);
    });
  };

  const submitValueChange = () => {
    if (isValueValid) {
      const parsedLocalValue = JSON.parse(localValue);
      if (value !== parsedLocalValue) {
        changeValue(attribute, parsedLocalValue);
      }
    }
  };

  const submitAttributeChange = () => {
    if (attribute !== localAttribute) {
      changeAttribute(attribute, localAttribute, value);
    }
  };

  return (
    <div className={styles.Row} onClick={appendStyleAttributeAfterRow}>
      <Field
        className={styles.Attribute}
        onChange={setLocalAttribute}
        onSubmit={submitAttributeChange}
        value={localAttribute}
      />
      :&nbsp;
      <Field
        className={isValueValid ? styles.ValueValid : styles.ValueInvalid}
        onChange={validateAndSetLocalValue}
        onSubmit={submitValueChange}
        value={localValue}
      />
      ;
    </div>
  );
}

type FieldProps = {|
  className: string,
  onChange: (value: any) => void,
  onSubmit: () => void,
  value: any,
|};

function Field({ className, onChange, onSubmit, value }: FieldProps) {
  const onKeyDown = event => {
    if (event.key === 'Enter') {
      onSubmit();
    }
  };

  return (
    <AutoSizeInput
      className={`${className} ${styles.Input}`}
      onBlur={onSubmit}
      onChange={event => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      value={value}
    />
  );
}
