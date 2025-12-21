import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TaskManifest, DashboardState, Repository, WorkLog } from './types';

/**
 * Manages data storage for DevLoop extension
 * Uses VS Code's globalStorageUri for cross-workspace data persistence
 */
export class DataManager {
    private dataPath: string;
    private workspacesPath: string;
    private currentWorkspaceHash: string;

    constructor(private readonly context: vscode.ExtensionContext) {
        const config = vscode.workspace.getConfiguration('devloop');
        const customPath = config.get<string>('storage.path');

        if (customPath && customPath.trim() !== '') {
            this.dataPath = path.join(customPath, 'devloop_storage');
        } else {
            this.dataPath = context.globalStorageUri.fsPath;
        }

        this.workspacesPath = path.join(this.dataPath, 'workspaces');
        this.currentWorkspaceHash = this.getWorkspaceHash();
    }

    /**
     * Get the configured tool name
     */
    private getToolName(): string {
        return vscode.workspace.getConfiguration('devloop').get<string>('branding.name') || 'DevLoop';
    }

    /**
     * Initialize data directory structure
     */
    async initialize(): Promise<void> {
        // Create main data directory
        await this.ensureDirectory(this.dataPath);
        await this.ensureDirectory(this.workspacesPath);
        await this.ensureDirectory(this.getWorkspaceDataPath());

        console.log(`${this.getToolName()}: Data directory initialized at ${this.dataPath}`);
    }

    /**
     * Get hash of current workspace for unique folder naming
     */
    private getWorkspaceHash(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return 'no-workspace';
        }

        // Create a simple hash from workspace paths
        const paths = workspaceFolders.map(f => f.uri.fsPath).sort().join('|');
        let hash = 0;
        for (let i = 0; i < paths.length; i++) {
            const char = paths.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        // Use first folder name + hash for readability
        const firstName = path.basename(workspaceFolders[0].uri.fsPath);
        return `${firstName}-${Math.abs(hash).toString(16)}`;
    }

    /**
     * Get path to current workspace's data folder
     */
    getWorkspaceDataPath(): string {
        return path.join(this.workspacesPath, this.currentWorkspaceHash);
    }

    /**
     * Get path to active context file
     */
    getActiveContextPath(): string {
        return path.join(this.getWorkspaceDataPath(), 'active_context.json');
    }

    /**
     * Get path to manifest file for a ticket
     */
    getManifestPath(ticketId: string): string {
        const sanitizedId = ticketId.replace(/[^a-zA-Z0-9-_]/g, '_');
        return path.join(this.getWorkspaceDataPath(), `ticket-${sanitizedId}-manifest.json`);
    }

