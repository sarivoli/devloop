/**
 * DevLoop Extension - Type Definitions
 */

// ============================================
// Jira Types
// ============================================

export interface JiraTicket {
    id: string;
    key: string;
    summary: string;
    description: string;
    status: JiraStatus;
    assignee: string | null;
    reporter: string;
    priority: string;
    issueType: string;
    created: string;
    updated: string;
}

export interface JiraStatus {
    id: string;
    name: string;
    category: 'todo' | 'in_progress' | 'done';
}

export interface JiraComment {
    id: string;
    author: string;
    body: string;
    created: string;
}

export interface JiraWorklog {
    timeSpentSeconds: number;
    comment: string;
    started: string;
}

// ============================================
// Repository Types
// ============================================

export interface Repository {
    name: string;
    path: string;
    currentBranch: string;
    baseBranch: string;
    mode: RepoMode;
    status: RepoStatus;
    hasUncommittedChanges: boolean;
    uncommittedFiles: number;
    uncommittedLines: number;
    lastCommitTime?: string;
    isStatic?: boolean;
}

export type RepoMode = 'active' | 'reference' | 'inactive';

export interface RepoStatus {
    state: 'clean' | 'dirty' | 'desync' | 'error';
    message?: string;
}

// ============================================
// Time Tracking Types
// ============================================

export interface TimeSession {
    ticketId: string;
    startTime: string;
    endTime?: string;
    duration: number; // minutes
    isPaused: boolean;
    pausedDuration: number; // accumulated pause time in ms
    activities: ActivitySegment[];
}

export interface ActivitySegment {
    type: 'coding' | 'debugging' | 'reviewing' | 'idle';
    startTime: string;
    duration: number; // minutes
}

export interface TimeTrackerState {
    isRunning: boolean;
    isPaused: boolean;
    currentTicketId: string | null;
    elapsedSeconds: number;
    sessionStartTime: string | null;
    ticketSnapshot?: TicketSnapshot; // Added for snapshot
}

export interface TimerPersistenceState {
    isRunning: boolean;
    isPaused: boolean;
    currentTicketId: string | null;
    elapsedSeconds: number;
    lastTickTime: string; // ISO string to detect drift
    ticketSnapshot?: TicketSnapshot;
}

// ============================================
// Manifest Types
// ============================================

export interface TicketSnapshot {
    status: string;
    assignee: string;
    timestamp: string;
}

export interface WorkLog {
    id: string;
    startTime: string;
    endTime: string;
    duration: number; // minutes
    ticketSnapshot: TicketSnapshot;
    synced: boolean;
    syncedAt?: string;
}

export interface TaskManifest {
    ticketId: string;
    ticketSummary: string;
    startedAt: string;
    startedBy: string;
    status: 'active' | 'completed';
    repos: Record<string, RepoManifestEntry>;
    logs: WorkLog[];
    totalLoggedTime: number; // minutes
    lastUpdated?: string;
    lintingResults?: LintingResult[];
}

export interface RepoManifestEntry {
    mode: RepoMode;
    branch: string;
    baseBranch: string;
    createdAt: string;
    type?: 'branch' | 'tag';
    pinned?: boolean;
    isStatic?: boolean;
}

// Removed TimeTrackingData as it is replaced by logs array


// ============================================
// Dashboard Types
// ============================================

export interface DashboardState {
    toolName?: string;
    activeTicket: JiraTicket | null;
    activeTicketTotalTime?: number; // minutes
    projectHealth: ProjectHealth;
    timeTracker: TimeTrackerState;
    repositories: Repository[];
    lintingResults: LintingResult[];
    configKeys: ConfigKey[];
    activityStream: ActivityItem[];
    recentTasks: RecentTask[];
    activeLintTab?: 'python' | 'javascript' | 'html' | 'futurize';
    activeMainTab?: 'active-task' | 'history' | 'jira-config';
    activeFile?: string;
    searchQuery?: string;
    historyStats: { today: number; thisWeek: number };
    scannedCounts?: { python: number; javascript: number; html: number };
    scanningPath?: string;
    expandedHistoryTickets: string[];
    expandedLintFiles: string[];
}

export interface RecentTask {
    ticketId: string;
    summary: string;
    completedAt: string;
    totalTime: number; // minutes
    logs?: WorkLog[];
}

export interface ProjectHealth {
    jira: ConnectionStatus;
    git: ConnectionStatus;
    jenkins: ConnectionStatus;
}

export interface ConnectionStatus {
    connected: boolean;
    message: string;
    lastCheck?: string;
}

export interface LintingResult {
    tool: string;
    severity: 'error' | 'warning' | 'info';
    file: string;
    line: number;
    column?: number;
    message: string;
    canFix: boolean;
    ruleId?: string;
}

export interface ConfigKey {
    key: string;
    occurrences: ConfigOccurrence[];
    referenceCount: number;
}

export interface ConfigOccurrence {
    repo: string;
    branch: string;
    file: string;
    line: number;
}

export interface ActivityItem {
    id: string;
    type: 'commit' | 'push' | 'pr' | 'comment' | 'jenkins' | 'timer' | 'task' | 'error' | 'info' | 'warning';
    message: string;
    timestamp: string;
    details?: Record<string, unknown>;
}

// ============================================
// Message Types (Webview <-> Extension)
// ============================================

export interface WebviewMessage {
    type: string;
    payload?: unknown;
}

export interface StartTaskPayload {
    ticketId: string;
    selectedRepos: string[];
}

export interface CommitPayload {
    message: string;
    repos: string[];
}

export interface NavigatePayload {
    file: string;
    line: number;
}
