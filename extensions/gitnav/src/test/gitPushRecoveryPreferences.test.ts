import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { GitPushRecoveryPreferences } from '../git/gitPushRecoveryPreferences';

class MemoryState {
  private readonly values = new Map<string, unknown>();
  keys(): readonly string[] { return [...this.values.keys()]; }
  get<T>(key: string, fallback?: T): T { return (this.values.has(key) ? this.values.get(key) : fallback) as T; }
  async update(key: string, value: unknown): Promise<void> { this.values.set(key, value); }
}

test('stores push recovery strategy independently per repository', async () => {
  const preferences = new GitPushRecoveryPreferences(new MemoryState());
  assert.equal(preferences.get('/repo/a'), 'ask');
  await preferences.set('/repo/a', 'rebase');
  await preferences.set('/repo/b', 'merge');
  assert.equal(preferences.get('/repo/a'), 'rebase');
  assert.equal(preferences.get('/repo/b'), 'merge');
});

test('resetting to ask removes the remembered repository choice', async () => {
  const preferences = new GitPushRecoveryPreferences(new MemoryState());
  await preferences.set('/repo/a', 'merge');
  await preferences.set('/repo/a', 'ask');
  assert.equal(preferences.get('/repo/a'), 'ask');
});
