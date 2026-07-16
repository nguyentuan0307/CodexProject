export type GitRecoveryKind = 'emptyCherryPick' | 'pushRejected';

export interface GitErrorRecovery {
  readonly kind: GitRecoveryKind;
  readonly title: string;
  readonly detail: string;
  readonly actions: Array<{ readonly label: string; readonly action: string }>;
}

export function classifyGitError(message: string, action?: string): GitErrorRecovery | undefined {
  if (/previous cherry-pick is now empty|cherry-pick.*empty/i.test(message)) {
    return {
      kind: 'emptyCherryPick',
      title: 'Cherry-pick produced no changes',
      detail: message.trim(),
      actions: [
        { label: 'Skip Commit', action: 'skip' },
        { label: 'Commit Empty & Continue', action: 'commitEmptyContinue' },
        { label: 'Abort', action: 'abort' }
      ]
    };
  }
  if (action === 'push' && /rejected|non-fast-forward/i.test(message)) {
    return {
      kind: 'pushRejected',
      title: 'Push rejected',
      detail: message.trim(),
      actions: [{ label: 'Update Current Branch', action: 'update' }]
    };
  }
  return undefined;
}
