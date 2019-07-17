// @flow

// Flip this flag to true to enable verbose console debug logging.
export const __DEBUG__ = false;

export const TREE_OPERATION_ADD = 1;
export const TREE_OPERATION_REMOVE = 2;
export const TREE_OPERATION_REORDER_CHILDREN = 3;
export const TREE_OPERATION_UPDATE_TREE_BASE_DURATION = 4;

export const LOCAL_STORAGE_FILTER_PREFERENCES_KEY =
  'React::DevTools::componentFilters';

export const SESSION_STORAGE_LAST_SELECTION_KEY =
  'React::DevTools::lastSelection';

export const SESSION_STORAGE_RECORD_CHANGE_DESCRIPTIONS_KEY =
  'React::DevTools::recordChangeDescriptions';

export const SESSION_STORAGE_RELOAD_AND_PROFILE_KEY =
  'React::DevTools::reloadAndProfile';

export const LOCAL_STORAGE_SHOULD_PATCH_CONSOLE_KEY =
  'React::DevTools::appendComponentStack';

export const PROFILER_EXPORT_VERSION = 4;
