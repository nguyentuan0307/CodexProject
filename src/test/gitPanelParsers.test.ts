import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLog, parseNameStatusZ, parseNumstatZ } from '../git/gitPanelParsers';

test('parses delimiter-safe decorated log records and merge parents', () => {
  const output = '\x1eabc\x1fabc1234\x1fp1 p2\x1fsubject\x1fJane\x1fjane@example.com\x1f1700000000\x1fHEAD -> refs/heads/main, tag: refs/tags/v1\n';
  assert.deepEqual(parseLog(output), [{
    hash: 'abc', shortHash: 'abc1234', parents: ['p1', 'p2'], subject: 'subject', author: 'Jane',
    authorEmail: 'jane@example.com', authorTimestamp: 1700000000,
    refs: ['HEAD -> refs/heads/main', 'tag: refs/tags/v1']
  }]);
});

test('parses NUL-delimited rename and ordinary name-status records', () => {
  assert.deepEqual(parseNameStatusZ('R100\0old name.cs\0new name.cs\0M\0src/a.cs\0'), [
    { status: 'R', oldPath: 'old name.cs', path: 'new name.cs', additions: 0, deletions: 0 },
    { status: 'M', path: 'src/a.cs', additions: 0, deletions: 0, conflict: false }
  ]);
});

test('parses numstat and treats binary counts as zero', () => {
  const stats = parseNumstatZ('12\t3\tsrc/a.cs\0-\t-\timage.png\0');
  assert.deepEqual(stats.get('src/a.cs'), { additions: 12, deletions: 3 });
  assert.deepEqual(stats.get('image.png'), { additions: 0, deletions: 0 });
});
