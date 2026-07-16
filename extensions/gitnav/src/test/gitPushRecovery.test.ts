import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { GitRepositorySnapshot } from '../git/gitPanelModels';
import { prepareRecoveredPush } from '../git/gitPushRecovery';

function snapshot(operation?: GitRepositorySnapshot['operation']): GitRepositorySnapshot {
  return {
    root: '/repo', name: 'repo', head: 'feature', detached: false, upstream: 'origin/feature',
    ahead: 1, behind: 1, changedCount: 0, operation,
    refs: [{ name: 'origin/feature', fullName: 'refs/remotes/origin/feature', hash: 'abc', kind: 'remote', ahead: 0, behind: 0, current: false }],
    stashes: [], worktrees: []
  };
}

test('recovery fetches, rebases, and only then prepares the push', async () => {
  const commands: string[][] = [];
  const executor = { git: async (_root: string, args: string[]) => { commands.push(args); }, snapshot: async () => snapshot() };
  const push = await prepareRecoveredPush(executor, '/repo', 'rebase');
  assert.deepEqual(commands, [['fetch', 'origin', '--prune'], ['rebase', 'origin/feature']]);
  assert.deepEqual(push, ['push', 'origin', 'HEAD:refs/heads/feature']);
});

test('recovery supports merge as an equal strategy', async () => {
  const commands: string[][] = [];
  const executor = { git: async (_root: string, args: string[]) => { commands.push(args); }, snapshot: async () => snapshot() };
  await prepareRecoveredPush(executor, '/repo', 'merge');
  assert.deepEqual(commands[1], ['merge', 'origin/feature']);
});

test('recovery never prepares a push while conflict resolution is active', async () => {
  let reads = 0;
  const executor = { git: async () => undefined, snapshot: async () => snapshot(++reads > 1 ? 'REBASING' : undefined) };
  await assert.rejects(() => prepareRecoveredPush(executor, '/repo', 'rebase'), /Resolve conflicts before pushing/);
});

test('recovery stops immediately when update fails', async () => {
  let calls = 0;
  const executor = {
    git: async () => { if (++calls === 2) throw new Error('CONFLICT'); },
    snapshot: async () => snapshot()
  };
  await assert.rejects(() => prepareRecoveredPush(executor, '/repo', 'merge'), /CONFLICT/);
  assert.equal(calls, 2);
});
