import * as vscode from 'vscode';
import { ProjectModel } from './models';

type TaskVerb = 'build' | 'test' | 'clean';

interface ManagedTask {
  readonly projectPath: string;
  readonly verb: TaskVerb;
  readonly execution: vscode.TaskExecution;
}

export class ProcessManager implements vscode.Disposable {
  private readonly onDidChangeRunningStateEmitter = new vscode.EventEmitter<boolean>();
  readonly onDidChangeRunningState = this.onDidChangeRunningStateEmitter.event;

  private readonly sessionsByProject = new Map<string, Set<vscode.DebugSession>>();
  private readonly tasksByProject = new Map<string, Set<ManagedTask>>();
  private readonly pendingDebugProjects: ProjectModel[] = [];
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(vscode.debug.onDidStartDebugSession(session => this.trackNextDebugSession(session)));
    this.disposables.push(vscode.debug.onDidTerminateDebugSession(session => this.untrackDebugSession(session)));
    this.disposables.push(vscode.tasks.onDidEndTaskProcess(event => this.untrackTaskExecution(event.execution)));
  }

  expectDebugSession(project: ProjectModel): void {
    this.pendingDebugProjects.push(project);
  }

  cancelExpectedDebugSession(project: ProjectModel): void {
    const index = this.pendingDebugProjects.findIndex(candidate => projectKey(candidate.path) === projectKey(project.path));
    if (index >= 0) {
      this.pendingDebugProjects.splice(index, 1);
    }
  }

  trackDebugSession(project: ProjectModel, session: vscode.DebugSession): void {
    const key = projectKey(project.path);
    const sessions = this.sessionsByProject.get(key) ?? new Set<vscode.DebugSession>();
    sessions.add(session);
    this.sessionsByProject.set(key, sessions);
    this.fireRunningState();
  }

  trackTask(project: ProjectModel, verb: TaskVerb, execution: vscode.TaskExecution): void {
    const key = projectKey(project.path);
    const tasks = this.tasksByProject.get(key) ?? new Set<ManagedTask>();
    tasks.add({ projectPath: project.path, verb, execution });
    this.tasksByProject.set(key, tasks);
    this.fireRunningState();
  }

  async stopProject(project: ProjectModel): Promise<void> {
    const key = projectKey(project.path);
    await Promise.all([
      this.stopSessions(this.sessionsByProject.get(key)),
      this.stopTasks(this.tasksByProject.get(key))
    ]);
    this.sessionsByProject.delete(key);
    this.tasksByProject.delete(key);
    this.fireRunningState();
  }

  async stopAll(): Promise<void> {
    const sessionSets = [...this.sessionsByProject.values()];
    const taskSets = [...this.tasksByProject.values()];

    await Promise.all([
      ...sessionSets.map(sessions => this.stopSessions(sessions)),
      ...taskSets.map(tasks => this.stopTasks(tasks))
    ]);

    this.sessionsByProject.clear();
    this.tasksByProject.clear();
    this.fireRunningState();
  }

  hasRunningProcesses(): boolean {
    return this.sessionsByProject.size > 0 || this.tasksByProject.size > 0;
  }

  hasRunningProject(project: ProjectModel): boolean {
    const key = projectKey(project.path);
    return Boolean(this.sessionsByProject.get(key)?.size || this.tasksByProject.get(key)?.size);
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }

    this.onDidChangeRunningStateEmitter.dispose();
  }

  private async stopSessions(sessions: Set<vscode.DebugSession> | undefined): Promise<void> {
    if (!sessions) {
      return;
    }

    await Promise.all([...sessions].map(session => vscode.debug.stopDebugging(session)));
  }

  private async stopTasks(tasks: Set<ManagedTask> | undefined): Promise<void> {
    if (!tasks) {
      return;
    }

    for (const task of tasks) {
      task.execution.terminate();
    }
  }

  private trackNextDebugSession(session: vscode.DebugSession): void {
    const project = this.pendingDebugProjects.shift();
    if (project) {
      this.trackDebugSession(project, session);
    }
  }

  private untrackDebugSession(session: vscode.DebugSession): void {
    for (const [key, sessions] of this.sessionsByProject.entries()) {
      sessions.delete(session);
      if (sessions.size === 0) {
        this.sessionsByProject.delete(key);
      }
    }

    this.fireRunningState();
  }

  private untrackTaskExecution(execution: vscode.TaskExecution): void {
    for (const [key, tasks] of this.tasksByProject.entries()) {
      for (const task of [...tasks]) {
        if (task.execution === execution) {
          tasks.delete(task);
        }
      }

      if (tasks.size === 0) {
        this.tasksByProject.delete(key);
      }
    }

    this.fireRunningState();
  }

  private fireRunningState(): void {
    this.onDidChangeRunningStateEmitter.fire(this.hasRunningProcesses());
  }
}

function projectKey(projectPath: string): string {
  return projectPath.toLowerCase();
}
