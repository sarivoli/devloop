import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Repository, RepoMode, RepoStatus } from './types';

/**
 * Mock repository data for development/testing
 */
const MOCK_REPOS: Repository[] = [
    {
        name: 'devloop-backend-api',
        path: 'C:/projects/devloop-backend-api',
        currentBranch: 'feature/JIRA-1234',
        baseBranch: 'main',
        mode: 'active',
        status: { state: 'clean' },
        hasUncommittedChanges: false,
        uncommittedFiles: 0,
        uncommittedLines: 0,
        lastCommitTime: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
    },
    {
        name: 'devloop-auth-service',
        path: 'C:/projects/devloop-auth-service',
        currentBranch: 'feature/JIRA-1234',
        baseBranch: 'main',
        mode: 'active',
        status: { state: 'dirty', message: '3 files modified' },
        hasUncommittedChanges: true,
        uncommittedFiles: 3,
        uncommittedLines: 45,
        lastCommitTime: new Date(Date.now() - 7200000).toISOString() // 2 hours ago
    },
    {
        name: 'devloop-common-utils',
        path: 'C:/projects/devloop-common-utils',
        currentBranch: 'main',
        baseBranch: 'main',
        mode: 'reference',
        status: { state: 'clean' },
        hasUncommittedChanges: false,
        uncommittedFiles: 0,
        uncommittedLines: 0
    }
];

/**
 * Manages Git operations across multiple repositories
 */
