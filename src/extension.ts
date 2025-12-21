import * as vscode from 'vscode';
import { SidebarProvider } from './SidebarProvider';
import { CredentialManager } from './CredentialManager';
import { DataManager } from './DataManager';
import { JiraClient } from './JiraClient';
import { JenkinsClient } from './JenkinsClient';
import { TimeTracker } from './TimeTracker';
import { GitManager } from './GitManager';
import { JiraTicket, Repository, TaskManifest, WorkLog } from './types';

// Global instances
let outputChannel: vscode.OutputChannel;
let credentialManager: CredentialManager;
let dataManager: DataManager;
let jiraClient: JiraClient;
let jenkinsClient: JenkinsClient;
let timeTracker: TimeTracker;
let gitManager: GitManager;
let sidebarProvider: SidebarProvider;

/**
 * Get the configured tool name
 */
function getToolName(): string {
    return vscode.workspace.getConfiguration('devloop').get<string>('branding.name') || 'DevLoop';
}

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext) {
    // Create output channel for logging
    outputChannel = vscode.window.createOutputChannel(getToolName());
    log(`${getToolName()} extension activating...`);

    // Initialize managers
    credentialManager = new CredentialManager(context.secrets);
    dataManager = new DataManager(context);
    jiraClient = new JiraClient(credentialManager, outputChannel);
    jenkinsClient = new JenkinsClient(credentialManager, outputChannel);
    timeTracker = new TimeTracker(outputChannel);
    gitManager = new GitManager(outputChannel);

    // Initialize data directory
    await dataManager.initialize();

    // Initialize sidebar provider
    sidebarProvider = new SidebarProvider(context.extensionUri);
    
    // Set up message handling from webview
    sidebarProvider.onMessage(handleWebviewMessage);

    // Set up time tracker updates
    timeTracker.onUpdate((state) => {
        sidebarProvider.updateTimeTracker(state);
    });

    // Register sidebar webview
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('devloop-sidebar', sidebarProvider)
    );

    // Register commands
    registerCommands(context);

    // Initialize connections and update dashboard
    await initializeDashboard();

    log(`${getToolName()} extension activated successfully`);
}

/**
 * Register all extension commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
    // Refresh Dashboard
    context.subscriptions.push(
        vscode.commands.registerCommand('devloop.refreshEntry', async () => {
            log('Refreshing dashboard...');
            await initializeDashboard();
            sidebarProvider.refresh();
            vscode.window.showInformationMessage(`${getToolName()}: Dashboard refreshed`);
        })
    );

    // Start Task
    context.subscriptions.push(
        vscode.commands.registerCommand('devloop.startTask', async () => {
            await startTask();
        })
    );

    // End Task
    context.subscriptions.push(
        vscode.commands.registerCommand('devloop.endTask', async () => {
            await endTask();
        })
    );

    // Pause Timer
    context.subscriptions.push(
        vscode.commands.registerCommand('devloop.pauseTimer', () => {
            timeTracker.pause();
            vscode.window.showInformationMessage(`${getToolName()}: Timer paused`);
        })
    );

    // Resume Timer
    context.subscriptions.push(
        vscode.commands.registerCommand('devloop.resumeTimer', () => {
            timeTracker.resume();
            vscode.window.showInformationMessage(`${getToolName()}: Timer resumed`);
        })
    );

    // Commit All
    context.subscriptions.push(
        vscode.commands.registerCommand('devloop.commitAll', async () => {
            await commitAllRepos();
        })
    );

    // Push All
    context.subscriptions.push(
        vscode.commands.registerCommand('devloop.pushAll', async () => {
            await pushAllRepos();
        })
    );

    // Create PRs
    context.subscriptions.push(
        vscode.commands.registerCommand('devloop.createPRs', async () => {
            vscode.window.showInformationMessage(`${getToolName()}: PR creation coming soon`);
        })
    );

    // Set Jira Token
    context.subscriptions.push(
        vscode.commands.registerCommand('devloop.setJiraToken', async () => {
            await credentialManager.promptForJiraToken();
            await initializeDashboard();
        })
    );

    // Configure Jira
    context.subscriptions.push(
        vscode.commands.registerCommand('devloop.configureJira', async () => {
            await configureJira();
        })
    );

    // Validate Jira Configuration
    context.subscriptions.push(
        vscode.commands.registerCommand('devloop.validateJira', async () => {
            await validateJiraConfig();
        })
    );

    // Configure Git
    context.subscriptions.push(
        vscode.commands.registerCommand('devloop.configureGit', async () => {
            await configureGit();
        })
    );

    // Configure Jenkins
    context.subscriptions.push(
        vscode.commands.registerCommand('devloop.configureJenkins', async () => {
            await configureJenkins();
        })
    );

    // Open Settings Panel
    context.subscriptions.push(
        vscode.commands.registerCommand('devloop.openSettings', async () => {
            vscode.window.showInformationMessage(`${getToolName()}: Settings panel coming soon. Use Command Palette commands to configure.`);
        })
    );

    // Clear Data
    context.subscriptions.push(
        vscode.commands.registerCommand('devloop.clearData', async () => {
            const confirm = await vscode.window.showWarningMessage(
                `This will clear all ${getToolName()} data. Continue?`,
                'Yes', 'No'
            );
            if (confirm === 'Yes') {
                await dataManager.clearWorkspaceData();
                await credentialManager.clearAll();
                vscode.window.showInformationMessage(`${getToolName()}: All data cleared`);
            }
        })
    );
}

/**
 * Initialize dashboard with current state
 */
