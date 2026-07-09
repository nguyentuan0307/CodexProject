import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { SolutionModel } from './models';
import { parseProject } from './projectParser';
import { uniqueByPath } from './pathUtils';

const supportedProjectExtensions = 'csproj|fsproj|vbproj|dcproj';
const solutionProjectRegex = new RegExp(
  `Project\\("[^"]+"\\)\\s*=\\s*"[^"]+"\\s*,\\s*"([^"]+\\.(?:${supportedProjectExtensions}))"\\s*,\\s*"\\{[^"]+"\\s*EndProject`,
  'gi'
);
const slnxProjectRegex = new RegExp(`Path\\s*=\\s*"([^"]+\\.(?:${supportedProjectExtensions}))"`, 'gi');

export async function loadSolution(workspaceFolder: vscode.WorkspaceFolder): Promise<SolutionModel> {
  const rootPath = workspaceFolder.uri.fsPath;
  const solutions = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceFolder, '**/*.{sln,slnx}'),
    '**/{bin,obj,node_modules,.vs}/**',
    20
  );

  if (solutions.length > 0) {
    const selected = await selectSolutionIfNeeded(solutions);
    return parseSolutionFile(selected.fsPath, rootPath);
  }

  const projectFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceFolder, '**/*.{csproj,fsproj,vbproj,dcproj}'),
    '**/{bin,obj,node_modules,.vs}/**',
    100
  );

  const projects = await Promise.all(projectFiles.map(uri => parseProject(uri.fsPath, rootPath)));
  return {
    name: workspaceFolder.name,
    rootPath,
    projects: uniqueByPath(projects).sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  };
}

async function selectSolutionIfNeeded(solutions: vscode.Uri[]): Promise<vscode.Uri> {
  const sorted = [...solutions].sort((a, b) => a.fsPath.localeCompare(b.fsPath));
  if (sorted.length === 1) {
    return sorted[0];
  }

  const picked = await vscode.window.showQuickPick(
    sorted.map(uri => ({ label: path.basename(uri.fsPath), description: uri.fsPath, uri })),
    { placeHolder: 'Select active .NET solution' }
  );

  return picked?.uri ?? sorted[0];
}

async function parseSolutionFile(solutionPath: string, rootPath: string): Promise<SolutionModel> {
  const content = await fs.readFile(solutionPath, 'utf8');
  const projectPaths = solutionPath.toLowerCase().endsWith('.slnx')
    ? readSlnxProjectPaths(content, path.dirname(solutionPath))
    : readSlnProjectPaths(content, path.dirname(solutionPath));
  const projects = await Promise.all(projectPaths.map(projectPath => parseProject(projectPath, rootPath)));

  return {
    name: path.basename(solutionPath),
    path: solutionPath,
    rootPath,
    projects: uniqueByPath(projects).sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  };
}

function readSlnProjectPaths(content: string, solutionDirectory: string): string[] {
  const projectPaths: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = solutionProjectRegex.exec(content)) !== null) {
    projectPaths.push(path.resolve(solutionDirectory, match[1]));
  }

  return projectPaths;
}

function readSlnxProjectPaths(content: string, solutionDirectory: string): string[] {
  const projectPaths: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = slnxProjectRegex.exec(content)) !== null) {
    projectPaths.push(path.resolve(solutionDirectory, match[1]));
  }

  return projectPaths;
}
