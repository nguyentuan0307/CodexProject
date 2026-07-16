import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyGitError } from '../git/gitErrorRecovery';

test('offers recovery actions for an empty cherry-pick', () => {
  const recovery = classifyGitError('The previous cherry-pick is now empty, possibly due to conflict resolution.');
  assert.equal(recovery?.kind, 'emptyCherryPick');
  assert.deepEqual(recovery?.actions.map(item => item.action), ['skip', 'commitEmptyContinue', 'abort']);
});

test('does not replace ordinary Git errors with unrelated recovery actions', () => {
  assert.equal(classifyGitError('fatal: not a git repository'), undefined);
});

test('offers an update action when a push is rejected', () => {
  const recovery = classifyGitError('rejected: non-fast-forward', 'push');
  assert.equal(recovery?.kind, 'pushRejected');
  assert.deepEqual(recovery?.actions, [{ label: 'Update Current Branch', action: 'update' }]);
});
