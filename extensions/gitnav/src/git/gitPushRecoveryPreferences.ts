import * as vscode from 'vscode';

export type GitPushRecoveryStrategy = 'ask' | 'rebase' | 'merge';

const storageKey = 'gitnav.pushRecoveryStrategies';

export class GitPushRecoveryPreferences {
  constructor(private readonly state: vscode.Memento) {}

  get(root: string): GitPushRecoveryStrategy {
    return this.state.get<Record<string, GitPushRecoveryStrategy>>(storageKey, {})[root] ?? 'ask';
  }

  async set(root: string, strategy: GitPushRecoveryStrategy): Promise<void> {
    const values = { ...this.state.get<Record<string, GitPushRecoveryStrategy>>(storageKey, {}) };
    if (strategy === 'ask') delete values[root];
    else values[root] = strategy;
    await this.state.update(storageKey, values);
  }
}
