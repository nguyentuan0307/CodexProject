import * as vscode from 'vscode';
import { addCodeItem, addExistingItem, addFile, addFolder } from './addCommands';
import { buildConfig, pickProfile, runConfig, startTarget } from './debugRunner';
import { openTerminalAt, runDotnetForProject } from './dotnetCli';
import { ExplorerInteractionController, isMovableNode } from './explorerInteraction';
import { copyFullPath, copyRelativePath, deleteItem, moveItem, renameItem, revealInFileExplorer } from './fileCommands';
import { ProjectModel, RunConfig, TreeNode } from './models';
import { isRunnableProject } from './projectCapabilities';
import { ProcessManager } from './processManager';
import * as runConfigStore from './runConfigStore';
import { createStatusBar, updateStatusBar, updateStopStatus } from './statusBar';
import { DotnetTreeProvider } from './treeProvider';

let activeProcessManager: ProcessManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const provider = new DotnetTreeProvider(context);
  const processManager = new ProcessManager();
  provider.setRunningStateProvider(project => processManager.hasRunningProject(project));
  activeProcessManager = processManager;
  const interaction = new ExplorerInteractionController(provider);
  const treeView = vscode.window.createTreeView('dotnetSolutionNavigator', {
    treeDataProvider: provider,
    dragAndDropController: interaction,
    showCollapseAll: true
  });

  const statusItems = createStatusBar();
  const refreshStatusBar = () => updateStatusBar(provider, context);
  const updateRunningContext = (hasRunningProcesses: boolean) => {
    vscode.commands.executeCommand('setContext', 'dotnetSolutionNavigator.hasRunningProcesses', hasRunningProcesses);
    updateStopStatus(hasRunningProcesses);
    provider.fireChanged();
  };

  context.subscriptions.push(
    treeView,
    processManager,
    ...statusItems,
    provider.onDidChangeTreeData(refreshStatusBar),
    processManager.onDidChangeRunningState(updateRunningContext),
    vscode.commands.registerCommand('dotnetSolutionNavigator.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('dotnetSolutionNavigator.openItem', openItem),
    vscode.commands.registerCommand('dotnetSolutionNavigator.openProjectFile', openProjectFile),
    vscode.commands.registerCommand('dotnetSolutionNavigator.buildProject', (node: TreeNode) => runProjectCommand(processManager, node, 'build')),
    vscode.commands.registerCommand('dotnetSolutionNavigator.runProject', (node: TreeNode) => runOrDebugProject(processManager, node, false)),
    vscode.commands.registerCommand('dotnetSolutionNavigator.debugProject', (node: TreeNode) => runOrDebugProject(processManager, node, true)),
    vscode.commands.registerCommand('dotnetSolutionNavigator.testProject', (node: TreeNode) => runProjectCommand(processManager, node, 'test')),
    vscode.commands.registerCommand('dotnetSolutionNavigator.cleanProject', (node: TreeNode) => runProjectCommand(processManager, node, 'clean')),
    vscode.commands.registerCommand('dotnetSolutionNavigator.stopProject', (node: TreeNode) => stopProject(processManager, node)),
    vscode.commands.registerCommand('dotnetSolutionNavigator.stopAll', () => processManager.stopAll()),
    vscode.commands.registerCommand('dotnetSolutionNavigator.openTerminalHere', openTerminalHere),
    vscode.commands.registerCommand('dotnetSolutionNavigator.toggleProjectFiles', () => toggleProjectFiles(provider)),
    vscode.commands.registerCommand('dotnetSolutionNavigator.toggleFileNesting', () => toggleFileNesting(provider)),
    vscode.commands.registerCommand('dotnetSolutionNavigator.openSettings', () => openNavigatorSettings()),
    vscode.commands.registerCommand('dotnetSolutionNavigator.addClass', (node: TreeNode) => addCodeItem(provider, node, 'class')),
    vscode.commands.registerCommand('dotnetSolutionNavigator.addInterface', (node: TreeNode) => addCodeItem(provider, node, 'interface')),
    vscode.commands.registerCommand('dotnetSolutionNavigator.addRecord', (node: TreeNode) => addCodeItem(provider, node, 'record')),
    vscode.commands.registerCommand('dotnetSolutionNavigator.addEnum', (node: TreeNode) => addCodeItem(provider, node, 'enum')),
    vscode.commands.registerCommand('dotnetSolutionNavigator.addFile', (node: TreeNode) => addFile(provider, node)),
    vscode.commands.registerCommand('dotnetSolutionNavigator.addFolder', (node: TreeNode) => addFolder(provider, node)),
    vscode.commands.registerCommand('dotnetSolutionNavigator.addExistingItem', (node: TreeNode) => addExistingItem(provider, node)),
    vscode.commands.registerCommand('dotnetSolutionNavigator.renameItem', (node?: TreeNode) => runSelectedFileCommand(interaction, node, selected => renameItem(provider, selected))),
    vscode.commands.registerCommand('dotnetSolutionNavigator.moveItem', (node?: TreeNode) => runSelectedFileCommand(interaction, node, selected => moveItem(provider, selected))),
    vscode.commands.registerCommand('dotnetSolutionNavigator.deleteItem', (node?: TreeNode) => runSelectedFileCommand(interaction, node, selected => deleteItem(provider, selected))),
    vscode.commands.registerCommand('dotnetSolutionNavigator.copyPath', (node?: TreeNode) => runSelectedResourceCommand(interaction, node, copyFullPath)),
    vscode.commands.registerCommand('dotnetSolutionNavigator.copyRelativePath', (node?: TreeNode) => runSelectedResourceCommand(interaction, node, copyRelativePath)),
    vscode.commands.registerCommand('dotnetSolutionNavigator.revealInOs', (node?: TreeNode) => runSelectedResourceCommand(interaction, node, revealInFileExplorer)),
    vscode.commands.registerCommand('dotnetSolutionNavigator.selectRunConfig', () => selectRunConfig(context, provider)),
    vscode.commands.registerCommand('dotnetSolutionNavigator.newCompound', () => newCompound(context, provider)),
    vscode.commands.registerCommand('dotnetSolutionNavigator.deleteCompound', () => deleteCompound(context, provider)),
    vscode.commands.registerCommand('dotnetSolutionNavigator.setActiveConfig', (node: TreeNode) => setActiveConfig(context, provider, node)),
    vscode.commands.registerCommand('dotnetSolutionNavigator.runActiveConfig', () => withActiveConfig(context, provider, config => runConfig(provider.getSolution()!, config, { debug: false, processManager }))),
    vscode.commands.registerCommand('dotnetSolutionNavigator.debugActiveConfig', () => withActiveConfig(context, provider, config => runConfig(provider.getSolution()!, config, { debug: true, processManager }))),
    vscode.commands.registerCommand('dotnetSolutionNavigator.buildActiveConfig', () => withActiveConfig(context, provider, config => buildConfig(provider.getSolution()!, config, processManager))),
    vscode.commands.registerCommand('dotnetSolutionNavigator.runConfigNode', (node: TreeNode) => runConfigNode(context, provider, node, false, processManager)),
    vscode.commands.registerCommand('dotnetSolutionNavigator.debugConfigNode', (node: TreeNode) => runConfigNode(context, provider, node, true, processManager)),
    treeView.onDidChangeSelection(event => interaction.setSelection(event.selection)),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('dotnetSolutionNavigator')) {
        provider.refresh();
      }
    }),
    vscode.commands.registerCommand('dotnetSolutionNavigator.setStartupProject', async (node: TreeNode) => {
      const project = projectFromNode(node);
      if (!project) {
        return;
      }

      await provider.setStartupProject(project);
      vscode.window.showInformationMessage(`Startup project set to ${project.name}.`);
    })
  );

  provider.refresh();
  refreshStatusBar();
  updateRunningContext(processManager.hasRunningProcesses());
  registerWorkspaceFileWatcher(context, provider);
}

