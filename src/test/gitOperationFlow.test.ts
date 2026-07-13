import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { canSkipOperation, operationArguments } from '../git/gitOperationFlow';

test('maps conflict actions to the active Git operation', () => {
  assert.deepEqual(operationArguments('MERGING', 'continue'), ['merge', '--continue']);
  assert.deepEqual(operationArguments('REBASING', 'abort'), ['rebase', '--abort']);
  assert.deepEqual(operationArguments('CHERRY-PICKING', 'skip'), ['cherry-pick', '--skip']);
});

test('allows skip only for rebase and cherry-pick', () => {
  assert.equal(canSkipOperation('REBASING'), true);
  assert.equal(canSkipOperation('CHERRY-PICKING'), true);
  assert.equal(canSkipOperation('MERGING'), false);
  assert.throws(() => operationArguments('MERGING', 'skip'), /not available/);
});
