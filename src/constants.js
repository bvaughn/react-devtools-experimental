// @flow

export const TREE_OPERATION_ADD = 1;
export const TREE_OPERATION_REMOVE = 2;
export const TREE_OPERATION_RESET_CHILDREN = 3;
export const TREE_OPERATION_UPDATE_TREE_BASE_DURATION = 4;
export const TREE_OPERATION_RECURSIVE_REMOVE_CHILDREN = 5;
export const TREE_OPERATION_UPDATE_SUSPENSE_STATE = 6;

export const SUSPENSE_STATE_PRIMARY = 0;
export const SUSPENSE_STATE_FALLBACK = 1;
export const SUSPENSE_STATE_FORCED_FALLBACK = 2;

export const LOCAL_STORAGE_RELOAD_AND_PROFILE_KEY =
  'React::DevTools::reloadAndProfile';

export const __DEBUG__ = false;