export class GitManager {
    private useMock: boolean;
    private outputChannel: vscode.OutputChannel;
    private gitExtension: vscode.Extension<any> | undefined;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        this.useMock = vscode.workspace.getConfiguration('devloop').get('useMockData', false);
        this.gitExtension = vscode.extensions.getExtension('vscode.git');
    }

    /**
     * Initialize Git extension access
     */
    async initialize(): Promise<boolean> {
        if (this.useMock) {
            this.log('Using mock Git data');
            return true;
        }

        if (!this.gitExtension) {
            this.log('Git extension not found');
            return false;
        }

        try {
            const git = this.gitExtension.isActive 
                ? this.gitExtension.exports 
                : await this.gitExtension.activate();
            return git !== undefined;
        } catch (error) {
            this.log(`Error initializing Git: ${error}`);
            return false;
        }
    }

    /**
     * Check if Git is available
     */
    async checkConnection(): Promise<{ connected: boolean; message: string }> {
        if (this.useMock) {
            return { connected: true, message: 'Mock mode active' };
        }

        const initialized = await this.initialize();
        if (initialized) {
            return { connected: true, message: 'Git configured' };
        }
        return { connected: false, message: 'Git extension not available' };
    }

    /**
     * Detect all Git repositories in workspace
     */
    async detectRepositories(): Promise<Repository[]> {
        if (this.useMock) {
            this.log('Returning mock repositories');
            return [...MOCK_REPOS];
        }

        const repos: Repository[] = [];
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders) {
            return repos;
        }

        for (const folder of workspaceFolders) {
            const gitDir = path.join(folder.uri.fsPath, '.git');
            try {
                const stat = await fs.promises.stat(gitDir);
                if (stat.isDirectory()) {
                    const repo = await this.getRepoInfo(folder.uri.fsPath);
                    if (repo) {
                        repos.push(repo);
                    }
                }
            } catch {
                // Not a git repository
            }
        }

        this.log(`Detected ${repos.length} repositories`);
        return repos;
    }

    /**
     * Get repository information
     */
    private async getRepoInfo(repoPath: string): Promise<Repository | null> {
        try {
            const name = path.basename(repoPath);
            const branch = await this.getCurrentBranch(repoPath);
            const status = await this.getStatus(repoPath);

            return {
                name,
                path: repoPath,
                currentBranch: branch || 'unknown',
                baseBranch: 'main',
                mode: 'inactive',
                status: { state: status.hasChanges ? 'dirty' : 'clean' },
                hasUncommittedChanges: status.hasChanges,
                uncommittedFiles: status.changedFiles,
                uncommittedLines: 0
            };
        } catch (error) {
            this.log(`Error getting repo info for ${repoPath}: ${error}`);
            return null;
        }
    }

    /**
     * Get current branch name
     */
    private async getCurrentBranch(repoPath: string): Promise<string | null> {
        const headPath = path.join(repoPath, '.git', 'HEAD');
        try {
            const content = await fs.promises.readFile(headPath, 'utf-8');
            const match = content.match(/ref: refs\/heads\/(.+)/);
            return match ? match[1].trim() : null;
        } catch {
            return null;
        }
    }

    /**
     * Get repository status (simplified)
     */
    private async getStatus(repoPath: string): Promise<{ hasChanges: boolean; changedFiles: number }> {
        // Simplified status check - in production would use Git API
        return { hasChanges: false, changedFiles: 0 };
    }

    /**
     * Create a feature branch in a repository from a base branch
     */
    async createFeatureBranch(
        repoPath: string,
        baseBranch: string,
        branchName: string
    ): Promise<{ success: boolean; branchName: string; error?: string }> {
        this.log(`Creating branch ${branchName} from ${baseBranch} in ${repoPath}`);

        if (this.useMock) {
            this.log(`[MOCK] Created branch ${branchName}`);
            return { success: true, branchName };
        }

        try {
            // Check if branch already exists
            const branches = await this.getBranches(repoPath);
            if (branches.includes(branchName)) {
                this.log(`Branch ${branchName} already exists, checking out...`);
                const checkout = await this.checkoutBranch(repoPath, branchName);
                return {
                    success: checkout,
                    branchName,
                    error: checkout ? undefined : 'Failed to checkout existing branch'
                };
            }

            // Create and checkout new branch
            const terminal = vscode.window.createTerminal({
                name: 'DevLoop Git',
                cwd: repoPath,
                hideFromUser: true
            });

            // Ensure we're on the base branch first
            terminal.sendText(`git checkout ${baseBranch}`);
            await new Promise(resolve => setTimeout(resolve, 500));

            // Create new branch
            terminal.sendText(`git checkout -b ${branchName}`);
            await new Promise(resolve => setTimeout(resolve, 500));

            terminal.dispose();

            this.log(`Successfully created branch ${branchName}`);
            return { success: true, branchName };
        } catch (error) {
            const errorMsg = `Error creating branch: ${error}`;
            this.log(errorMsg);
            return { success: false, branchName, error: errorMsg };
        }
    }

    /**
     * Get list of branches in repository
     */
    async getBranches(repoPath: string): Promise<string[]> {
        if (this.useMock) {
            return ['main', 'develop', 'feature/JIRA-1234'];
        }

        try {
            const branchesPath = path.join(repoPath, '.git', 'refs', 'heads');
            const files = await fs.promises.readdir(branchesPath, { recursive: true });
            return files.filter(f => typeof f === 'string') as string[];
        } catch (error) {
            this.log(`Error getting branches: ${error}`);
            return [];
        }
    }

    /**
     * Check if repository has uncommitted changes
     */
    async hasUncommittedChanges(repoPath: string): Promise<boolean> {
        if (this.useMock) {
            return false;
        }

        const status = await this.getStatus(repoPath);
        return status.hasChanges;
    }

    /**
     * Checkout existing branch
     */
    async checkoutBranch(repoPath: string, branchName: string): Promise<boolean> {
        this.log(`Checking out branch ${branchName} in ${repoPath}`);

        if (this.useMock) {
            this.log(`[MOCK] Checked out branch ${branchName}`);
            return true;
        }

        try {
            const terminal = vscode.window.createTerminal({
                name: 'DevLoop Git',
                cwd: repoPath,
                hideFromUser: true
            });

            terminal.sendText(`git checkout ${branchName}`);
            await new Promise(resolve => setTimeout(resolve, 500));
            terminal.dispose();

            return true;
        } catch (error) {
            this.log(`Error checking out branch: ${error}`);
            return false;
        }
    }

    /**
     * Commit changes in multiple repositories
     */
    async commitAll(repos: Repository[], message: string): Promise<{ success: string[]; failed: string[] }> {
        const results = { success: [] as string[], failed: [] as string[] };

        this.log(`Committing to ${repos.length} repositories: "${message}"`);

        for (const repo of repos) {
            if (repo.mode !== 'active') {
                continue;
            }

            if (this.useMock) {
                this.log(`[MOCK] Committed to ${repo.name}`);
                results.success.push(repo.name);
                continue;
            }

            try {
                // Would use Git API in production
                results.success.push(repo.name);
            } catch (error) {
                this.log(`Error committing to ${repo.name}: ${error}`);
                results.failed.push(repo.name);
            }
        }

        if (this.useMock) {
            vscode.window.showInformationMessage(
                `[Mock] Committed to ${results.success.length} repositories`
            );
        }

        return results;
    }

    /**
     * Push changes in multiple repositories
     */
    async pushAll(repos: Repository[]): Promise<{ success: string[]; failed: string[] }> {
        const results = { success: [] as string[], failed: [] as string[] };

        this.log(`Pushing ${repos.length} repositories`);

        for (const repo of repos) {
            if (repo.mode !== 'active') {
                continue;
            }

            if (this.useMock) {
                this.log(`[MOCK] Pushed ${repo.name}`);
                results.success.push(repo.name);
                continue;
            }

            try {
                // Would use Git API in production
                results.success.push(repo.name);
            } catch (error) {
                this.log(`Error pushing ${repo.name}: ${error}`);
                results.failed.push(repo.name);
            }
        }

        if (this.useMock) {
            vscode.window.showInformationMessage(
                `[Mock] Pushed ${results.success.length} repositories`
            );
        }

        return results;
    }

    /**
     * Update repository mode
     */
    updateRepoMode(repos: Repository[], repoName: string, mode: RepoMode): Repository[] {
        return repos.map(repo => {
            if (repo.name === repoName) {
                return { ...repo, mode };
            }
            return repo;
        });
    }

    /**
     * Log message to output channel
     */
    private log(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] [Git] ${message}`);
    }
}