export function deactivate(): void {
  activeProcessManager?.stopAll();
  activeProcessManager = undefined;
}

async function openItem(node: TreeNode): Promise<void> {
  if (!node.resourcePath) {
    return;
  }

  await vscode.window.showTextDocument(vscode.Uri.file(node.resourcePath), { preview: false });
}

async function openProjectFile(node: TreeNode): Promise<void> {
  const project = projectFromNode(node);
  if (!project) {
    return;
  }

  await vscode.window.showTextDocument(vscode.Uri.file(project.path), { preview: false });
}

async function runProjectCommand(processManager: ProcessManager, node: TreeNode, verb: 'build' | 'test' | 'clean'): Promise<void> {
  const project = projectFromNode(node);
  if (!project) {
    return;
  }

  await runDotnetForProject(project, verb, processManager);
}

async function runOrDebugProject(processManager: ProcessManager, node: TreeNode, debug: boolean): Promise<void> {
  const project = projectFromNode(node);
  if (!project) {
    return;
  }

  if (!isRunnableProject(project)) {
    vscode.window.showInformationMessage(`${project.name} is not runnable. Use Build instead.`);
    return;
  }

  const profile = await pickProfile(project);
  if (profile === null) {
    return;
  }

  await startTarget(project, profile, { debug, processManager });
}

