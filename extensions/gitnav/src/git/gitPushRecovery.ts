import { GitRepositorySnapshot } from './gitPanelModels';
import { currentBranchPushArgs, currentBranchPushPlan, sameNameUpdateArgs } from './gitPush';

export type NonFastForwardStrategy = 'rebase' | 'merge';

export interface GitPushRecoveryExecutor {
  git(root: string, args: string[]): Promise<unknown>;
  snapshot(root: string): Promise<GitRepositorySnapshot>;
}

export async function prepareRecoveredPush(
  executor: GitPushRecoveryExecutor,
  root: string,
  strategy: NonFastForwardStrategy
): Promise<string[]> {
  await executor.git(root, ['fetch', 'origin', '--prune']);
  const updatePlan = currentBranchPushPlan(await executor.snapshot(root));
  await executor.git(root, sameNameUpdateArgs(updatePlan, strategy));
  const updatedSnapshot = await executor.snapshot(root);
  if (updatedSnapshot.operation) {
    throw new Error(`${strategy === 'rebase' ? 'Rebase' : 'Merge'} requires conflict resolution. Resolve conflicts before pushing.`);
  }
  return currentBranchPushArgs(currentBranchPushPlan(updatedSnapshot));
}