async function initializeDashboard(): Promise<void> {
    log('Initializing dashboard...');

    // Check connections
    const jiraStatus = await jiraClient.checkConnection();
    const gitStatus = await gitManager.checkConnection();
    const jenkinsStatus = await jenkinsClient.checkConnection();

    // Detect repositories
    const repos = await gitManager.detectRepositories();

    // Check for active context
    const activeContext = await dataManager.getActiveContext();
    let activeTicket: JiraTicket | null = null;

    if (activeContext.ticketId) {
        activeTicket = await jiraClient.getTicket(activeContext.ticketId);
    }

    // Get recent tasks and stats
    const recentTasks = await dataManager.getRecentTasks();
    const historyStats = await dataManager.getHistoryStats();
    let activeTicketTotalTime = 0;
    if (activeTicket) {
        activeTicketTotalTime = await dataManager.getTicketTotalTime(activeTicket.key);
    }

    // Update sidebar state
    sidebarProvider.updateState({
        toolName: getToolName(),
        activeTicket,
        activeTicketTotalTime,
        projectHealth: {
            jira: { connected: jiraStatus.connected, message: jiraStatus.message },
            git: { connected: gitStatus.connected, message: gitStatus.message },
            jenkins: { connected: jenkinsStatus.connected, message: jenkinsStatus.message }
        },
        repositories: repos,
        recentTasks,
        historyStats
    });

    log('Dashboard initialized');
}

/**
 * Handle messages from webview
 */
async function handleWebviewMessage(message: any): Promise<void> {
    log(`Received message: ${message.type}`);

    switch (message.type) {
        case 'startTask':
            const ticketId = message.payload && message.payload.ticketId;
            await startTask(ticketId);
            break;
        case 'endTask':
            await endTask();
            break;
        case 'cancelTask':
            await cancelTask();
            break;
        case 'configureJira':
            await configureJira();
            break;
        case 'validateJira':
            await validateJiraConfig();
            break;
        case 'testJiraConnection':
            await testJiraConnection();
            break;
        case 'openSettings':
            vscode.commands.executeCommand('workbench.action.openSettings', message.payload);
            break;
        case 'pauseTimer':
            timeTracker.pause();
            sidebarProvider.updateState({ timeTracker: timeTracker.getState() });
            break;
        case 'resumeTimer':
            timeTracker.resume();
            sidebarProvider.updateState({ timeTracker: timeTracker.getState() });
            break;
        case 'startTimer':
            const activeCtx = await dataManager.getActiveContext();
            if (activeCtx.ticketId) {
                // Fetch latest details for snapshot
                const ticket = await jiraClient.getTicket(activeCtx.ticketId);
                const snapshot = {
                    status: ticket?.status.name || 'Unknown',
                    assignee: ticket?.assignee || 'Unassigned',
                    timestamp: new Date().toISOString()
                };
                timeTracker.start(activeCtx.ticketId, snapshot);
                sidebarProvider.updateState({ timeTracker: timeTracker.getState() });
            }
            break;
        case 'stopTimer':
            await stopTimer();
            break;
        case 'toggleRepo':
            await toggleRepository(message.payload);
            break;
        case 'commitAll':
            await commitAllRepos(message.payload);
            break;
        case 'pushAll':
            await pushAllRepos();
            break;
        case 'createPRs':
            vscode.window.showInformationMessage('DevLoop: PR creation coming soon');
            break;
        case 'fixAll':
            vscode.window.showInformationMessage('[Mock] Fixed all auto-fixable issues');
            break;
        case 'fixIssue':
            vscode.window.showInformationMessage(`[Mock] Fixed issue at ${message.payload}`);
            break;
        case 'showIssue':
            // Would navigate to file:line in production
            vscode.window.showInformationMessage(`[Mock] Would navigate to ${message.payload}`);
            break;
        case 'refreshRepos':
            const repos = await gitManager.detectRepositories();
            sidebarProvider.updateState({ 
                repositories: repos,
                toolName: getToolName()
            });
            break;
    }
}

