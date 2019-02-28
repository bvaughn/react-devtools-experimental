// @flow

import React, {
  useContext,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeList } from 'react-window';
import { TreeContext } from './TreeContext';
import { SettingsContext } from './SettingsContext';
import Element from './Element';
import InspectHostNodesToggle from './InspectHostNodesToggle';
import OwnersStack from './OwnersStack';
import SearchInput from './SearchInput';

import styles from './Tree.css';

type Props = {||};

export default function Tree(props: Props) {
  const {
    baseDepth,
    getElementAtIndex,
    numElements,
    ownerStack,
    selectedElementIndex,
    selectNextElementInTree,
    selectParentElementInTree,
    selectPreviousElementInTree,
  } = useContext(TreeContext);
  const listRef = useRef<FixedSizeList<any> | null>(null);

  const { lineHeight } = useContext(SettingsContext);

  const selectedElementBackgroundRef = useRef();
  const [scroll, setScroll] = useState({ scrollOffset: 0 });

  // Make sure a newly selected element is visible in the list.
  // This is helpful for things like the owners list.
  useLayoutEffect(() => {
    if (selectedElementIndex !== null && listRef.current != null) {
      listRef.current.scrollToItem(selectedElementIndex);
    }
  }, [listRef, selectedElementIndex]);

  // Display an additional full-width background under a selected item.
  useLayoutEffect(() => {
    if (
      selectedElementIndex !== null &&
      listRef.current != null &&
      selectedElementBackgroundRef.current != null
    ) {
      const top = selectedElementIndex * lineHeight - scroll.scrollOffset;
      selectedElementBackgroundRef.current.style.setProperty('--top', top);
      selectedElementBackgroundRef.current.style.display = '';
    } else if (selectedElementBackgroundRef.current != null) {
      selectedElementBackgroundRef.current.style.display = 'none';
    }
  }, [
    lineHeight,
    listRef,
    scroll.scrollOffset,
    selectedElementBackgroundRef,
    selectedElementIndex,
  ]);

  // Navigate the tree with up/down arrow keys.
  useEffect(() => {
    const handleKeyDown = event => {
      // eslint-disable-next-line default-case
      switch (event.key) {
        case 'ArrowDown':
          selectNextElementInTree();
          event.preventDefault();
          break;
        case 'ArrowLeft':
          console.log('LEFT');
          selectParentElementInTree();
          break;
        case 'ArrowRight':
          selectNextElementInTree();
          event.preventDefault();
          break;
        case 'ArrowUp':
          selectPreviousElementInTree();
          event.preventDefault();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    selectNextElementInTree,
    selectParentElementInTree,
    selectPreviousElementInTree,
  ]);

  // Let react-window know to re-render any time the underlying tree data changes.
  // This includes the owner context, since it controls a filtered view of the tree.
  const itemData = useMemo(
    () => ({
      baseDepth,
      numElements,
      getElementAtIndex,
    }),
    [baseDepth, numElements, getElementAtIndex]
  );

  return (
    <div className={styles.Tree}>
      <div className={styles.SearchInput}>
        {ownerStack.length > 0 ? <OwnersStack /> : <SearchInput />}
        <InspectHostNodesToggle />
      </div>
      <div className={styles.FullSize}>
        <div className={styles.OverflowHider}>
          <div
            className={styles.SelectedElementBackground}
            ref={selectedElementBackgroundRef}
          />
          <div className={styles.AutoSizerWrapper}>
            <AutoSizer>
              {({ height, width }) => (
                <FixedSizeList
                  className={styles.List}
                  height={height}
                  itemCount={numElements}
                  itemData={itemData}
                  itemSize={lineHeight}
                  onScroll={setScroll}
                  ref={listRef}
                  width={width}
                >
                  {Element}
                </FixedSizeList>
              )}
            </AutoSizer>
          </div>
        </div>
      </div>
    </div>
  );
}
