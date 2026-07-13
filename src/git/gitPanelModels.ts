export type GitRefKind = 'local' | 'remote' | 'tag';

export interface GitRefInfo {
  readonly name: string;
  readonly fullName: string;
  readonly hash: string;
  readonly kind: GitRefKind;
  readonly upstream?: string;
  readonly ahead: number;
  readonly behind: number;
  readonly current: boolean;
}

export interface GitStashInfo {
  readonly ref: string;
  readonly hash: string;
  readonly message: string;
  readonly timestamp: number;
}

export interface GitFileChange {
  readonly status: string;
  readonly path: string;
  readonly oldPath?: string;
  readonly additions: number;
  readonly deletions: number;
  readonly conflict?: boolean;
}

export interface GitCommitSummary {
  readonly hash: string;
  readonly shortHash: string;
  readonly parents: string[];
  readonly subject: string;
  readonly author: string;
  readonly authorEmail: string;
  readonly authorTimestamp: number;
  readonly refs: string[];
  readonly lane?: GitGraphLane;
}

export interface GitGraphLine { readonly fromColumn: number; readonly toColumn: number; readonly toCommit: string; }
export interface GitGraphLane { readonly column: number; readonly color: number; readonly lines: GitGraphLine[]; }
export interface GitGraphSnapshot { readonly activeLanes: Array<string | null>; readonly laneColors: Array<number | null>; readonly nextColor: number; }

export interface GitCommitDetail extends GitCommitSummary {
  readonly message: string;
  readonly committer: string;
  readonly committerEmail: string;
  readonly committerTimestamp: number;
  readonly files: GitFileChange[];
}

export interface GitRepositorySnapshot {
  readonly root: string;
  readonly name: string;
  readonly head: string;
  readonly detached: boolean;
  readonly upstream?: string;
  readonly ahead: number;
  readonly behind: number;
  readonly changedCount: number;
  readonly operation?: GitOperationState;
  readonly refs: GitRefInfo[];
  readonly stashes: GitStashInfo[];
}

export type GitOperationState = 'MERGING' | 'REBASING' | 'CHERRY-PICKING' | 'REVERTING';

export interface GitLogFilter {
  readonly text?: string;
  readonly regex?: boolean;
  readonly matchCase?: boolean;
  readonly refs?: string[];
  readonly author?: string;
  readonly path?: string;
  readonly since?: string;
  readonly until?: string;
}

export interface GitLogPage {
  readonly commits: GitCommitSummary[];
  readonly offset: number;
  readonly total: number;
  readonly hasMore: boolean;
}

export interface GitPanelState {
  readonly repositories: string[];
  readonly repository?: GitRepositorySnapshot;
  readonly log?: GitLogPage;
  readonly uncommitted: GitFileChange[];
}

export interface GitMutationRequest {
  readonly action: string;
  readonly ref?: string;
  readonly refs?: string[];
  readonly hash?: string;
  readonly hashes?: string[];
  readonly path?: string;
  readonly options?: Record<string, boolean | string>;
}