/**
 * Configure Jira connection - Opens settings page
 */
async function configureJira(): Promise<void> {
    // Open VS Code settings focused on DevLoop Jira configuration
    await vscode.commands.executeCommand('workbench.action.openSettings', 'devloop.jira');
    
    // Show information message with instructions
    const action = await vscode.window.showInformationMessage(
        'Configure your Jira connection in the settings below. After configuration, click "Validate" to test the connection.',
        'Set API Token',
        'Validate Configuration'
    );

    if (action === 'Set API Token') {
        const token = await credentialManager.promptForJiraToken();
        if (token) {
            vscode.window.showInformationMessage('Jira API token saved securely');
        }
    } else if (action === 'Validate Configuration') {
        await validateJiraConfig();
    }
}

/**
 * Validate Jira configuration and show detailed results
 */
async function validateJiraConfig(): Promise<void> {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Validating Jira Configuration...",
        cancellable: false
    }, async (progress) => {
        progress.report({ increment: 20, message: 'Checking URL format...' });
        
        const validation = await jiraClient.validateConfiguration();
        
        progress.report({ increment: 40, message: 'Testing authentication...' });
        
        if (validation.valid) {
            const userInfo = validation.userInfo;
            vscode.window.showInformationMessage(
                `✅ Jira Connected Successfully!\n\nLogged in as: ${userInfo?.displayName} (${userInfo?.email})`
            );
        } else {
            // Show detailed error message
            const errorDetails = [];
            if (!validation.url) {
                errorDetails.push('❌ URL: Invalid or missing');
            } else {
                errorDetails.push('✅ URL: Valid');
            }
            
            if (!validation.auth) {
                errorDetails.push('❌ Authentication: Failed');
            } else {
                errorDetails.push('✅ Authentication: Valid');
            }
            
            const action = await vscode.window.showErrorMessage(
                `Jira Configuration Issues:\n\n${errorDetails.join('\n')}\n\n${validation.message}`,
                'Open Settings',
                'Set API Token',
                'Retry'
            );
            
            if (action === 'Open Settings') {
                await vscode.commands.executeCommand('workbench.action.openSettings', 'devloop.jira');
            } else if (action === 'Set API Token') {
                await credentialManager.promptForJiraToken();
            } else if (action === 'Retry') {
                await validateJiraConfig();
                return;
            }
        }
        
        // Refresh dashboard with new status
        await initializeDashboard();
    });
}

/**
 * Configure Git provider connection with step-by-step prompts
 */
