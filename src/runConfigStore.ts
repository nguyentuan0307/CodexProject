import * as vscode from 'vscode';
import { LaunchProfile, ProjectModel, RunConfig, SolutionModel } from './models';
import { isRunnableProject } from './projectCapabilities';

const compoundsKey = 'runCompounds';
const activeKey = 'activeRunConfigId';

export function configLabelFor(project: ProjectModel, profile?: LaunchProfile): string {
  return `${project.name}: ${profile?.name ?? 'Default'}`;
}

export function listSingles(solution: SolutionModel): RunConfig[] {
  const configs: RunConfig[] = [];

  for (const project of solution.projects.filter(isRunnableProject)) {
    if (project.launchProfiles.length === 0) {
      configs.push(singleConfig(project));
      continue;
    }

    for (const profile of project.launchProfiles) {
      configs.push(singleConfig(project, profile));
    }
  }

  return configs;
}

export function getCompounds(context: vscode.ExtensionContext): RunConfig[] {
  return context.workspaceState.get<RunConfig[]>(compoundsKey, []);
}

export function listConfigs(solution: SolutionModel, context: vscode.ExtensionContext): RunConfig[] {
  return [...listSingles(solution), ...getCompounds(context)];
}

export function getActive(solution: SolutionModel, context: vscode.ExtensionContext): RunConfig | undefined {
  const activeId = context.workspaceState.get<string>(activeKey);
  const configs = listConfigs(solution, context);
  return configs.find(config => config.id === activeId) ?? configs[0];
}

export async function setActive(context: vscode.ExtensionContext, id: string): Promise<void> {
  await context.workspaceState.update(activeKey, id);
}

export async function saveCompound(context: vscode.ExtensionContext, config: RunConfig): Promise<void> {
  const configs = getCompounds(context).filter(candidate => candidate.id !== config.id);
  configs.push(config);
  await context.workspaceState.update(compoundsKey, configs);
}

export async function deleteCompound(context: vscode.ExtensionContext, id: string): Promise<void> {
  await context.workspaceState.update(compoundsKey, getCompounds(context).filter(config => config.id !== id));
  if (context.workspaceState.get<string>(activeKey) === id) {
    await context.workspaceState.update(activeKey, undefined);
  }
}

function singleConfig(project: ProjectModel, profile?: LaunchProfile): RunConfig {
  return {
    id: singleId(project.path, profile?.name),
    label: configLabelFor(project, profile),
    kind: 'single',
    targets: [{ projectPath: project.path, profileName: profile?.name }]
  };
}

function singleId(projectPath: string, profileName?: string): string {
  return `single:${projectPath}::${profileName ?? 'Default'}`;
}