    /**
     * Ensure directory exists
     */
    private async ensureDirectory(dirPath: string): Promise<void> {
        try {
            await fs.promises.mkdir(dirPath, { recursive: true });
        } catch (error) {
            // Directory might already exist
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
                throw error;
            }
        }
    }

    /**
     * Read JSON file with error handling
     */
    async readJson<T>(filePath: string): Promise<T | null> {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return JSON.parse(content) as T;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return null;
            }
            console.error(`${this.getToolName()}: Error reading ${filePath}:`, error);
            return null;
        }
    }

    /**
     * Write JSON file atomically
     */
    async writeJson<T>(filePath: string, data: T): Promise<void> {
        const tempPath = `${filePath}.tmp`;
        try {
            const content = JSON.stringify(data, null, 2);
            await fs.promises.writeFile(tempPath, content, 'utf-8');
            await fs.promises.rename(tempPath, filePath);
        } catch (error) {
            // Clean up temp file if exists
            try {
                await fs.promises.unlink(tempPath);
            } catch {
                // Ignore cleanup errors
            }
            throw error;
        }
    }

    /**
     * Read task manifest for a ticket
     */
    async readManifest(ticketId: string): Promise<TaskManifest | null> {
        return this.readJson<TaskManifest>(this.getManifestPath(ticketId));
    }

    /**
     * Write task manifest
     */
    async writeManifest(manifest: TaskManifest): Promise<void> {
        await this.writeJson(this.getManifestPath(manifest.ticketId), manifest);
    }

    /**
     * Get active context (current ticket, etc.)
     */
    async getActiveContext(): Promise<{ ticketId: string | null; manifestPath: string | null }> {
        const context = await this.readJson<{ ticketId: string; manifestPath: string }>(
            this.getActiveContextPath()
        );
        return context || { ticketId: null, manifestPath: null };
    }

    /**
     * Set active context
     */
    async setActiveContext(ticketId: string | null): Promise<void> {
        const contextPath = this.getActiveContextPath();
        if (ticketId === null) {
            try {
                await fs.promises.unlink(contextPath);
            } catch {
                // File might not exist
            }
        } else {
            await this.writeJson(contextPath, {
                ticketId,
                manifestPath: this.getManifestPath(ticketId),
                updatedAt: new Date().toISOString()
            });
        }
    }

    /**
     * Create a new task manifest
     */
    createManifest(ticketId: string, ticketSummary: string, repos: Repository[]): TaskManifest {
        const repoEntries: Record<string, any> = {};
        
        for (const repo of repos) {
            repoEntries[repo.name] = {
                mode: repo.mode,
                branch: repo.currentBranch,
                baseBranch: repo.baseBranch,
                createdAt: new Date().toISOString()
            };
        }

        return {
            ticketId,
            ticketSummary,
            startedAt: new Date().toISOString(),
            startedBy: this.getCurrentUser(),
            status: 'active',
            repos: repoEntries,
            logs: [],
            totalLoggedTime: 0,
            lastUpdated: new Date().toISOString()
        };
    }

    /**
     * Add a work log to a ticket manifest
     */
    async addLog(ticketId: string, log: WorkLog): Promise<void> {
        const manifest = await this.readManifest(ticketId);
        if (manifest) {
            manifest.logs.push(log);
            manifest.totalLoggedTime += log.duration;
            manifest.lastUpdated = new Date().toISOString();
            await this.writeManifest(manifest);
        }
    }

    /**
     * Get unsynced logs for a ticket
     */
    async getUnsyncedLogs(ticketId: string): Promise<WorkLog[]> {
        const manifest = await this.readManifest(ticketId);
        if (!manifest) return [];
        return manifest.logs.filter(l => !l.synced);
    }

    /**
     * Mark logs as synced
     */
    async markLogsSynced(ticketId: string, logIds: string[]): Promise<void> {
        const manifest = await this.readManifest(ticketId);
        if (manifest) {
            let updated = false;
            for (const log of manifest.logs) {
                if (logIds.includes(log.id)) {
                    log.synced = true;
                    log.syncedAt = new Date().toISOString();
                    updated = true;
                }
            }
            if (updated) {
                await this.writeManifest(manifest);
            }
        }
    }

    /**
     * Get current user (from Git config or environment)
     */
    private getCurrentUser(): string {
        return process.env.USER || process.env.USERNAME || 'unknown';
    }

    /**
     * Clear all data for current workspace
     */
    async clearWorkspaceData(): Promise<void> {
        const workspacePath = this.getWorkspaceDataPath();
        try {
            const files = await fs.promises.readdir(workspacePath);
            for (const file of files) {
                await fs.promises.unlink(path.join(workspacePath, file));
            }
            console.log(`${this.getToolName()}: Workspace data cleared`);
        } catch (error) {
            console.error(`${this.getToolName()}: Error clearing workspace data:`, error);
        }
    }

    /**
     * List all manifests in current workspace
     */
    async listManifests(): Promise<string[]> {
        try {
            const files = await fs.promises.readdir(this.getWorkspaceDataPath());
            return files
                .filter(f => f.startsWith('ticket-') && f.endsWith('-manifest.json'))
                .map(f => f.replace('ticket-', '').replace('-manifest.json', ''));
        } catch {
            return [];
        }
    }

    /**
     * Get recent completed tasks
     */
    async getRecentTasks(limit: number = 10): Promise<import('./types').RecentTask[]> {
        const ids = await this.listManifests();
        const tasks: import('./types').RecentTask[] = [];

        for (const id of ids) {
            const manifest = await this.readManifest(id);
            if (!manifest) continue;
            
            // Include if completed, active, or if there is time logged
            if (manifest.status === 'completed' || manifest.status === 'active' || manifest.totalLoggedTime > 0) {
                // Determine display date (last updated or started)
                const displayDate = manifest.lastUpdated || manifest.startedAt;
                
                tasks.push({
                    ticketId: manifest.ticketId,
                    summary: manifest.ticketSummary,
                    completedAt: displayDate,
                    totalTime: Math.floor(manifest.totalLoggedTime)
                });
            }
        }

        // Sort by date desc
        return tasks.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()).slice(0, limit);
    }
    /**
     * Get total time for a specific ticket (in minutes)
     */
    async getTicketTotalTime(ticketId: string): Promise<number> {
        const manifest = await this.readManifest(ticketId);
        if (!manifest) {
            return 0;
        }
        return Math.floor(manifest.totalLoggedTime);
    }

    /**
     * Get aggregated history statistics
     */
    async getHistoryStats(): Promise<{ today: number; thisWeek: number }> {
        const ids = await this.listManifests();
        let todayMinutes = 0;
        let weekMinutes = 0;
        
        const now = new Date();
        const todayStr = now.toDateString();
        
        // Calculate Start of Week (Monday)
        const startOfWeek = new Date(now);
        const day = startOfWeek.getDay(); // 0 (Sun) to 6 (Sat)
        // If Sunday (0), go back 6 days to Monday. If Mon (1), go back 0 days.
        // Formula: date - (day === 0 ? 6 : day - 1)
        const diff = startOfWeek.getDate() - (day === 0 ? 6 : day - 1);
        startOfWeek.setDate(diff);
        startOfWeek.setHours(0, 0, 0, 0);

        for (const id of ids) {
            const manifest = await this.readManifest(id);
            if (!manifest) continue;

            const logs = manifest.logs || [];
            for (const log of logs) {
                if (!log.endTime) continue;
                const logDate = new Date(log.endTime);
                
                // Today check
                if (logDate.toDateString() === todayStr) {
                    todayMinutes += log.duration;
                }
                
                // Week check
                if (logDate >= startOfWeek) {
                    weekMinutes += log.duration;
                }
            }
        }

        return {
            today: Math.floor(todayMinutes),
            thisWeek: Math.floor(weekMinutes)
        };
    }
}