async function configureGit(): Promise<void> {
    // Step 1: Git Provider Selection
    const provider = await vscode.window.showQuickPick(
        ['github', 'gitlab', 'bitbucket'],
        {
            placeHolder: 'Select your Git provider',
            ignoreFocusOut: true
        }
    );

    if (!provider) {
        return;
    }

    // Step 2: Git Base URL
    const defaultUrls: Record<string, string> = {
        'github': 'https://api.github.com',
        'gitlab': 'https://gitlab.com',
        'bitbucket': 'https://api.bitbucket.org'
    };

    const baseUrl = await vscode.window.showInputBox({
        prompt: 'Enter your Git provider base URL',
        placeHolder: defaultUrls[provider],
        value: vscode.workspace.getConfiguration('devloop').get<string>('git.baseUrl') || defaultUrls[provider],
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return 'URL cannot be empty';
            }
            if (!value.startsWith('http://') && !value.startsWith('https://')) {
                return 'URL must start with http:// or https://';
            }
            return null;
        }
    });

    if (!baseUrl) {
        return;
    }

    // Step 3: Personal Access Token
    const token = await vscode.window.showInputBox({
        prompt: `Enter your ${provider.charAt(0).toUpperCase() + provider.slice(1)} Personal Access Token`,
        password: true,
        placeHolder: 'Your personal access token...',
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return 'Token cannot be empty';
            }
            return null;
        }
    });

    if (!token) {
        return;
    }

    // Save configuration
    await vscode.workspace.getConfiguration('devloop').update('git.provider', provider, true);
    await vscode.workspace.getConfiguration('devloop').update('git.baseUrl', baseUrl, true);
    await credentialManager.storeGitToken(token);

    vscode.window.showInformationMessage(`✅ ${getToolName()}: ${provider.charAt(0).toUpperCase() + provider.slice(1)} configured successfully!`);

    // Refresh dashboard
    await initializeDashboard();
}

/**
 * Configure Jenkins connection with step-by-step prompts
 */
async function configureJenkins(): Promise<void> {
    // Step 1: Jenkins Base URL
    const baseUrl = await vscode.window.showInputBox({
        prompt: 'Enter your Jenkins server URL',
        placeHolder: 'https://jenkins.company.com',
        value: vscode.workspace.getConfiguration('devloop').get<string>('jenkins.baseUrl') || '',
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return 'URL cannot be empty';
            }
            if (!value.startsWith('http://') && !value.startsWith('https://')) {
                return 'URL must start with http:// or https://';
            }
            return null;
        }
    });

    if (!baseUrl) {
        return;
    }

    // Step 2: Jenkins Username
    const username = await vscode.window.showInputBox({
        prompt: 'Enter your Jenkins username',
        placeHolder: 'your.username',
        value: vscode.workspace.getConfiguration('devloop').get<string>('jenkins.username') || '',
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return 'Username cannot be empty';
            }
            return null;
        }
    });

    if (!username) {
        return;
    }

    // Step 3: API Token
    const token = await vscode.window.showInputBox({
        prompt: 'Enter your Jenkins API Token (Create at: Jenkins > User > Configure > API Token)',
        password: true,
        placeHolder: 'Your Jenkins API token...',
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return 'Token cannot be empty';
            }
            return null;
        }
    });

    if (!token) {
        return;
    }

    // Step 4: Default Job (Optional)
    const defaultJob = await vscode.window.showInputBox({
        prompt: 'Enter default Jenkins job name for impact analysis (optional)',
        placeHolder: 'impact-analysis-job',
        value: vscode.workspace.getConfiguration('devloop').get<string>('jenkins.defaultJob') || ''
    });

    // Save configuration
    await vscode.workspace.getConfiguration('devloop').update('jenkins.baseUrl', baseUrl, true);
    await vscode.workspace.getConfiguration('devloop').update('jenkins.username', username, true);
    if (defaultJob) {
        await vscode.workspace.getConfiguration('devloop').update('jenkins.defaultJob', defaultJob, true);
    }
    await credentialManager.storeJenkinsToken(token);

    // Test connection
    const initialized = await jenkinsClient.initialize();
    if (initialized) {
        const connectionTest = await jenkinsClient.checkConnection();
        if (connectionTest.connected) {
            vscode.window.showInformationMessage(`✅ ${getToolName()}: Jenkins configured successfully! (Version: ${connectionTest.version})`);
        } else {
            vscode.window.showWarningMessage(
                `⚠️ ${getToolName()}: Jenkins configured but connection test failed: ${connectionTest.message}`
            );
        }
    }

    // Refresh dashboard
    await initializeDashboard();
}

/**
 * Test Jira Connection manually
 */
async function testJiraConnection(): Promise<void> {
    const isMock = vscode.workspace.getConfiguration('devloop').get<boolean>('useMockData');
    
    if (isMock) {
        vscode.window.showInformationMessage(`${getToolName()}: Currently in Mock Mode. Connection is simulated.`);
        return;
    }

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Testing Jira Connection...",
        cancellable: false
    }, async (progress) => {
        const result = await jiraClient.checkConnection();
        
        if (result.connected) {
            vscode.window.showInformationMessage('✅ Jira Connection Successful!');
        } else {
            vscode.window.showErrorMessage(`❌ Connection Failed: ${result.message}`);
        }
        
        // Update dashboard with explicit status
        await initializeDashboard();
    });
}

