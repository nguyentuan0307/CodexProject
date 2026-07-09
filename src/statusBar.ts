import * as vscode from 'vscode';
import { getActive } from './runConfigStore';
import { DotnetTreeProvider } from './treeProvider';

let configItem: vscode.StatusBarItem | undefined;
let stopItem: vscode.StatusBarItem | undefined;

export function createStatusBar(): vscode.StatusBarItem[] {
  const build = makeItem('$(tools)', 'dotnetSolutionNavigator.buildActiveConfig', 'Build active run configuration', 104);
  configItem = makeItem('$(rocket) No config', 'dotnetSolutionNavigator.selectRunConfig', 'Select run configuration', 103);
  const run = makeItem('$(play)', 'dotnetSolutionNavigator.runActiveConfig', 'Run active configuration', 102);
  const debug = makeItem('$(bug)', 'dotnetSolutionNavigator.debugActiveConfig', 'Debug active configuration', 101);
  stopItem = makeItem('$(stop-circle)', 'dotnetSolutionNavigator.stopAll', 'Stop all .NET Navigator sessions and tasks', 100);
  stopItem.hide();

  return [build, configItem, run, debug, stopItem];
}

export function updateStatusBar(provider: DotnetTreeProvider, context: vscode.ExtensionContext): void {
  if (!configItem) {
    return;
  }

  const solution = provider.getSolution();
  const active = solution ? getActive(solution, context) : undefined;
  configItem.text = `$(rocket) ${active?.label ?? 'No config'}`;
}

export function updateStopStatus(hasRunningProcesses: boolean): void {
  if (!stopItem) {
    return;
  }

  if (hasRunningProcesses) {
    stopItem.show();
  } else {
    stopItem.hide();
  }
}

function makeItem(text: string, command: string, tooltip: string, priority: number): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
  item.text = text;
  item.command = command;
  item.tooltip = tooltip;
  item.show();
  return item;
}
