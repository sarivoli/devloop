import * as vscode from 'vscode';
import { DashboardState, Repository, LintingResult, ConfigKey, ActivityItem, TimeTrackerState } from './types';

/**
 * Mock data for dashboard panels that aren't fully implemented yet
 */
const MOCK_LINTING_RESULTS: LintingResult[] = [
    { tool: 'pep8', severity: 'error', file: 'auth_controller.py', line: 45, message: 'Line too long (140 > 120)', canFix: true },
    { tool: 'pep8', severity: 'error', file: 'user_service.py', line: 12, message: 'Undefined variable', canFix: false },
    { tool: 'pyflakes', severity: 'warning', file: 'config.py', line: 78, message: 'Use of print statement (Py2)', canFix: true },
    { tool: 'eslint', severity: 'warning', file: 'api.js', line: 23, message: 'Unexpected var, use let or const', canFix: true }
];

const MOCK_CONFIG_KEYS: ConfigKey[] = [
    { key: 'database.timeout', occurrences: [], referenceCount: 3 },
    { key: 'cache.redis.host', occurrences: [], referenceCount: 2 },
    { key: 'auth.token.expiry', occurrences: [], referenceCount: 5 }
];

const MOCK_ACTIVITY: ActivityItem[] = [
    { id: '1', type: 'comment', message: 'Comment sent to JIRA-1234', timestamp: new Date(Date.now() - 3600000).toISOString() },
    { id: '2', type: 'jenkins', message: 'Jenkins job #4521 started', timestamp: new Date(Date.now() - 7200000).toISOString() },
    { id: '3', type: 'commit', message: 'Committed to 2 repositories', timestamp: new Date(Date.now() - 10800000).toISOString() }
];

/**
 * Webview Sidebar Provider for DevLoop Dashboard
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;
    private dashboardState: DashboardState;
    private onMessageCallback?: (message: any) => void;

    constructor(private readonly _extensionUri: vscode.Uri) {
        // Initialize with default state
        this.dashboardState = {
            toolName: 'DevLoop',
            activeTicket: null,
            projectHealth: {
                jira: { connected: false, message: 'Not configured' },
                git: { connected: false, message: 'Checking...' },
                jenkins: { connected: false, message: 'Not configured' }
            },
            timeTracker: {
                isRunning: false,
                isPaused: false,
                currentTicketId: null,
                elapsedSeconds: 0,
                sessionStartTime: null
            },
            repositories: [],
            lintingResults: MOCK_LINTING_RESULTS,
            configKeys: MOCK_CONFIG_KEYS,
            activityStream: MOCK_ACTIVITY,
            activeTicketTotalTime: 0,
            recentTasks: [],
            historyStats: { today: 0, thisWeek: 0 }
        };
    }

    /**
     * Set callback for webview messages
     */
    onMessage(callback: (message: any) => void): void {
        this.onMessageCallback = callback;
    }

    /**
     * Update dashboard state and refresh UI
     */
    updateState(partial: Partial<DashboardState>): void {
        this.dashboardState = { ...this.dashboardState, ...partial };
        this.refresh();
    }

    /**
     * Update time tracker display
     */
    updateTimeTracker(state: TimeTrackerState): void {
        this.dashboardState.timeTracker = state;
        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateTimer',
                payload: state
            });
        }
    }

    /**
     * Refresh the webview content
     */
    refresh(): void {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    /**
     * Resolve the webview view
     */
    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            if (this.onMessageCallback) {
                this.onMessageCallback(data);
            }

            // Handle common message types
            switch (data.type) {
                case 'info':
                    vscode.window.showInformationMessage(data.value);
                    break;
                case 'error':
                    vscode.window.showErrorMessage(data.value);
                    break;
                case 'log':
                    console.log(`DevLoop Webview: ${data.value}`);
                    break;
            }
        });
    }

    public revive(panel: vscode.WebviewView) {
        this._view = panel;
    }

    /**
     * Generate HTML for the webview
     */
    private _getHtmlForWebview(webview: vscode.Webview) {
        const styleResetUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css')
        );
        const styleVSCodeUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css')
        );
        const styleMainUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js')
        );
        const toolkitUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'webview-ui-toolkit', 'dist', 'toolkit.min.js')
        );

        const nonce = getNonce();
        const state = this.dashboardState;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval'; font-src ${webview.cspSource};">
    <link href="${styleResetUri}" rel="stylesheet">
    <link href="${styleVSCodeUri}" rel="stylesheet">
    <link href="${styleMainUri}" rel="stylesheet">
    <script type="module" nonce="${nonce}" src="${toolkitUri}"></script>
    <script nonce="${nonce}">
        // Make vscode API and state available globally before main.js loads
        window.vscode = acquireVsCodeApi();
        window.dashboardState = ${JSON.stringify(state)};
        console.log('DevLoop: vscode API and state initialized');
    </script>