/**
 * Start a new task
 */
async function startTask(ticketId?: string): Promise<void> {
    log('Starting task workflow...');
    
    // Check if Jira is configured (unless using mock data)
    const useMock = vscode.workspace.getConfiguration('devloop').get<boolean>('useMockData', false);
    
    if (!useMock) {
        const connected = await jiraClient.checkConnection();
        if (!connected.connected) {
             const action = await vscode.window.showWarningMessage(
                `${getToolName()}: Cannot start task. Jira is not connected: ${connected.message}`,
                'Configure Jira',
                'Cancel'
            );

            if (action === 'Configure Jira') {
                await configureJira();
            }
            return;
        }
    }

    // Prompt for ticket ID if not provided
    if (!ticketId) {
        ticketId = await vscode.window.showInputBox({
            prompt: 'Enter Jira Ticket ID to fetch details',
            placeHolder: 'e.g., JIRA-1234',
            validateInput: (value) => {
                if (!value || value.trim().length < 2) {
                    return 'Please enter a valid ticket ID';
                }
                return null;
            }
        });
    }

    if (!ticketId) {
        log('Task start cancelled - no ticket ID provided');
        return;
    }

    log(`Fetching ticket: ${ticketId}`);

    // Fetch ticket with progress notification
    let ticket: JiraTicket | null = null;
    
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Fetching details for ${ticketId}...`,
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 50, message: 'Connecting to Jira...' });
            
            // Fetch ticket details with timeout
            const timeoutPromise = new Promise<JiraTicket | null>((_, reject) => 
                setTimeout(() => reject(new Error('Request timed out after 30 seconds')), 30000)
            );
            
            const ticketPromise = jiraClient.getTicket(ticketId!);
            
            ticket = await Promise.race([ticketPromise, timeoutPromise]);
            
            progress.report({ increment: 50, message: 'Ticket retrieved' });
        });
    } catch (error) {
        log(`Error fetching ticket: ${error}`);
        vscode.window.showErrorMessage(`${getToolName()}: Error fetching ticket: ${error}`);
        return;
    }
    
    if (!ticket) {
        log(`Ticket not found: ${ticketId}`);
        vscode.window.showErrorMessage(`${getToolName()}: Could not find ticket ${ticketId}. Check ID and permissions.`);
        return;
    }

    // TypeScript now knows ticket is not null
    const confirmedTicket: JiraTicket = ticket;
    
    log(`Ticket fetched successfully: ${confirmedTicket.key} - ${confirmedTicket.summary}`);

    // Confirm ticket (outside progress notification)
    const confirm = await vscode.window.showInformationMessage(
        `Start work on: ${confirmedTicket.key} - ${confirmedTicket.summary}?`,
        'Yes', 'No'
    );

    if (confirm !== 'Yes') {
        log('Task start cancelled by user');
        return;
    }

    // Initialize task
    await initializeTask(confirmedTicket);
}

/**
 * Initialize task after confirmation
 */
async function initializeTask(ticket: JiraTicket): Promise<void> {
    // Get repositories
    const repos = await gitManager.detectRepositories();
    
    // For simplicity, mark all repos as active (in production, would show picker)
    const activeRepos = repos.map(r => ({ ...r, mode: 'active' as const }));

    // Create or read manifest
    let manifest = await dataManager.readManifest(ticket.key);
    if (!manifest) {
        manifest = dataManager.createManifest(ticket.key, ticket.summary, activeRepos);
    }
    
    // Ensure status is active
    manifest.status = 'active';
    await dataManager.writeManifest(manifest);
    await dataManager.setActiveContext(ticket.key);

    // Start timer logic moved to manual action or separate call
    // But user might expect it to start immediately?
    // "User can start the task ... get the ticket ... store in log"
    // We'll auto-start timer here with snapshot
    const snapshot = {
        status: ticket.status.name,
        assignee: ticket.assignee || 'Unassigned',
        timestamp: new Date().toISOString()
    };
    timeTracker.start(ticket.key, snapshot);

    // Update dashboard
    sidebarProvider.updateState({
        activeTicket: ticket,
        repositories: activeRepos,
        timeTracker: timeTracker.getState()
    });

    log(`Task initialized: ${ticket.key}`);
    vscode.window.showInformationMessage(`${getToolName()}: Active task set to ${ticket.key}`);
}

/**
 * Stop the timer (save session but keep task active)
 */
async function stopTimer(): Promise<void> {
    const activeContext = await dataManager.getActiveContext();
    if (!activeContext.ticketId) return;

    const log = timeTracker.stop();
    if (log) {
        await dataManager.addLog(activeContext.ticketId, log);

        // Update stats
        const activeTicketTotalTime = await dataManager.getTicketTotalTime(activeContext.ticketId);
        const historyStats = await dataManager.getHistoryStats();
        const recentTasks = await dataManager.getRecentTasks();
        
        // Reset dashboard timer UI and update stats
        sidebarProvider.updateState({
            timeTracker: timeTracker.getState(),
            activeTicketTotalTime,
            historyStats,
            recentTasks
        });

        const dur = log.duration;
        vscode.window.setStatusBarMessage(`${getToolName()}: Logged ${dur}m locally`, 3000);
    }
}

/**
 * End the current task
 */
async function endTask(): Promise<void> {
    const activeContext = await dataManager.getActiveContext();
    const ticketId = activeContext.ticketId;
    
    if (!ticketId) {
        vscode.window.showWarningMessage(`${getToolName()}: No active task to end`);
        return;
    }

    // Stop timer explicitly first to get final log
    const finalLog = timeTracker.stop();
    if (finalLog) {
         await dataManager.addLog(ticketId, finalLog);
    }

    // Prepare sync
    const logs = await dataManager.getUnsyncedLogs(ticketId);
    if (logs.length === 0) {
        // Just clear context if nothing to sync
        await dataManager.setActiveContext(null);
        sidebarProvider.updateState({
            activeTicket: null,
            timeTracker: timeTracker.getState()
        });
        vscode.window.showInformationMessage('Task ended (no new time to log).');
        return;
    }

    const totalMinutes = logs.reduce((sum, l) => sum + l.duration, 0);

    // Confirm end task
    const confirm = await vscode.window.showInformationMessage(
        `End task ${ticketId}? Sync ${logs.length} logs (${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m) to Jira?`,
        'Yes', 'No'
    );

    if (confirm !== 'Yes') {
        return;
    }

    // Log total work time
    if (totalMinutes > 0) {
        await jiraClient.logWorkTime(ticketId, totalMinutes);
    }

    // Post detailed comment
    const logLines = logs.map(l => {
        const start = new Date(l.startTime).toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'
        });
        const end = new Date(l.endTime).toLocaleTimeString(undefined, {
            hour: '2-digit', minute:'2-digit'
        });
        return `- ${start} - ${end} (${l.duration}m) [Status: ${l.ticketSnapshot.status}, Assg: ${l.ticketSnapshot.assignee}]`;
    });

    const comment = `Work Logged via ${getToolName()}:\n${logLines.join('\n')}\n**Total: ${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m**`;
    
    await jiraClient.postComment(ticketId, comment);

    // Mark as completed and synced
    const manifest = await dataManager.readManifest(ticketId);
    if (manifest) {
        manifest.status = 'completed';
        manifest.lastUpdated = new Date().toISOString();
        await dataManager.writeManifest(manifest);
    }
    
    await dataManager.markLogsSynced(ticketId, logs.map(l => l.id));

    // Clear active context
    await dataManager.setActiveContext(null);

    // Refresh history stats
    const historyStats = await dataManager.getHistoryStats();
    const recentTasks = await dataManager.getRecentTasks();

    // Update dashboard
    sidebarProvider.updateState({
        activeTicket: null,
        activeTicketTotalTime: 0,
        timeTracker: {
            isRunning: false,
            isPaused: false,
            currentTicketId: null,
            elapsedSeconds: 0,
            sessionStartTime: null
        },
        recentTasks,
        historyStats
    });

    log(`Task ended: ${ticketId}`);
    vscode.window.showInformationMessage(
        `DevLoop: Ended ${ticketId}. Logged ${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m to Jira`
    );
}

/**
 * Cancel/Reset current task without logging time
 */
async function cancelTask(): Promise<void> {
    log('Cancelling current task...');
    
    const activeContext = await dataManager.getActiveContext();
    if (!activeContext) {
        vscode.window.showWarningMessage('DevLoop: No active task to cancel');
        return;
    }

    // Confirm cancellation
    const confirm = await vscode.window.showWarningMessage(
        `Cancel task ${activeContext.ticketId}? This will stop the timer and clear the task WITHOUT logging time to Jira.`,
        { modal: true },
        'Yes, Cancel Task',
        'No, Keep Task'
    );

    if (confirm !== 'Yes, Cancel Task') {
        return;
    }

    // Stop timer without logging
    const session = timeTracker.stop();
    if (session) {
        log(`Timer stopped. Duration: ${session.duration} minutes (not logged)`);
    }

    // Clear active context
    await dataManager.setActiveContext(null);

    // Update dashboard
    sidebarProvider.updateState({
        activeTicket: null,
        timeTracker: timeTracker.getState()
    });

    log(`Task cancelled: ${activeContext.ticketId}`);
    vscode.window.showInformationMessage('DevLoop: Task cancelled. Timer stopped without logging to Jira.');
}

/**
 * Toggle repository active/reference mode
 */
async function toggleRepository(repoName: string): Promise<void> {
    const repos = await gitManager.detectRepositories();
    const repo = repos.find(r => r.name === repoName);
    
    if (!repo) {
        return;
    }

    const newMode = repo.mode === 'active' ? 'reference' : 'active';
    const updatedRepos = gitManager.updateRepoMode(repos, repoName, newMode);
    
    sidebarProvider.updateState({ repositories: updatedRepos });
    log(`Repository ${repoName} mode changed to ${newMode}`);
}

/**
 * Commit to all active repositories
 */
async function commitAllRepos(message?: string): Promise<void> {
    const commitMessage = message || await vscode.window.showInputBox({
        prompt: 'Enter commit message',
        placeHolder: 'Your commit message...'
    });

    if (!commitMessage) {
        return;
    }

    const repos = await gitManager.detectRepositories();
    const activeRepos = repos.filter(r => r.mode === 'active');

    if (activeRepos.length === 0) {
        vscode.window.showWarningMessage('DevLoop: No active repositories to commit');
        return;
    }

    const results = await gitManager.commitAll(activeRepos, commitMessage);

    if (results.success.length > 0) {
        // Post to Jira
        const activeContext = await dataManager.getActiveContext();
        if (activeContext.ticketId) {
            await jiraClient.postComment(
                activeContext.ticketId,
                `Committed to ${results.success.length} repositories:\n${results.success.join('\n')}\n\nMessage: ${commitMessage}`
            );
        }
    }

    if (results.failed.length > 0) {
        vscode.window.showWarningMessage(
            `DevLoop: Failed to commit: ${results.failed.join(', ')}`
        );
    }
}

/**
 * Push all active repositories
 */
async function pushAllRepos(): Promise<void> {
    const repos = await gitManager.detectRepositories();
    const activeRepos = repos.filter(r => r.mode === 'active');

    if (activeRepos.length === 0) {
        vscode.window.showWarningMessage('DevLoop: No active repositories to push');
        return;
    }

    const results = await gitManager.pushAll(activeRepos);

    if (results.failed.length > 0) {
        vscode.window.showWarningMessage(
            `DevLoop: Failed to push: ${results.failed.join(', ')}`
        );
    }
}

/**
 * Log message to output channel
 */
function log(message: string): void {
    const timestamp = new Date().toISOString();
    outputChannel.appendLine(`[${timestamp}] ${message}`);

    // Determine type
    let type: 'info' | 'warning' | 'error' = 'info';
    if (message.toLowerCase().includes('error') || message.toLowerCase().includes('failed')) type = 'error';
    else if (message.toLowerCase().includes('warning')) type = 'warning';

    // Add to sidebar activity log
    if (sidebarProvider) {
        sidebarProvider.addLog(message, type);
    }
}

/**
 * Extension deactivation
 */
export function deactivate() {
    if (timeTracker) {
        timeTracker.dispose();
    }
    if (outputChannel) {
        outputChannel.dispose();
    }
}
