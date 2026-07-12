import assert from 'node:assert/strict';
import test from 'node:test';
import Module from 'node:module';

type Listener<T> = (event: T) => unknown;

class MockEventEmitter<T> {
  private readonly listeners = new Set<Listener<T>>();
  readonly event = (listener: Listener<T>) => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };
  fire(event: T): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
  dispose(): void {
    this.listeners.clear();
  }
}

const debugStarted = new MockEventEmitter<unknown>();
const debugTerminated = new MockEventEmitter<unknown>();
const taskProcessEnded = new MockEventEmitter<{ execution: unknown; exitCode?: number }>();
const taskEnded = new MockEventEmitter<{ execution: unknown }>();
let debugStopCalls = 0;

const vscodeMock = {
  EventEmitter: MockEventEmitter,
  debug: {
    onDidStartDebugSession: debugStarted.event,
    onDidTerminateDebugSession: debugTerminated.event,
    stopDebugging: async () => { debugStopCalls += 1; }
  },
  tasks: {
    onDidEndTaskProcess: taskProcessEnded.event,
    onDidEndTask: taskEnded.event
  },
  window: {
    createOutputChannel: () => ({ appendLine: () => undefined, show: () => undefined, dispose: () => undefined }),
    showErrorMessage: async () => undefined
  }
};

const moduleWithLoader = Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
const originalLoad = moduleWithLoader._load;
moduleWithLoader._load = function load(request, parent, isMain) {
  return request === 'vscode' ? vscodeMock : originalLoad(request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ProcessManager } = require('../processManager') as typeof import('../processManager');

const project = {
  name: 'App',
  path: 'C:\\repo\\App.csproj',
  directory: 'C:\\repo',
  relativePath: 'App.csproj',
  kind: 'console' as const,
  targetFrameworks: ['net8.0'],
  launchProfiles: [],
  packageReferences: [],
  projectReferences: []
};

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

test('rejects a duplicate active configuration before the UI refreshes', () => {
  const manager = new ProcessManager();
  manager.beginRun('single:app', 'App', 'run', [{ project }]);
  assert.throws(
    () => manager.beginRun('single:app', 'App', 'run', [{ project }]),
    /already queued/
  );
  manager.dispose();
});

test('keeps a stopped task busy until VS Code confirms task completion', async () => {
  const manager = new ProcessManager();
  const session = manager.beginRun('single:app', 'App', 'run', [{ project }]);
  let terminateCalls = 0;
  const execution = { terminate: () => { terminateCalls += 1; } };
  manager.trackTask(project, 'build', execution as never, session.runId, session.targets[0].targetId);

  await manager.stopConfig('single:app');
  assert.equal(terminateCalls, 1);
  assert.equal(session.targets[0].phase, 'stopping');
  assert.equal(manager.hasRunningProcesses(), true);

  taskProcessEnded.fire({ execution, exitCode: 1 });
  taskEnded.fire({ execution });
  await delay(300);

  assert.equal(session.targets[0].phase, 'stopped');
  assert.equal(manager.hasRunningProcesses(), false);
  manager.dispose();
});

test('cleans up a task even when no process-end event is emitted', async () => {
  const manager = new ProcessManager();
  const session = manager.beginRun('operation:build:app', 'Build App', 'build', [{ project }]);
  const execution = { terminate: () => undefined };
  manager.trackTask(project, 'build', execution as never, session.runId, session.targets[0].targetId);
  const completion = manager.waitForTask(execution as never, 2_000);

  taskEnded.fire({ execution });
  assert.equal(await completion, undefined);
  assert.equal(session.targets[0].phase, 'failed');
  assert.equal(manager.hasRunningProcesses(), false);
  manager.dispose();
});

test('matches debug sessions by run identity and confirms stop on termination', async () => {
  debugStopCalls = 0;
  const manager = new ProcessManager();
  const session = manager.beginRun('single:app', 'App', 'debug', [{ project }]);
  const targetId = session.targets[0].targetId;
  manager.setTargetPhase(session.runId, targetId, 'starting');
  manager.expectDebugSession(project, 'Debug App', session.runId, targetId);

  const debugSession = {
    id: 'debug-1',
    configuration: {
      dotnetSolutionNavigatorRunId: session.runId,
      dotnetSolutionNavigatorTargetId: targetId
    }
  };
  debugStarted.fire(debugSession);
  assert.equal(session.targets[0].phase, 'running');

  await manager.stopConfig('single:app');
  assert.equal(debugStopCalls, 1);
  assert.equal(session.targets[0].phase, 'stopping');

  debugTerminated.fire(debugSession);
  assert.equal(session.targets[0].phase, 'stopped');
  assert.equal(manager.hasRunningProcesses(), false);
  manager.dispose();
});

test('finishes a stopped pending debug target when start is rejected', async () => {
  const manager = new ProcessManager();
  const session = manager.beginRun('single:app', 'App', 'run', [{ project }]);
  const targetId = session.targets[0].targetId;
  manager.setTargetPhase(session.runId, targetId, 'starting');
  manager.expectDebugSession(project, 'Run App', session.runId, targetId);

  await manager.stopConfig('single:app');
  assert.equal(session.targets[0].phase, 'stopping');
  manager.cancelExpectedDebugSession(project, session.runId, targetId);

  assert.equal(session.targets[0].phase, 'stopped');
  assert.equal(manager.hasRunningProcesses(), false);
  manager.dispose();
});

test.after(() => {
  moduleWithLoader._load = originalLoad;
});