async function stopProject(processManager: ProcessManager, node: TreeNode): Promise<void> {
  const project = projectFromNode(node);
  if (!project) {
    return;
  }

  await processManager.stopProject(project);
}

function openTerminalHere(node: TreeNode): void {
  if (node.project) {
    openTerminalAt(node.project.directory);
    return;
  }

  if (node.resourcePath) {
    openTerminalAt(node.resourcePath);
  }
}

function projectFromNode(node: TreeNode): ProjectModel | undefined {
  if (node.kind === 'project') {
    return node.project;
  }

  return undefined;
}

async function toggleProjectFiles(provider: DotnetTreeProvider): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('dotnetSolutionNavigator');
  const current = configuration.get<boolean>('showProjectFiles', true);

  await configuration.update('showProjectFiles', !current, vscode.ConfigurationTarget.Workspace);
  await provider.refresh();
  vscode.window.showInformationMessage(`Project files are now ${!current ? 'visible' : 'hidden'} in .NET Navigator.`);
}

async function toggleFileNesting(provider: DotnetTreeProvider): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('dotnetSolutionNavigator');
  const current = configuration.get<boolean>('enableFileNesting', true);

  await configuration.update('enableFileNesting', !current, vscode.ConfigurationTarget.Workspace);
  await provider.refresh();
  vscode.window.showInformationMessage(`File nesting is now ${!current ? 'enabled' : 'disabled'} in .NET Navigator.`);
}

async function openNavigatorSettings(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:local-dev.rider-like-solution-navigator');
}

async function runSelectedFileCommand(
  interaction: ExplorerInteractionController,
  node: TreeNode | undefined,
  command: (selected: TreeNode) => Promise<void>
): Promise<void> {
  const selected = node ?? interaction.getSelection();
  if (!isMovableNode(selected)) {
    vscode.window.showInformationMessage('Select a file or folder in .NET Navigator first.');
    return;
  }

  await command(selected);
}

async function runSelectedResourceCommand(
  interaction: ExplorerInteractionController,
  node: TreeNode | undefined,
  command: (selected: TreeNode) => Promise<void>
): Promise<void> {
  const selected = node ?? interaction.getSelection();
  if (!selected?.resourcePath || !['file', 'folder', 'project'].includes(selected.kind)) {
    vscode.window.showInformationMessage('Select a file, folder, or project in .NET Navigator first.');
    return;
  }

  await command(selected);
}

function registerWorkspaceFileWatcher(context: vscode.ExtensionContext, provider: DotnetTreeProvider): void {
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  let refreshTimer: NodeJS.Timeout | undefined;

  const scheduleRefresh = () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    refreshTimer = setTimeout(() => {
      provider.refresh();
      refreshTimer = undefined;
    }, 250);
  };

  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(scheduleRefresh),
    watcher.onDidDelete(scheduleRefresh),
    watcher.onDidChange(scheduleRefresh),
    { dispose: () => refreshTimer && clearTimeout(refreshTimer) }
  );
}

