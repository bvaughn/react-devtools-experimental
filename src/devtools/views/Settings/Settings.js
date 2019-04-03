// @flow

import React, { useCallback, useContext } from 'react';
import { createPortal } from 'react-dom';
import Radio from '../Radio';
import { SettingsContext } from './SettingsContext';

import styles from './Settings.css';

export type Props = {|
  portalContainer?: Element,
|};

export default function Settings({ portalContainer }: Props) {
  const { displayDensity, setDisplayDensity, theme, setTheme } = useContext(
    SettingsContext
  );

  const updateDisplayDensity = useCallback(
    ({ currentTarget }) => {
      setDisplayDensity(currentTarget.value);
    },
    [setDisplayDensity]
  );

  const updateTheme = useCallback(
    ({ currentTarget }) => {
      setTheme(currentTarget.value);
    },
    [setTheme]
  );

  const children = (
    <div className={styles.Settings}>
      <div className={styles.Section}>
        <div className={styles.Header}>Theme</div>
        <div className={styles.OptionGroup}>
          <Radio
            className={styles.Option}
            name="Settings-Settings-theme"
            checked={theme === 'auto'}
            value="auto"
            onChange={updateTheme}
          >
            Auto
          </Radio>
          <Radio
            className={styles.Option}
            name="Settings-theme"
            checked={theme === 'light'}
            value="light"
            onChange={updateTheme}
          >
            Light
          </Radio>
          <Radio
            className={styles.Option}
            name="Settings-theme"
            checked={theme === 'dark'}
            value="dark"
            onChange={updateTheme}
          >
            Dark
          </Radio>
        </div>
      </div>
      <div className={styles.Section}>
        <div className={styles.Header}>Display density</div>
        <div className={styles.OptionGroup}>
          <Radio
            className={styles.Option}
            name="Settings-displayDensity"
            checked={displayDensity === 'compact'}
            value="compact"
            onChange={updateDisplayDensity}
          >
            Compact
          </Radio>
          <Radio
            className={styles.Option}
            name="Settings-displayDensity"
            checked={displayDensity === 'comfortable'}
            value="comfortable"
            onChange={updateDisplayDensity}
          >
            Comfortable
          </Radio>
        </div>
      </div>
    </div>
  );

  return portalContainer != null
    ? createPortal(children, portalContainer)
    : children;
}
