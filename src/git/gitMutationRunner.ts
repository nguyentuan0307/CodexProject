import * as vscode from 'vscode';
import { GitMutationRequest } from './gitPanelModels';
import { GitRepositoryService } from './gitRepositoryService';

export class GitMutationRunner {
  constructor(private readonly service: GitRepositoryService) {}

  async run(root: string, request: GitMutationRequest): Promise<boolean> {
    if ((historyRewriteActions.has(request.action) || request.action === 'update' && request.options?.strategy === 'reset') && await this.isProtected(root)) {
      throw new Error('This operation is blocked because the current branch matches a protected branch pattern.');
    }
    if (destructiveActions.has(request.action) && !await confirmDestructive(request)) return false;
    const args = await this.argumentsFor(root, request);
    if (!args) return false;
    return vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Git: ${labelFor(request.action)}`,
      cancellable: true
    }, async (_progress, token) => {
      await this.service.git(root, args, token);
      await vscode.commands.executeCommand('git.refresh');
      return true;
    });
  }

  private async argumentsFor(root: string, request: GitMutationRequest): Promise<string[] | undefined> {
    const ref = request.ref ?? request.hash ?? '';
    switch (request.action) {
      case 'fetch': return ['fetch', '--all', '--prune'];
      case 'pull': return ['pull', request.options?.rebase ? '--rebase' : '--no-rebase'];
      case 'update': {
        await this.service.git(root, ['fetch', '--all', '--prune']);
        if (request.options?.strategy === 'reset') {
          const snapshot = await this.service.snapshot(root);
          if (!snapshot.upstream) throw new Error('The current branch has no upstream branch.');
          return ['reset', '--hard', snapshot.upstream];
        }
        return ['pull', request.options?.strategy === 'rebase' ? '--rebase' : '--no-rebase'];
      }
      case 'push': return ['push', ...(request.options?.forceLease ? ['--force-with-lease'] : []), ...(request.options?.tags ? ['--tags'] : [])];
      case 'checkout': return this.checkoutArgs(root, ref);
      case 'checkoutRemote': return ['switch', '--track', ref];
      case 'createBranch': return request.options?.checkout === false
        ? ['branch', String(request.options?.name), ref || 'HEAD']
        : ['switch', '-c', String(request.options?.name), ref || 'HEAD'];
      case 'renameBranch': return ['branch', '-m', ref, String(request.options?.name)];
      case 'deleteBranch': return ['branch', request.options?.force ? '-D' : '-d', ref];
      case 'deleteRemote': return ['push', String(request.options?.remote), '--delete', ref];
      case 'merge': return ['merge', ...(request.options?.noFf ? ['--no-ff'] : []), ...(request.options?.squash ? ['--squash'] : []), ref];
      case 'rebase': return ['rebase', ref];
      case 'cherryPick': return ['cherry-pick', ...(request.options?.noCommit ? ['--no-commit'] : []), ...(request.hashes ?? [ref])];
      case 'revert': return ['revert', ...(request.hashes ?? [ref])];
      case 'undoCommit': return ['reset', '--soft', 'HEAD^'];
      case 'reset': return ['reset', `--${String(request.options?.mode ?? 'mixed')}`, ref];
      case 'stash': return ['stash', 'push', ...(request.options?.includeUntracked ? ['--include-untracked'] : []), ...(request.options?.keepIndex ? ['--keep-index'] : []), '-m', String(request.options?.message ?? '')];
      case 'stashApply': return ['stash', 'apply', ref];
      case 'stashPop': return ['stash', 'pop', ref];
      case 'stashDrop': return ['stash', 'drop', ref];
      case 'stashBranch': return ['stash', 'branch', String(request.options?.name), ref];
      case 'tag': return ['tag', ...(request.options?.message ? ['-a', '-m', String(request.options.message)] : []), String(request.options?.name), ref];
      case 'deleteTag': return ['tag', '-d', ref];
      case 'pushBranch': return ['push', '-u', String(request.options?.remote ?? 'origin'), ref];
      case 'rollbackFile': return ['restore', '--staged', '--worktree', '--', String(request.path)];
      case 'getFile': return ['restore', '--source', ref, '--', String(request.path)];
      case 'continue': return operationCommand(request.options?.operation, '--continue');
      case 'abort': return operationCommand(request.options?.operation, '--abort');
      case 'skip': return operationCommand(request.options?.operation, '--skip');
      default: throw new Error(`Unsupported Git action: ${request.action}`);
    }
  }

  private async isProtected(root: string): Promise<boolean> {
    const branch = (await this.service.snapshot(root)).head;
    const patterns = vscode.workspace.getConfiguration('dotnetSolutionNavigator.gitLog')
      .get<string[]>('protectedBranches', ['main', 'master', 'develop', 'release/*']);
    return patterns.some(pattern => new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`).test(branch));
  }

  private async checkoutArgs(root: string, ref: string): Promise<string[] | undefined> {
    const snapshot = await this.service.snapshot(root);
    if (!snapshot.changedCount) return ['switch', ref];
    const choice = await vscode.window.showWarningMessage(
      `Checkout ${ref} while ${snapshot.changedCount} working tree file(s) have changes. Discarding may permanently lose work.`,
      { modal: true }, 'Stash & Checkout', 'Discard Changes & Checkout'
    );
    if (choice === 'Stash & Checkout') {
      await this.service.git(root, ['stash', 'push', '--include-untracked', '-m', `Auto stash before checkout ${ref}`]);
      return ['switch', ref];
    }
    return choice === 'Discard Changes & Checkout' ? ['switch', '--discard-changes', ref] : undefined;
  }
}

const destructiveActions = new Set(['deleteRemote', 'stashDrop', 'rollbackFile', 'getFile', 'undoCommit', 'reset']);
const historyRewriteActions = new Set(['undoCommit', 'reset', 'dropCommit']);

async function confirmDestructive(request: GitMutationRequest): Promise<boolean> {
  const detail: Record<string, string> = {
    deleteRemote: `Remote branch ${request.ref} will be deleted for every collaborator.`,
    stashDrop: `${request.ref} will be permanently removed.`,
    rollbackFile: `All uncommitted changes in ${request.path} will be permanently discarded.`,
    getFile: `${request.path} in the working tree will be overwritten.`,
    undoCommit: 'The HEAD commit will be removed and its changes moved to the index.',
    reset: `The current branch will be reset to ${request.ref}. Hard mode permanently discards local changes.`
  };
  return await vscode.window.showWarningMessage(detail[request.action], { modal: true }, 'Continue') === 'Continue';
}

function operationCommand(operation: boolean | string | undefined, flag: string): string[] {
  const name = String(operation ?? '').toLowerCase();
  if (name.includes('rebas')) return ['rebase', flag];
  if (name.includes('cherry')) return ['cherry-pick', flag];
  if (name.includes('revert')) return ['revert', flag];
  return ['merge', flag];
}

function labelFor(action: string): string { return action.replace(/([A-Z])/g, ' $1').toLowerCase(); }
function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