</head>
<body>
    <div class="container">
        <!-- Brand Header (New) -->
        <header class="brand-header">
            <h1 class="brand-title">${state.toolName || 'DevLoop'}</h1>
            <div class="brand-badge">DWM</div>
        </header>

        <!-- Unified Task Panel (Sticky) -->
        <section class="widget task-panel sticky-panel" id="task-panel">
            <div class="widget-body">
                <!-- Tab Navigation -->
                <div class="tab-nav">
                    <div class="tab active" data-tab="active-task" onclick="switchTab('active-task')">
                        <span>Active Task</span>
                    </div>
                    <div class="tab" data-tab="history" onclick="switchTab('history')">
                        <span>History</span>
                    </div>
                    <div class="tab" data-tab="jira-config" onclick="switchTab('jira-config')">
                        <span>Config</span>
                        ${this.renderJiraConfigIndicator()}
                    </div>
                </div>

                <!-- Tab Content -->
                <div class="tab-content">
                    <!-- Active Task Tab (Default) -->
                    <div class="tab-pane active" id="tab-active-task">
                        ${this.renderActiveTaskTab()}
                    </div>

                    <!-- History Tab -->
                    <div class="tab-pane" id="tab-history">
                        ${this.renderHistoryTab()}
                    </div>

                    <!-- Jira Configuration Tab -->
                    <div class="tab-pane" id="tab-jira-config">
                        ${this.renderJiraConfig()}
                    </div>
                </div>
            </div>
        </section>



        <!-- Linting Hub Widget -->
        <section class="widget" id="linting-hub">
            <div class="widget-header" onclick="toggleWidget('linting-hub')">
                <span>🐛 Linting Hub</span>
                <vscode-badge>${state.lintingResults.length}</vscode-badge>
                <span class="chevron">▼</span>
            </div>
            <div class="widget-body">
                ${this.renderLintingHub()}
            </div>
        </section>

        <!-- Repository Workspace Widget -->
        <section class="widget" id="repo-workspace">
            <div class="widget-header" onclick="toggleWidget('repo-workspace')">
                <span>📂 Repository Workspace</span>
                <span class="chevron">▼</span>
            </div>
            <div class="widget-body">
                ${this.renderRepoWorkspace()}
            </div>
        </section>

        <!-- Activity Log Widget -->
        <section class="widget" id="activity-stream">
            <div class="widget-header" onclick="toggleWidget('activity-stream')">
                <span>📋 Activity Log</span>
                <span class="chevron">▼</span>
            </div>
            <div class="widget-body">
                ${this.renderActivityStream()}
            </div>
        </section>
    </div>

    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    /**
     * Render Jira Configuration Indicator
     */
    private renderJiraConfigIndicator(): string {
        const health = this.dashboardState.projectHealth.jira;
        
        if (health.connected) {
            return '<span class="jira-indicator indicator-linked" title="Connected">🔗</span>';
        }
        
        if (health.message.toLowerCase().includes('error') || health.message.toLowerCase().includes('failed')) {
            return '<span class="jira-indicator flash-red" title="Connection Error">🔴</span>';
        }

        return '<span class="jira-indicator indicator-broken" title="Not Configured">🔗-</span>';
    }

    /**
     * Render Jira Configuration section
     */
    private renderJiraConfig(): string {
        const health = this.dashboardState.projectHealth.jira;
        const useMock = this.dashboardState.projectHealth.jira.message.includes('Mock');
        
        // Mock Mode Display
        if (useMock) {
             return `
                <div class="config-warning">
                    <div class="status-row">
                        <span class="status-dot yellow"></span>
                        <span>Mock Mode Active</span>
                    </div>
                    <p class="text-muted" style="margin: 8px 0; font-size: 11px;">
                        Using local mock data. Disable "devloop.useMockData" in settings to connect to real Jira.
                    </p>
                    <vscode-button appearance="secondary" onclick="sendMessage('openSettings', 'devloop.useMockData')" style="width: 100%;">
                        Disable Mock Mode
                    </vscode-button>
                </div>
            `;
        }

        if (health.connected) {
            const baseUrl = vscode.workspace.getConfiguration('devloop').get<string>('jira.baseUrl') || '';
            const email = vscode.workspace.getConfiguration('devloop').get<string>('jira.email') || '';
            
            return `
                <div class="config-success">
                    <div class="status-row">
                        <span class="status-dot green"></span>
                        <span>Connected</span>
                    </div>
                    <div class="config-details">
                        <div class="config-item">
                            <span class="config-label">URL:</span>
                            <span class="config-value">${baseUrl || 'Not set'}</span>
                        </div>
                        <div class="config-item">
                            <span class="config-label">Email:</span>
                            <span class="config-value">${email || 'Not set'}</span>
                        </div>
                         <div class="config-item">
                            <span class="config-label">Token:</span>
                            <span class="config-value">••••••••</span>
                        </div>
                    </div>
                    <div class="action-buttons">
                        <vscode-button appearance="secondary" onclick="sendMessage('validateJira')">Validate</vscode-button>
                        <vscode-button appearance="secondary" onclick="sendMessage('configureJira')">Settings</vscode-button>
                    </div>
                </div>
            `;
        }

        // Not configured or Disconnected
        return `
            <div class="config-warning">
                <div class="status-row">
                    <span class="status-dot red"></span>
                    <span>${health.message || 'Not configured'}</span>
                </div>
                <p class="text-muted" style="margin: 12px 0; font-size: 11px;">
                    Configure Jira to enable ticket tracking, time logging, and automated comments.
                </p>
                <div class="action-buttons">
                    <vscode-button onclick="sendMessage('configureJira')" style="width: 100%;">
                        Configure Jira
                    </vscode-button>
                </div>
                <p class="text-muted" style="margin-top: 8px; font-size: 10px; text-align: center;">
                    After configuring, click "Validate" to test connection
                </p>
            </div>
        `;
    }

    /**
     * Render Active Ticket section
     */
    private renderActiveTicket(): string {
        const ticket = this.dashboardState.activeTicket;
        
        if (!ticket) {
            return `
                <div class="empty-state">
                    <p>No active ticket</p>
                    <vscode-button onclick="sendMessage('startTask')">Start New Task</vscode-button>
                </div>
            `;
        }

        return `
            <div class="ticket-info">
                <div class="ticket-id">${ticket.key}</div>
                <div class="ticket-title">${ticket.summary}</div>
                <div class="ticket-meta">
                    <span>📊 ${ticket.status.name}</span>
                    <span>👤 ${ticket.assignee || 'Unassigned'}</span>
                </div>
            </div>
            <vscode-button appearance="secondary" data-msg-type="endTask" style="width: 100%;">
                End Task & Log Time
            </vscode-button>
        `;
    }

    /**
     * Render Active Task Tab (combines ticket info + timer)
     */
    private renderActiveTaskTab(): string {
        const ticket = this.dashboardState.activeTicket;
        const timer = this.dashboardState.timeTracker;
        const formattedTime = this.formatTime(timer.elapsedSeconds);
        const totalTime = this.dashboardState.activeTicketTotalTime || 0;

        if (!ticket) {
            return `
                <div class="empty-state">
                    <p class="text-muted" style="margin: 16px 0;">No active task</p>
                    <vscode-button data-msg-type="startTask" style="width: 100%;">
                        Start New Task
                    </vscode-button>
                </div>
            `;
        }

        return `
            <div class="active-task-container">
                <!-- Task Info -->
                <div class="task-info" style="margin-bottom: 16px; padding: 4px;">
                    <!-- Metadata Row: ID | Status | Time -->
                    <div class="task-meta-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 12px;">
                        <div class="task-key" style="color: var(--vscode-textLink-foreground); font-weight: 500;">
                            ${ticket.key}
                        </div>
                        <div class="right-meta" style="display: flex; gap: 12px;">
                             <div class="meta-item status-item" style="color: var(--vscode-foreground);">
                                 <span>🏷️ ${ticket.status.name}</span>
                             </div>
                             <div class="meta-item time-item" style="color: var(--vscode-charts-blue); font-weight: bold;">
                                <span>⏱️ ${Math.floor(totalTime / 60)}h ${totalTime % 60}m</span>
                             </div>
                        </div>
                    </div>

                    <!-- Summary -->
                    <p class="task-summary" style="margin: 0; font-size: 13px; font-weight: 600; line-height: 1.4; color: var(--vscode-foreground);">
                        ${ticket.summary}
                    </p>
                </div>

                <!-- Timer Display -->
                <div class="timer-section" style="background: var(--vscode-editor-inactiveSelectionBackground); padding: 4px; border-radius: 4px; margin-bottom: 8px; text-align: center;">
                    <div class="time-display ${timer.isPaused ? 'paused' : timer.isRunning ? 'active' : 'inactive'}" id="timer-display" style="margin-bottom: 4px;">
                        ${formattedTime}
                    </div>
                    <div class="time-controls" style="display: flex; justify-content: center; gap: 4px;">
                        ${timer.isRunning ? `
                            ${timer.isPaused 
                                ? '<vscode-button appearance="secondary" data-msg-type="resumeTimer">Resume</vscode-button>'
                                : '<vscode-button appearance="secondary" data-msg-type="pauseTimer">Pause</vscode-button>'
                            }
                            <vscode-button appearance="secondary" data-msg-type="stopTimer">Stop</vscode-button>
                        ` : `
                            <vscode-button appearance="primary" data-msg-type="startTimer">Start</vscode-button>
                        `}
                    </div>
                </div>

                <!-- Task Actions -->
                <div class="task-actions">
                    <vscode-button data-msg-type="endTask" style="width: 100%; margin-bottom: 8px;">
                        End Task & Log Time
                    </vscode-button>
                    <vscode-button appearance="secondary" data-msg-type="cancelTask" style="width: 100%;">
                        Reset/Cancel Task
                    </vscode-button>
                </div>
            </div>
        `;
    }



    /**
     * Render History Stats Card
     */
    private renderHistoryStats(): string {
        const stats = this.dashboardState.historyStats || { today: 0, thisWeek: 0 };
        return `
            <div class="stats-container" style="display: flex; gap: 8px; margin-bottom: 12px;">
                <div class="stat-card" style="flex: 1; background: var(--vscode-widget-shadow); padding: 12px; border-radius: 4px; text-align: center;">
                    <div class="stat-value" style="font-size: 18px; color: #4ec9b0; font-weight: 600;">${Math.floor(stats.thisWeek / 60)}h ${stats.thisWeek % 60}m</div>
                    <div class="stat-label" style="font-size: 10px; color: var(--vscode-descriptionForeground); text-transform: uppercase;">This Week</div>
                </div>
                <div class="stat-card" style="flex: 1; background: var(--vscode-widget-shadow); padding: 12px; border-radius: 4px; text-align: center;">
                    <div class="stat-value" style="font-size: 18px; color: #4ec9b0; font-weight: 600;">${Math.floor(stats.today / 60)}h ${stats.today % 60}m</div>
                    <div class="stat-label" style="font-size: 10px; color: var(--vscode-descriptionForeground); text-transform: uppercase;">Today</div>
                </div>
            </div>
        `;
    }

    /**
     * Render History Tab
     */
    private renderHistoryTab(): string {
        const history = this.dashboardState.recentTasks || [];

        if (history.length === 0) {
            return `
                ${this.renderHistoryStats()}
                <div class="empty-state">
                    <p class="text-muted">No completed tasks yet</p>
                </div>
            `;
        }

        return `
            ${this.renderHistoryStats()}
            <div class="history-list">
                ${history.map(task => `
                    <div class="history-item" title="${task.summary}">
                        <div class="history-info">
                            <span class="history-id">${task.ticketId}</span>
                            <span class="history-time">Updated: ${this.formatRelativeTime(task.completedAt)}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="history-duration">${Math.floor(task.totalTime / 60)}h ${task.totalTime % 60}m</span>
                            <vscode-button appearance="icon" data-msg-type="startTask" data-msg-payload='${JSON.stringify({ ticketId: task.ticketId })}'>▶️</vscode-button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    /**
     * Render Project Health section
     */
    private renderProjectHealth(): string {
        const health = this.dashboardState.projectHealth;
        
        return `
            <div class="status-row">
                <span class="status-dot ${health.jira.connected ? 'green' : 'red'}"></span>
                <span>Jira: ${health.jira.message}</span>
            </div>
            <div class="status-row">
                <span class="status-dot ${health.git.connected ? 'green' : 'yellow'}"></span>
                <span>Git: ${health.git.message}</span>
            </div>
            <div class="status-row">
                <span class="status-dot ${health.jenkins.connected ? 'green' : 'yellow'}"></span>
                <span>Jenkins: ${health.jenkins.message}</span>
            </div>
        `;
    }

    /**
     * Render Time Tracker section
     */
    private renderTimeTracker(): string {
        const timer = this.dashboardState.timeTracker;
        const formattedTime = this.formatTime(timer.elapsedSeconds);

        if (!timer.isRunning) {
            return `
                <div class="time-display inactive">--:--:--</div>
                <p class="text-muted">Start a task to begin tracking</p>
            `;
        }

        return `
            <div class="time-display ${timer.isPaused ? 'paused' : 'active'}" id="timer-display">
                ${formattedTime}
            </div>
            <div class="time-controls">
                ${timer.isPaused 
                    ? `<vscode-button onclick="sendMessage('resumeTimer')">▶️ Resume</vscode-button>`
                    : `<vscode-button onclick="sendMessage('pauseTimer')">⏸️ Pause</vscode-button>`
                }
                <vscode-button appearance="secondary" onclick="sendMessage('stopTimer')">⏹️ Stop</vscode-button>
            </div>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">--</div>
                    <div class="stat-label">THIS WEEK</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${formattedTime.substring(0, 5)}</div>
                    <div class="stat-label">TODAY</div>
                </div>
            </div>
        `;
    }

    /**
     * Render Linting Hub section
     */
    private renderLintingHub(): string {
        const results = this.dashboardState.lintingResults;
        const pythonCount = results.filter(r => ['pep8', 'pyflakes'].includes(r.tool)).length;
        const jsCount = results.filter(r => r.tool === 'eslint').length;

        return `
            <div class="tabs">
                <div class="tab active" data-tab="python">Python (${pythonCount})</div>
                <div class="tab" data-tab="javascript">JavaScript (${jsCount})</div>
            </div>
            <div class="issue-list">
                ${results.slice(0, 5).map(issue => `
                    <div class="issue-item">
                        <div>
                            <div class="issue-file">${issue.file}:${issue.line}</div>
                            <div>
                                <span class="issue-severity ${issue.severity}">${issue.severity.toUpperCase()}</span>
                                ${issue.message}
                            </div>
                        </div>
                        ${issue.canFix 
                            ? `<vscode-button appearance="icon" onclick="sendMessage('fixIssue', '${issue.file}:${issue.line}')">⚡</vscode-button>`
                            : `<vscode-button appearance="icon" onclick="sendMessage('showIssue', '${issue.file}:${issue.line}')">🔍</vscode-button>`
                        }
                    </div>
                `).join('')}
            </div>
            <vscode-button appearance="primary" style="width: 100%; margin-top: 12px;" onclick="sendMessage('fixAll')">
                Fix All (${results.filter(r => r.canFix).length})
            </vscode-button>
        `;
    }

    /**
     * Render Repository Workspace section
     */
    private renderRepoWorkspace(): string {
        const repos = this.dashboardState.repositories;

        if (repos.length === 0) {
            return `
                <div class="empty-state">
                    <p>No repositories detected</p>
                    <vscode-button appearance="secondary" onclick="sendMessage('refreshRepos')">Scan Workspace</vscode-button>
                </div>
            `;
        }

        return `
            <div class="repo-list">
                ${repos.map(repo => `
                    <div class="repo-item">
                        <vscode-checkbox 
                            ${repo.mode === 'active' ? 'checked' : ''} 
                            onchange="sendMessage('toggleRepo', '${repo.name}')">
                            ${repo.name}
                        </vscode-checkbox>
                        <span class="repo-branch">[${repo.currentBranch}]</span>
                        <span class="status-dot ${repo.status.state === 'clean' ? 'green' : 'yellow'}"></span>
                    </div>
                `).join('')}
            </div>
            <vscode-text-area 
                id="commit-message" 
                placeholder="Enter commit message..." 
                rows="2"
                style="width: 100%; margin-top: 12px;">
            </vscode-text-area>
            <div class="action-buttons">
                <vscode-button onclick="sendMessage('commitAll')">💾 Commit</vscode-button>
                <vscode-button appearance="secondary" onclick="sendMessage('pushAll')">⬆️ Push</vscode-button>
            </div>
            <vscode-button appearance="primary" style="width: 100%; margin-top: 8px;" onclick="sendMessage('createPRs')">
                🔀 Create PRs
            </vscode-button>
        `;
    }

    /**
     * Add a log entry to the activity log
     */
    public addLog(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
        const item: ActivityItem = {
            id: Date.now().toString(),
            type,
            message,
            timestamp: new Date().toISOString()
        };

        const currentStream = this.dashboardState.activityStream || [];
        const newStream = [item, ...currentStream].slice(0, 50); // Keep last 50 logs

        this.updateState({ activityStream: newStream });
    }

    /**
     * Render Activity Log section
     */
    private renderActivityStream(): string {
        const activities = this.dashboardState.activityStream;

        if (activities.length === 0) {
            return `<p class="text-muted">No logs available</p>`;
        }

        return `
            <div class="activity-list">
                ${activities.map(item => `
                    <div class="activity-item ${item.type}">
                        <span class="activity-icon">${this.getActivityIcon(item.type)}</span>
                        <div class="activity-content">
                            <div class="activity-message">${item.message}</div>
                            <div class="activity-time">${this.formatRelativeTime(item.timestamp)}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    /**
     * Get icon for activity type
     */
    private getActivityIcon(type: string): string {
        const icons: Record<string, string> = {
            'commit': '💾',
            'push': '⬆️',
            'pr': '🔀',
            'comment': '💬',
            'jenkins': '🔨',
            'timer': '⏱️',
            'task': '🎯',
            'error': '❌',
            'warning': '⚠️',
            'info': 'ℹ️'
        };
        return icons[type] || '•';
    }

    /**
     * Format timestamp as relative time
     */
    private formatRelativeTime(timestamp: string): string {
        const now = Date.now();
        const then = new Date(timestamp).getTime();
        const diff = now - then;

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    }

    /**
     * Format seconds to HH:MM:SS
     */
    private formatTime(totalSeconds: number): string {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return [hours, minutes, seconds]
            .map(v => v.toString().padStart(2, '0'))
            .join(':');
    }
}

/**
 * Generate a random nonce for CSP
 */
function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
