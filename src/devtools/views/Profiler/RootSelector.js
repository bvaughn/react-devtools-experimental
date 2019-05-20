// @flow

import React, { Fragment, Suspense, useCallback, useContext } from 'react';
import { ProfilerContext } from './ProfilerContext';
import { StoreContext } from '../context';

import styles from './RootSelector.css';

export default function RootSelector(_: {||}) {
  const store = useContext(StoreContext);
  const { rootID, selectRootID } = useContext(ProfilerContext);

  if (store.profilingOperations.size <= 1) {
    // Don't take up visual space if there's only one root.
    return null;
  }

  const rootIDs = store.profilingOperations.keys();
  const options = [];
  for (let rootID of rootIDs) {
    const root = store.getElementByID(rootID);
    if (root !== null && root.children.length > 0) {
      const firstChild = store.getElementByID(root.children[0]);
      if (firstChild !== null) {
        options.push(
          <option key={rootID} value={rootID}>
            {firstChild.displayName}
          </option>
        );
      }
    }
  }

  const handleChange = useCallback(
    ({ currentTarget }) => {
      selectRootID(parseInt(currentTarget.value, 10));
    },
    [selectRootID]
  );

  return (
    <Fragment>
      <div className={styles.Spacer} />
      <select value={rootID} onChange={handleChange}>
        {options}
      </select>
    </Fragment>
  );
}
