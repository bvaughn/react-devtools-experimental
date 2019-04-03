// @flow

import React, { ReactNode } from 'react';
import Icon from './Icon';

import styles from './Radio.css';

type Props = {
  className?: string,
  checked: boolean,
  children?: ReactNode,
};

export default function Radio({
  className,
  checked,
  children,
  ...rest
}: Props) {
  return (
    <label className={`${styles.Radio} ${className}`}>
      <Icon
        className={styles.IconSpacing}
        type={checked ? 'radio-selected' : 'radio'}
      />
      <input hidden={true} type="radio" checked={checked} {...rest} />
      {children}
    </label>
  );
}