async function withActiveConfig(
  context: vscode.ExtensionContext,
  provider: DotnetTreeProvider,
  action: (config: RunConfig) => Promise<void>
): Promise<void> {
  const solution = provider.getSolution();
  if (!solution) {
    vscode.window.showInformationMessage('Open a .NET solution first.');
    return;
  }

  const active = runConfigStore.getActive(solution, context);
  if (!active) {
    vscode.window.showInformationMessage('No run configuration available.');
    return;
  }

  await action(active);
}

async function selectRunConfig(context: vscode.ExtensionContext, provider: DotnetTreeProvider): Promise<void> {
  const solution = provider.getSolution();
  if (!solution) {
    return;
  }

  const active = runConfigStore.getActive(solution, context);
  const newCompoundLabel = '$(add) New Compound...';
  const deleteCompoundLabel = '$(trash) Delete Compound...';
  const items = runConfigStore.listConfigs(solution, context).map(config => ({
    label: `${config.id === active?.id ? '$(check) ' : ''}${config.label}`,
    description: config.kind,
    id: config.id
  }));

  const picked = await vscode.window.showQuickPick(
    [...items, { label: newCompoundLabel, id: newCompoundLabel }, { label: deleteCompoundLabel, id: deleteCompoundLabel }],
    { title: 'Select Run Configuration' }
  );

  if (!picked) {
    return;
  }

  if (picked.id === newCompoundLabel) {
    await newCompound(context, provider);
    return;
  }

  if (picked.id === deleteCompoundLabel) {
    await deleteCompound(context, provider);
    return;
  }

  await runConfigStore.setActive(context, picked.id);
  await provider.refresh();
}

async function newCompound(context: vscode.ExtensionContext, provider: DotnetTreeProvider): Promise<void> {
  const solution = provider.getSolution();
  if (!solution) {
    return;
  }

  const singles = runConfigStore.listSingles(solution);
  const picked = await vscode.window.showQuickPick(
    singles.map(config => ({ label: config.label, description: config.kind, config })),
    { title: 'New Compound Configuration', canPickMany: true }
  );

  if (!picked || picked.length === 0) {
    return;
  }

  const name = await vscode.window.showInputBox({
    title: 'New Compound Configuration',
    prompt: 'Compound name',
    validateInput: value => value.trim().length > 0 ? undefined : 'Name is required.'
  });

  if (!name) {
    return;
  }

  const config: RunConfig = {
    id: `compound:${name.trim()}`,
    label: name.trim(),
    kind: 'compound',
    targets: picked.flatMap(item => item.config.targets)
  };

  await runConfigStore.saveCompound(context, config);
  await runConfigStore.setActive(context, config.id);
  await provider.refresh();
}

async function deleteCompound(context: vscode.ExtensionContext, provider: DotnetTreeProvider): Promise<void> {
  const compounds = runConfigStore.getCompounds(context);
  if (compounds.length === 0) {
    vscode.window.showInformationMessage('No compound configurations to delete.');
    return;
  }

  const picked = await vscode.window.showQuickPick(
    compounds.map(config => ({ label: config.label, id: config.id })),
    { title: 'Delete Compound Configuration' }
  );

  if (!picked) {
    return;
  }

  await runConfigStore.deleteCompound(context, picked.id);
  await provider.refresh();
}

async function setActiveConfig(context: vscode.ExtensionContext, provider: DotnetTreeProvider, node: TreeNode): Promise<void> {
  if (!node.configId) {
    return;
  }

  await runConfigStore.setActive(context, node.configId);
  await provider.refresh();
}

async function runConfigNode(
  context: vscode.ExtensionContext,
  provider: DotnetTreeProvider,
  node: TreeNode,
  debug: boolean,
  processManager: ProcessManager
): Promise<void> {
  const solution = provider.getSolution();
  if (!solution || !node.configId) {
    return;
  }

  const config = runConfigStore.listConfigs(solution, context).find(candidate => candidate.id === node.configId);
  if (config) {
    await runConfig(solution, config, { debug, processManager });
  }
}
