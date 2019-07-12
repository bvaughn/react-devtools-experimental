// @flow

import React, { useContext, useMemo, useRef, useState } from 'react';
import { unstable_batchedUpdates as batchedUpdates } from 'react-dom';
import { copy } from 'clipboard-js';
import { BridgeContext, StoreContext } from 'src/devtools/views/context';
import Button from '../../Button';
import ButtonIcon from '../../ButtonIcon';
import { serializeDataForCopy } from '../../utils';
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

  const changeAttribute = (oldName: string, newName: string, value: any) => {
    bridge.send('NativeStyleEditor_renameAttribute', {
      id,
      rendererID: store.getRendererIDForElement(id),
      oldName,
      newName,
      value,
    });
  };

  const changeValue = (name: string, value: any) => {
    bridge.send('NativeStyleEditor_setValue', {
      id,
      rendererID: store.getRendererIDForElement(id),
      name,
      value,
    });
  };

  const keys = useMemo(() => Array.from(Object.keys(style)), [style]);

  const handleCopy = () => copy(serializeDataForCopy(style));

  return (
    <div className={styles.StyleEditor}>
      <div className={styles.HeaderRow}>
        <div className={styles.Header}>
          <div className={styles.Brackets}>{'style {'}</div>
        </div>
        <Button onClick={handleCopy} title="Copy to clipboard">
          <ButtonIcon type="copy" />
        </Button>
      </div>
      {keys.length > 0 &&
        keys.map(attribute => (
          <Row
            key={attribute}
            attribute={attribute}
            changeAttribute={changeAttribute}
            changeValue={changeValue}
            validAttributes={store.nativeStyleEditorValidAttributes}
            value={style[attribute]}
          />
        ))}
      <NewRow
        changeAttribute={changeAttribute}
        changeValue={changeValue}
        validAttributes={store.nativeStyleEditorValidAttributes}
      />
      <div className={styles.Brackets}>{'}'}</div>
    </div>
  );
}

type NewRowProps = {|
  changeAttribute: ChangeAttributeFn,
  changeValue: ChangeValueFn,
  validAttributes: $ReadOnlyArray<string> | null,
|};

function NewRow({
  changeAttribute,
  changeValue,
  validAttributes,
}: NewRowProps) {
  const [key, setKey] = useState<number>(0);
  const reset = () => setKey(key + 1);

  const newAttributeRef = useRef<string>('');

  const changeAttributeWrapper = (
    oldAttribute: string,
    newAttribute: string,
    value: any
  ) => {
    // Ignore attribute changes until a value has been specified
    newAttributeRef.current = newAttribute;
  };

  const changeValueWrapper = (attribute: string, value: any) => {
    // Blur events should reset/cancel if there's no value or no attribute
    if (newAttributeRef.current !== '') {
      if (value !== '') {
        changeValue(newAttributeRef.current, value);
      }
      reset();
    }
  };

  return (
    <Row
      key={key}
      attribute={''}
      attributePlaceholder="attribute"
      changeAttribute={changeAttributeWrapper}
      changeValue={changeValueWrapper}
      validAttributes={validAttributes}
      value={''}
      valuePlaceholder="value"
    />
  );
}

type RowProps = {|
  attribute: string,
  attributePlaceholder?: string,
  changeAttribute: ChangeAttributeFn,
  changeValue: ChangeValueFn,
  validAttributes: $ReadOnlyArray<string> | null,
  value: any,
  valuePlaceholder?: string,
|};

function Row({
  attribute,
  attributePlaceholder,
  changeAttribute,
  changeValue,
  validAttributes,
  value,
  valuePlaceholder,
}: RowProps) {
  // TODO (RN style editor) Use @reach/combobox to auto-complete attributes.
  // The list of valid attributes would need to be injected by RN backend,
  // which would need to require them from ReactNativeViewViewConfig "validAttributes.style" keys.
  // This would need to degrade gracefully for react-native-web,
  // althoguh we could let it also inject a custom set of whitelisted attributes.

  const [localAttribute, setLocalAttribute] = useState(attribute);
  const [localValue, setLocalValue] = useState(JSON.stringify(value));
  const [isAttributeValid, setIsAttributeValid] = useState(true);
  const [isValueValid, setIsValueValid] = useState(true);

  const validateAndSetLocalAttribute = attribute => {
    const isValid =
      attribute === '' ||
      validAttributes === null ||
      validAttributes.indexOf(attribute) >= 0;

    batchedUpdates(() => {
      setLocalAttribute(attribute);
      setIsAttributeValid(isValid);
    });
  };

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

  const resetAttribute = () => {
    setLocalAttribute(attribute);
  };

  const resetValue = () => {
    setLocalValue(value);
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
    if (isAttributeValid && attribute !== localAttribute) {
      changeAttribute(attribute, localAttribute, value);
    }
  };

  return (
    <div className={styles.Row}>
      <Field
        className={isAttributeValid ? styles.Attribute : styles.Invalid}
        onChange={validateAndSetLocalAttribute}
        onReset={resetAttribute}
        onSubmit={submitAttributeChange}
        placeholder={attributePlaceholder}
        value={localAttribute}
      />
      :&nbsp;
      <Field
        className={isValueValid ? styles.Value : styles.Invalid}
        onChange={validateAndSetLocalValue}
        onReset={resetValue}
        onSubmit={submitValueChange}
        placeholder={valuePlaceholder}
        value={localValue}
      />
      ;
    </div>
  );
}

type FieldProps = {|
  className: string,
  onChange: (value: any) => void,
  onReset: () => void,
  onSubmit: () => void,
  placeholder?: string,
  value: any,
|};

function Field({
  className,
  onChange,
  onReset,
  onSubmit,
  placeholder,
  value,
}: FieldProps) {
  const onKeyDown = event => {
    switch (event.key) {
      case 'Enter':
        onSubmit();
        break;
      case 'Escape':
        onReset();
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
        event.stopPropagation();
        break;
      default:
        break;
    }
  };

  return (
    <AutoSizeInput
      className={`${className} ${styles.Input}`}
      onBlur={onSubmit}
      onChange={event => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      value={value}
    />
  );
}
