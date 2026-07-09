import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectModel } from './models';
import { ProcessManager } from './processManager';

export async function runDotnetForProject(
  project: ProjectModel,
  verb: 'build' | 'test' | 'clean',
  processManager?: ProcessManager
): Promise<void> {
  const command = `dotnet ${verb} "${project.path}"`;
  const task = new vscode.Task(
    { type: 'dotnet', task: verb, project: project.path },
    vscode.TaskScope.Workspace,
    `${verb} ${project.name}`,
    '.NET Navigator',
    new vscode.ShellExecution(command, { cwd: project.directory }),
    ['$msCompile']
  );

  const execution = await vscode.tasks.executeTask(task);
  processManager?.trackTask(project, verb, execution);
}

export function openTerminalAt(directory: string): void {
  const terminal = vscode.window.createTerminal({
    name: `.NET: ${path.basename(directory)}`,
    cwd: directory
  });
  terminal.show();
}
