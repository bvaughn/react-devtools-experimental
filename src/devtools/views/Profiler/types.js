// @flow

export type CommitTreeNodeFrontend = {|
  id: number,
  children: Array<number>,
  displayName: string | null,
  key: number | string | null,
  parentID: number,
  treeBaseDuration: number,
|};

export type CommitTreeFrontend = {|
  nodes: Map<number, CommitTreeNodeFrontend>,
  rootID: number,
|};

export type InteractionFrontend = {|
  id: number,
  name: string,
  timestamp: number,
|};

export type InteractionWithCommitsFrontend = {|
  ...InteractionFrontend,
  commits: Array<number>,
|};

export type InteractionsFrontend = {|
  interactions: Array<InteractionWithCommitsFrontend>,
  rootID: number,
|};

export type CommitDetailsFrontend = {|
  actualDurations: Map<number, number>,
  commitIndex: number,
  interactions: Array<InteractionFrontend>,
  rootID: number,
  selfDurations: Map<number, number>,
|};

export type FiberCommitsFrontend = {|
  commitDurations: Array<number>,
  fiberID: number,
  rootID: number,
|};

export type ProfilingSummaryFrontend = {|
  rootID: number,

  // Commit durations
  commitDurations: Array<number>,

  // Commit times (relative to when profiling started)
  commitTimes: Array<number>,

  // Map of fiber id to (initial) tree base duration
  initialTreeBaseDurations: Map<number, number>,

  interactionCount: number,
|};

export type ProfilingSnapshotNode = {|
  id: number,
  children: Array<number>,
  displayName: string | null,
  key: number | string | null,
|};

export type InterleavedProfilingSnapshotNodes = Array<
  [number, ProfilingSnapshotNode]
>;

export type ImportedProfilingData = {|
  version: 2,
  profilingOperations: Map<number, Array<Uint32Array>>,
  profilingSnapshots: Map<number, Map<number, ProfilingSnapshotNode>>,
  commitDetails: Array<CommitDetailsFrontend>,
  interactions: InteractionsFrontend,
  profilingSummary: ProfilingSummaryFrontend,
|};

export type ExportedProfilingSummaryFromFrontend = {|
  version: 2,
  profilingOperationsByRootID: Array<[number, Array<Array<number>>]>,
  profilingSnapshotsByRootID: Array<
    [number, InterleavedProfilingSnapshotNodes]
  >,
  rendererID: number,
  rootID: number,
|};

export type ExportedProfilingDataCommitDetails = Array<{|
  commitIndex: number,
  // Tuple of Fiber ID (n), actual duration (n+1) and self duration (n+2)
  durations: Array<number>,
  interactions: Array<InteractionFrontend>,
  rootID: number,
|}>;

export type ExportedProfilingDataProfilingSummary = {|
  commitDurations: Array<number>,
  commitTimes: Array<number>,
  // Tuple of Fiber ID (n) and duration (n+1)
  initialTreeBaseDurations: Array<number>,
  interactionCount: number,
  rootID: number,
|};
export type ExportedProfilingDataOperations = Array<Array<number>>;
export type ExportedProfilingDataOperationsByRootID = Array<
  [number, ExportedProfilingDataOperations]
>;
export type ExportedProfilingDataSnapshotsByRootID = Array<
  [number, InterleavedProfilingSnapshotNodes]
>;
export type ExportedProfilingData = {|
  version: 2,
  profilingOperationsByRootID: ExportedProfilingDataOperationsByRootID,
  profilingSnapshotsByRootID: ExportedProfilingDataSnapshotsByRootID,
  commitDetails: ExportedProfilingDataCommitDetails,
  interactions: InteractionsFrontend,
  profilingSummary: ExportedProfilingDataProfilingSummary,
|};
