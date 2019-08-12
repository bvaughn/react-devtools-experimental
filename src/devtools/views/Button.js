// @flow

import React from 'react';
import Tooltip from '@reach/tooltip';

import styles from './Button.css';
import tooltipStyles from './Tooltip.css';

type Props = {
  children: React$Node,
  className?: string,
  dataTutorialID?: string,
  title?: string,
};

export default function Button({
  children,
  className = '',
  dataTutorialID,
  title = '',
  ...rest
}: Props) {
  let button = (
    <button
      className={`${styles.Button} ${className}`}
      data-tutorial-id={dataTutorialID}
      {...rest}
    >
      <span className={`${styles.ButtonContent} ${className}`} tabIndex={-1}>
        {children}
      </span>
    </button>
  );

  if (title) {
    button = (
      <Tooltip className={tooltipStyles.Tooltip} label={title}>
        {button}
      </Tooltip>
    );
  }

  return button;
}
