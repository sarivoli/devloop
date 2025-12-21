import * as vscode from 'vscode';
import { Repository } from './types';

/**
 * Selected repository with base branch information
 */
export interface SelectedRepository {
    repo: Repository;
    baseBranch: string;
    featureBranchName: string;
}

/**
 * Handles repository selection UI and logic for task initialization
 */
export class RepositorySelector {
    constructor(private readonly outputChannel: vscode.OutputChannel) {}

    /**
     * Show repository selection UI with multi-select
     */
    async selectRepositories(
        repos: Repository[],
        ticketId: string
    ): Promise<SelectedRepository[] | undefined> {
        if (repos.length === 0) {
            vscode.window.showWarningMessage('No repositories found in workspace');
            return undefined;
        }

        // Create quick pick items
        const items: vscode.QuickPickItem[] = repos.map(repo => ({
            label: repo.name,
            description: `[${repo.currentBranch}]`,
            detail: repo.status.state === 'clean' 
                ? '✓ Clean' 
                : `⚠ ${repo.uncommittedFiles || 0} uncommitted file${repo.uncommittedFiles !== 1 ? 's' : ''}`,
            picked: true // Default to all selected
        }));

        // Show multi-select quick pick
        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: 'Select repositories to include in this task',
            title: `Start Task: ${ticketId}`,
            ignoreFocusOut: true
        });

        if (!selected || selected.length === 0) {
            return undefined;
        }

        // Get selected repositories
        const selectedRepos = repos.filter(repo => 
            selected.some(item => item.label === repo.name)
        );

        // Validate and get base branch for each selected repo
        const result: SelectedRepository[] = [];
        
        for (const repo of selectedRepos) {
            // Validate repository state
            const validation = await this.validateRepositoryState(repo);
            if (!validation.valid) {
                const action = await vscode.window.showWarningMessage(
                    `Repository "${repo.name}": ${validation.message}`,
                    'Continue Anyway',
                    'Skip Repository',
                    'Cancel'
                );

                if (action === 'Cancel') {
                    return undefined;
                } else if (action === 'Skip Repository') {
                    continue;
                }
            }

            // Get base branch
            const baseBranch = await this.selectBaseBranch(
                repo.path,
                repo.currentBranch
            );

            if (!baseBranch) {
                vscode.window.showWarningMessage(`Skipping repository: ${repo.name}`);
                continue;
            }

            // Generate feature branch name
            const branchPrefix = vscode.workspace
                .getConfiguration('devloop')
                .get<string>('git.branchPrefix', 'feature/');
            const featureBranchName = `${branchPrefix}${ticketId}`;

            result.push({
                repo,
                baseBranch,
                featureBranchName
            });
        }

        return result.length > 0 ? result : undefined;
    }

    /**
     * Prompt for base branch selection
     */
    async selectBaseBranch(
        repoPath: string,
        currentBranch: string
    ): Promise<string | undefined> {
        const defaultBranch = vscode.workspace
            .getConfiguration('devloop')
            .get<string>('git.defaultBaseBranch', 'main');

        // Common base branch options
        const commonBranches = ['main', 'master', 'develop', 'dev'];
        
        // Add current branch if not in common list
        if (!commonBranches.includes(currentBranch)) {
            commonBranches.push(currentBranch);
        }

        const items: vscode.QuickPickItem[] = commonBranches.map(branch => ({
            label: branch,
            description: branch === defaultBranch ? '(default)' : '',
            picked: branch === defaultBranch
        }));

        // Add option to enter custom branch
        items.push({
            label: '$(edit) Enter custom branch name...',
            description: 'Type a different branch name'
        });

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select base branch for feature branch',
            title: `Repository: ${repoPath.split(/[\\/]/).pop()}`,
            ignoreFocusOut: true
        });

        if (!selected) {
            return undefined;
        }

        // Handle custom branch input
        if (selected.label.includes('Enter custom')) {
            const customBranch = await vscode.window.showInputBox({
                prompt: 'Enter base branch name',
                placeHolder: 'e.g., main, develop, release/v1.0',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Branch name cannot be empty';
                    }
                    if (value.includes(' ')) {
                        return 'Branch name cannot contain spaces';
                    }
                    return null;
                }
            });
            return customBranch;
        }

        return selected.label;
    }

    /**
     * Validate repository is in a good state for task start
     */
    async validateRepositoryState(
        repo: Repository
    ): Promise<{ valid: boolean; message: string }> {
        // Check for uncommitted changes
        if (repo.status.state !== 'clean') {
            const count = repo.uncommittedFiles || 0;
            return {
                valid: false,
                message: `Has ${count} uncommitted file${count !== 1 ? 's' : ''}. Please commit or stash changes first.`
            };
        }

        // Additional validations can be added here
        // - Check if repository is up to date with remote
        // - Check if repository has conflicts
        // - Check if repository is in detached HEAD state

        return {
            valid: true,
            message: 'Repository is ready'
        };
    }

    /**
     * Log to output channel
     */
    private log(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] [RepoSelector] ${message}`);
    }
}
