// @flow

import React, { Fragment, useContext } from 'react';
import { ProfilerContext } from './ProfilerContext';
import { formatDuration, formatTime } from './utils';
import { StoreContext } from '../context';
import Button from '../Button';
import ButtonIcon from '../ButtonIcon';
import ProfilingCache from 'src/devtools/ProfilingCache';

import styles from './SidebarSelectedFiberInfo.css';

type Props = {||};

export default function SidebarSelectedFiberInfo(_: Props) {
  const { profilingCache } = useContext(StoreContext);
  const {
    rendererID,
    rootID,
    selectCommitIndex,
    selectedCommitIndex,
    selectedFiberID,
    selectedFiberName,
    selectFiber,
  } = useContext(ProfilerContext);

  const { commitTimes } = profilingCache.ProfilingSummary.read({
    rendererID: ((rendererID: any): number),
    rootID: ((rootID: any): number),
  });

  const { commitDurations } = profilingCache.FiberCommits.read({
    fiberID: ((selectedFiberID: any): number),
    rendererID: ((rendererID: any): number),
    rootID: ((rootID: any): number),
  });

  const listItems = [];
  for (let i = 0; i < commitDurations.length; i += 2) {
    const commitIndex = commitDurations[i];
    const duration = commitDurations[i + 1];
    const time = commitTimes[commitIndex];

    listItems.push(
      <button
        key={commitIndex}
        className={
          selectedCommitIndex === commitIndex
            ? styles.CurrentCommit
            : styles.Commit
        }
        onClick={() => selectCommitIndex(commitIndex)}
      >
        {formatTime(time)}s for {formatDuration(duration)}ms
      </button>
    );
  }

  return (
    <Fragment>
      <div className={styles.Toolbar}>
        <div className={styles.Component}>
          {selectedFiberName || 'Selected component'}
        </div>

        <Button
          className={styles.IconButton}
          onClick={() => selectFiber(null, null)}
          title="Back to commit view"
        >
          <ButtonIcon type="close" />
        </Button>
      </div>
      <WhatChanged
        commitIndex={((selectedCommitIndex: any): number)}
        fiberID={((selectedFiberID: any): number)}
        profilingCache={profilingCache}
        rendererID={((rendererID: any): number)}
        rootID={((rootID: any): number)}
      />
      <div className={styles.Content}>
        <label className={styles.Label}>Rendered at</label>: {listItems}
      </div>
    </Fragment>
  );
}

type WhatChangedProps = {|
  commitIndex: number,
  fiberID: number,
  profilingCache: ProfilingCache,
  rendererID: number,
  rootID: number,
|};

function WhatChanged({
  commitIndex,
  fiberID,
  profilingCache,
  rendererID,
  rootID,
}: WhatChangedProps) {
  const { changeDescriptions } = profilingCache.CommitDetails.read({
    commitIndex,
    rendererID,
    rootID,
  });

  const changeDescription = changeDescriptions.get(fiberID);
  if (changeDescription == null) {
    return null;
  }

  const changes = [];
  if (changeDescription.didHooksChange) {
    changes.push(
      <div key="hooks" className={styles.WhatChangedItem}>
        • Hooks
      </div>
    );
  }
  if (changeDescription.props.length !== 0) {
    changes.push(
      <div key="props" className={styles.WhatChangedItem}>
        • Props
        {changeDescription.props.map(key => (
          <span key={key} className={styles.WhatChangedKey}>
            {key}
          </span>
        ))}
      </div>
    );
  }
  if (changeDescription.state.length !== 0) {
    changes.push(
      <div key="state" className={styles.WhatChangedItem}>
        • State
        {changeDescription.state.map(key => (
          <span key={key} className={styles.WhatChangedKey}>
            {key}
          </span>
        ))}
      </div>
    );
  }

  if (changes.length === 0) {
    changes.push(<div className={styles.WhatChangedItem}>Nothing</div>);
  }

  return (
    <div className={styles.Content}>
      <label className={styles.Label}>What changed?</label>
      {changes}
    </div>
  );
}
