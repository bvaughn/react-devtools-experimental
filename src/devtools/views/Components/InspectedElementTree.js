// @flow

import { copy } from 'clipboard-js';
import React, { useCallback } from 'react';
import Button from '../Button';
import ButtonIcon from '../ButtonIcon';
import KeyValue from './KeyValue';
import { serializeDataForCopy } from '../utils';
import styles from './InspectedElementTree.css';

type OverrideValueFn = (path: Array<string | number>, value: any) => void;

type Props = {|
  data: Object | null,
  label: string,
  overrideValueFn?: ?OverrideValueFn,
  showWhenEmpty?: boolean,
|};

export default function InspectedElementTree({
  data,
  label,
  overrideValueFn,
  isLoading = false,
  showWhenEmpty = false,
}: Props) {
  const isEmpty = data === null || Object.keys(data).length === 0;

  const handleCopy = useCallback(() => copy(serializeDataForCopy(data)), [
    data,
  ]);

  if (isEmpty && !showWhenEmpty) {
    return null;
  } else {
    // TODO Add click and key handlers for toggling element open/close state.
    return (
      <div className={styles.InspectedElementTree}>
        <div className={styles.HeaderRow}>
          <div className={styles.Header}>{label}</div>
          <div style={{ visibility: isEmpty ? 'hidden' : '' }}>
            <Button onClick={handleCopy}>
              <ButtonIcon type="copy" />
            </Button>
          </div>
        </div>
        {isLoading ? (
          <div className={styles.Empty}>Loading...</div>
        ) : isEmpty ? (
          <div className={styles.Empty}>None</div>
        ) : (
          Object.keys((data: any)).map(name => (
            <KeyValue
              key={name}
              depth={1}
              name={name}
              overrideValueFn={overrideValueFn}
              path={[name]}
              value={(data: any)[name]}
            />
          ))
        )}
      </div>
    );
  }
}
