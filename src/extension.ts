import * as vscode from 'vscode';
import * as path from 'path';
import { SidebarProvider } from './SidebarProvider';
import { CredentialManager } from './CredentialManager';
import { DataManager } from './DataManager';
import { JiraClient } from './JiraClient';
import { JenkinsClient } from './JenkinsClient';
import { TimeTracker } from './TimeTracker';
import { GitManager } from './GitManager';
import { JiraTicket, Repository, TaskManifest, WorkLog, LintingResult } from './types';

// Global instances
let outputChannel: vscode.OutputChannel;
let credentialManager: CredentialManager;
let dataManager: DataManager;
let jiraClient: JiraClient;
let jenkinsClient: JenkinsClient;
let timeTracker: TimeTracker;
let gitManager: GitManager;
let sidebarProvider: SidebarProvider;
let globalExtensionUri: vscode.Uri;
let globalExtensionContext: vscode.ExtensionContext;

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
    globalExtensionUri = context.extensionUri;
    globalExtensionContext = context;
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

    timeTracker.onPersist(async (state) => {
        await dataManager.saveTimerState(state);
    });

    // Register sidebar webview
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('devloop-sidebar', sidebarProvider)
    );

    // Register commands
    registerCommands(context);

    // Initialize connections and update dashboard
    await initializeDashboard();

    // Check for running timer to restore
    await checkAndRestoreTimer();

    // Set up active editor tracking
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            handleActiveEditorChange(editor);
        }
    }, null, context.subscriptions);

    // Initial check
    if (vscode.window.activeTextEditor) {
        handleActiveEditorChange(vscode.window.activeTextEditor);
    }

    log(`${getToolName()} extension activated successfully`);
}


/**
 * Check for persisted timer state and restore it
 */
async function checkAndRestoreTimer(): Promise<void> {
    const persisted = await dataManager.getTimerState();
    if (persisted && persisted.isRunning && persisted.currentTicketId) {
        log(`Persisted running timer found for ${persisted.currentTicketId}`);
        
        const lastTickTs = new Date(persisted.lastTickTime).getTime();
        const driftMs = Date.now() - lastTickTs;
        const driftMins = Math.floor(driftMs / (1000 * 60));

        let message = `DevLoop: A running timer was found for ${persisted.currentTicketId}.`;
        let options = ['Resume', 'Discard'];
        
        if (driftMins > 0) {
            message += `\n${driftMins}m have passed since last activity.`;
            options = ['Resume', 'Resume (Including Drift)', 'Discard'];
        }

        const selection = await vscode.window.showInformationMessage(message, ...options);

        if (selection === 'Resume') {
            timeTracker.restore(persisted, false);
            vscode.window.showInformationMessage(`Timer resumed for ${persisted.currentTicketId}`);
        } else if (selection === 'Resume (Including Drift)') {
            timeTracker.restore(persisted, true);
            vscode.window.showInformationMessage(`Timer resumed with ${driftMins}m drift for ${persisted.currentTicketId}`);
        } else if (selection === 'Discard') {
            await dataManager.clearTimerState();
            log('Persisted timer discarded');
        }
    }
}

/**
 * Handle active editor change to update state and switch tabs
 */
function handleActiveEditorChange(editor: vscode.TextEditor) {
    const filePath = editor.document.fileName;
    const ext = path.extname(filePath).toLowerCase();
    
    let tab: 'python' | 'javascript' | 'html' = 'python';
    if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
        tab = 'javascript';
    } else if (['.html', '.htm'].includes(ext)) {
        tab = 'html';
    }
    
    sidebarProvider.updateState({ 
        activeFile: filePath,
        activeLintTab: tab 
    }, true);
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
    let repos = await gitManager.detectRepositories();

    // Check for active context
    const activeContext = await dataManager.getActiveContext();
    let activeTicket: JiraTicket | null = null;
    let manifest = null;

    if (activeContext.ticketId) {
        activeTicket = await jiraClient.getTicket(activeContext.ticketId);
        manifest = await dataManager.readManifest(activeContext.ticketId);
    }

    // Restore repository modes from manifest if available
    if (manifest && manifest.repos) {
        repos = repos.map(repo => {
            const manifestEntry = manifest!.repos[repo.name];
            if (manifestEntry) {
                return { ...repo, mode: manifestEntry.mode, isStatic: manifestEntry.isStatic ?? repo.isStatic };
            }
            return repo;
        });
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
        historyStats,
        lintingResults: await dataManager.readLintingResults()
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
            const includeIdle = message.payload === true || (message.payload && message.payload.includeIdle === true);
            timeTracker.resume(includeIdle);
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
                
                // Add Jira comment: development started
                if (ticket) {
                    const timestamp = new Date().toLocaleString();
                    await jiraClient.postComment(ticket.key, `Development started at ${timestamp} (tracked via ${getToolName()})`);
                }
                
                sidebarProvider.updateState({ timeTracker: timeTracker.getState() });
            }
            break;
        case 'prepareWorkspace':
            await prepareWorkspace(message.payload);
            await runLinting();
            break;
        case 'switchLintTab':
            sidebarProvider.updateState({ activeLintTab: message.payload as any }, true);
            break;
        case 'runLinting':
            const runConfirm = await vscode.window.showInformationMessage(
                'Full workspace linting can take some time. Do you want to proceed?',
                { modal: true },
                'Yes'
            );
            if (runConfirm === 'Yes') {
                await runLinting();
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
        case 'searchLint':
            log(`Search query update: "${message.payload}"`);
            sidebarProvider.updateState({ searchQuery: message.payload as string }, true);
            break;
        case 'resetLintSearch':
            sidebarProvider.updateState({ searchQuery: '' }, true);
            break;
        case 'createPRs':
            vscode.window.showInformationMessage('DevLoop: PR creation coming soon');
            break;
        case 'fixAll':
            await fixAllIssues(message.payload);
            break;
        case 'fixIssue':
            await fixIssue(message.payload);
            break;
        case 'showIssue':
            const { file, line, noScroll } = message.payload as { file: string, line: number, noScroll?: boolean };
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
            const editor = await vscode.window.showTextDocument(doc, { preserveFocus: true });
            const pos = new vscode.Position(line - 1, 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            break;
        case 'refreshRepos':
            await initializeDashboard();
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

    // Start timer logic removed from auto-start
    // The user will now click the Start button manually

    // Update dashboard
    sidebarProvider.updateState({
        activeTicket: ticket,
        repositories: activeRepos,
        timeTracker: timeTracker.getState(),
        activeTicketTotalTime: await dataManager.getTicketTotalTime(ticket.key),
        activeMainTab: 'active-task'
    });

    log(`Task initialized: ${ticket.key}`);
    vscode.window.showInformationMessage(`${getToolName()}: Active task set to ${ticket.key}`);
}

/**
 * Prepare workspace for the current task
 */
async function prepareWorkspace(payload?: any): Promise<void> {
    const activeContext = await dataManager.getActiveContext();
    if (!activeContext.ticketId) {
        vscode.window.showWarningMessage(`${getToolName()}: No active task found. Start a task first.`);
        return;
    }

    const ticketId = activeContext.ticketId;
    const branchName = `feature/${ticketId}`;
    
    // Get repos and manifest to determine which are "active"
    const manifest = await dataManager.readManifest(ticketId);
    if (!manifest) {
        vscode.window.showErrorMessage(`${getToolName()}: Manifest not found for ${ticketId}`);
        return;
    }

    const repos = await gitManager.detectRepositories();
    const activeRepos = repos.filter(r => manifest.repos[r.name]?.mode === 'active');

    if (activeRepos.length === 0) {
        vscode.window.showWarningMessage(`${getToolName()}: No active repositories found to prepare. Please select repositories in the Workspace section first.`);
        return;
    }

    log(`Preparing workspace for ${ticketId} in ${activeRepos.length} repos`);

    for (const repo of activeRepos) {
        if (repo.isStatic) {
            vscode.window.showInformationMessage(`"${repo.name}" has no version control, hence it is already ready for your code shipment.`);
            continue;
        }
        // ... rest of Git preparation logic (not shown in previous view_file, but assuming it's below L800)
    }

    for (const repo of activeRepos) {
        const hasChanges = await gitManager.hasUncommittedChanges(repo.path);
        
        if (hasChanges) {
            const action = await vscode.window.showWarningMessage(
                `${getToolName()}: Repository "${repo.name}" has unsaved changes in branch "${repo.currentBranch}".`,
                'Stash and Switch',
                'Ignore and Switch',
                'Cancel'
            );

            if (action === 'Cancel' || !action) {
                log(`Workspace preparation cancelled for ${repo.name}`);
                continue;
            }

            if (action === 'Stash and Switch') {
                await gitManager.stashChanges(repo.path, `Auto-stash for ${ticketId}`);
            }
        }

        // Create or switch to topic branch
        await gitManager.createFeatureBranch(repo.path, 'main', branchName);
    }

    // Refresh repos to show new branches
    const updatedRepos = await gitManager.detectRepositories();
    sidebarProvider.updateState({ repositories: updatedRepos }, true);
    
    vscode.window.showInformationMessage(`${getToolName()}: Workspace prepared for ${ticketId}`);
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
    const syncAction = await vscode.window.showInformationMessage(
        `End task ${ticketId}? Sync ${logs.length} logs (${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m) to Jira?`,
        'Yes', 'No (Complete Locally)', 'Cancel'
    );

    if (syncAction === 'Cancel' || !syncAction) {
        return;
    }

    const shouldSync = syncAction === 'Yes';

    // Log total work time
    if (shouldSync && totalMinutes > 0) {
        await jiraClient.logWorkTime(ticketId, totalMinutes);
    }

    // Post detailed comment
    if (shouldSync) {
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
    }

    // Mark as completed and synced
    const manifest = await dataManager.readManifest(ticketId);
    if (manifest) {
        manifest.status = 'completed';
        manifest.lastUpdated = new Date().toISOString();
        await dataManager.writeManifest(manifest);
    }
    
    if (shouldSync) {
        await dataManager.markLogsSynced(ticketId, logs.map(l => l.id));
    }

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
    const repos = sidebarProvider.getState().repositories;
    const repo = repos.find(r => r.name === repoName);
    
    if (!repo) {
        return;
    }

    const newMode = repo.mode === 'active' ? 'reference' : 'active';
    const updatedRepos = gitManager.updateRepoMode(repos, repoName, newMode);
    
    sidebarProvider.updateState({ repositories: updatedRepos }, true);
    log(`Repository ${repoName} mode changed to ${newMode}`);

    // Persist to manifest if active task
    const activeContext = await dataManager.getActiveContext();
    if (activeContext.ticketId) {
        const manifest = await dataManager.readManifest(activeContext.ticketId);
        if (manifest) {
            if (!manifest.repos[repoName]) {
                manifest.repos[repoName] = {
                    mode: newMode,
                    branch: repo.currentBranch || 'main',
                    baseBranch: 'main',
                    createdAt: new Date().toISOString()
                };
            } else {
                manifest.repos[repoName].mode = newMode;
            }
            await dataManager.writeManifest(manifest);
        }
    }
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

    // Refresh repo list shallowly
    const updatedRepos = await gitManager.detectRepositories();
    sidebarProvider.updateState({ repositories: updatedRepos }, true);
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

    // Refresh repo list shallowly
    const updatedRepos = await gitManager.detectRepositories();
    sidebarProvider.updateState({ repositories: updatedRepos }, true);
}

/**
 * Get path to isolated environments in global storage
 */
function getGlobalEnvPath(type: 'python' | 'node'): string {
    const storagePath = globalExtensionContext.globalStorageUri.fsPath;
    return path.join(storagePath, 'environments', type);
}

/**
 * Ensure isolated environments exist
 */
async function ensureEnvironmentsExist(progress?: vscode.Progress<{ message?: string; increment?: number }>): Promise<void> {
    const fs = require('fs');
    const cp = require('child_process');
    const util = require('util');
    const exec = util.promisify(cp.exec);

    const pythonEnvPath = getGlobalEnvPath('python');
    const nodeEnvPath = getGlobalEnvPath('node');

    // Create environments directory
    const envRoot = path.dirname(pythonEnvPath);
    if (!fs.existsSync(envRoot)) {
        fs.mkdirSync(envRoot, { recursive: true });
    }

    // Python Venv
    if (!fs.existsSync(pythonEnvPath)) {
        if (progress) progress.report({ message: 'Creating Python virtual environment...' });
        log('Creating Python virtual environment...');
        try {
            await exec('python -m venv devloop-venv', { cwd: envRoot });
            // Rename to 'python' for consistency with getGlobalEnvPath
            fs.renameSync(path.join(envRoot, 'devloop-venv'), pythonEnvPath);
            // Install tools
            if (progress) progress.report({ message: 'Installing Pylint and Autopep8...' });
            const isWindows = process.platform === 'win32';
            const pip = path.join(pythonEnvPath, isWindows ? 'Scripts' : 'bin', isWindows ? 'pip.exe' : 'pip');
            await exec(`"${pip}" install pylint autopep8`, { cwd: pythonEnvPath });
        } catch (error) {
            log(`Failed to create Python venv: ${error}`);
        }
    }

    // Node environment
    if (!fs.existsSync(nodeEnvPath)) {
        if (progress) progress.report({ message: 'Initializing Node environment...' });
        log('Initializing Node environment...');
        try {
            fs.mkdirSync(nodeEnvPath, { recursive: true });
            await exec('npm init -y', { cwd: nodeEnvPath });
            // Install standard tools
            if (progress) progress.report({ message: 'Installing ESLint, HTMLLint, and Prettier...' });
            await exec('npm install eslint htmllint prettier', { cwd: nodeEnvPath });
        } catch (error) {
            log(`Failed to initialize Node environment: ${error}`);
        }
    }
}

/**
 * Get command for a tool in the isolated environment
 */
function getToolCommand(toolName: string): string {
    const pythonEnvPath = getGlobalEnvPath('python');
    const nodeEnvPath = getGlobalEnvPath('node');
    const isWindows = process.platform === 'win32';

    if (toolName === 'pylint' || toolName === 'autopep8') {
        const binDir = isWindows ? 'Scripts' : 'bin';
        const exe = isWindows ? `${toolName}.exe` : toolName;
        return path.join(pythonEnvPath, binDir, exe);
    }

    if (toolName === 'eslint' || toolName === 'htmllint' || toolName === 'prettier') {
        const binPath = path.join(nodeEnvPath, 'node_modules', '.bin', toolName);
        return isWindows ? `${binPath}.cmd` : binPath;
    }

    return toolName;
}

/**
 * Check if a tool is available in the isolated environment
 */
async function checkToolAvailability(toolName: string): Promise<boolean> {
    const fs = require('fs');
    try {
        const commandPath = getToolCommand(toolName);
        if (fs.existsSync(commandPath) || fs.existsSync(commandPath + '.exe') || fs.existsSync(commandPath + '.cmd')) {
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Run linters on changed files
 */
async function runLinting(): Promise<void> {
    log('Running linters...');
    const isWindows = process.platform === 'win32';
    
    // Get repositories from current state (includes user-selected modes)
    const repos = sidebarProvider.getState().repositories;
    let activeRepos = repos.filter(r => r.mode === 'active');
    
    if (activeRepos.length === 0) {
        if (repos.length > 0) {
            log('No repositories explicitly marked as "Active". Scanning all workspace repositories as fallback.');
            activeRepos = repos;
        } else {
            log('No repositories found to lint');
            vscode.window.showInformationMessage(`${getToolName()}: No repositories found in workspace to lint.`);
            return;
        }
    }

    const cp = require('child_process');
    const util = require('util');
    const exec = util.promisify(cp.exec);
    
    const toolCache = new Map<string, boolean>();
    const allResults: LintingResult[] = [];
    const failedToolsInThisRun = new Set<string>();

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `${getToolName()}: Scanning files...`,
        cancellable: true
    }, async (progress, token) => {
        // Ensure environments are ready
        await ensureEnvironmentsExist(progress);

        for (let i = 0; i < activeRepos.length; i++) {
            if (token.isCancellationRequested) break;
            
            const repo = activeRepos[i];
            const changedFiles = await gitManager.getDiffFiles(repo);
            
            for (let j = 0; j < changedFiles.length; j++) {
                if (token.isCancellationRequested) break;
                
                const filePath = changedFiles[j];
                progress.report({ 
                    message: `Linting ${path.basename(filePath)} (${i + 1}/${activeRepos.length})`,
                    increment: (100 / (activeRepos.length * (changedFiles.length || 1)))
                });

                const ext = path.extname(filePath).toLowerCase();
                let tool = '';
                let command = '';
                let installCmd = '';
                
                if (ext === '.py') {
                    tool = 'pylint';
                    const pylintCmd = getToolCommand('pylint');
                    command = `"${pylintCmd}" "${filePath}" --output-format=json`;
                    const pythonExe = pylintCmd.replace(/pylint(\.exe)?"$/, isWindows ? 'python.exe' : 'python');
                    installCmd = `"${pythonExe}" -m pip install pylint`;
                } else if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
                    tool = 'eslint';
                    const eslintCmd = getToolCommand('eslint');
                    command = `"${eslintCmd}" "${filePath}" --format=json`;
                    installCmd = `npm install eslint`; 
                } else if (['.html', '.htm'].includes(ext)) {
                    tool = 'htmllint';
                    const htmllintCmd = getToolCommand('htmllint');
                    command = `"${htmllintCmd}" "${filePath}"`; 
                    installCmd = `npm install htmllint`; 
                }
                
                if (tool && command) {
                    // Skip tools that already failed in this run
                    if (failedToolsInThisRun.has(tool)) continue;

                    // Check availability if not cached
                    if (!toolCache.has(tool)) {
                        const available = await checkToolAvailability(tool);
                        toolCache.set(tool, available);
                        if (!available) {
                            failedToolsInThisRun.add(tool);
                            const action = await vscode.window.showErrorMessage(
                                `${getToolName()}: ${tool} not found in isolated environment.`,
                                'Install Tool', 'Ignore'
                            );
                            if (action === 'Install Tool') {
                                const terminal = vscode.window.createTerminal(`${getToolName()} Installer`);
                                terminal.show();
                                if (tool === 'pylint') {
                                    terminal.sendText(installCmd);
                                } else {
                                    terminal.sendText(`cd "${getGlobalEnvPath('node')}" && ${installCmd}`);
                                }
                            }
                            continue;
                        }
                    }

                    if (!toolCache.get(tool)) continue;

                    try {
                        log(`Linting ${path.basename(filePath)} with ${tool}...`);
                        
                        let stdout: string;
                        try {
                            const execResult = await exec(command, { cwd: repo.path });
                            stdout = execResult.stdout;
                        } catch (execError: any) {
                            stdout = execError.stdout || execError.stderr || '';
                            if (!stdout && execError.message) {
                                log(`Tool ${tool} failed: ${execError.message}`);
                                if (execError.message.includes('not recognized') || execError.message.includes('not found')) {
                                    failedToolsInThisRun.add(tool);
                                }
                                continue;
                            }
                        }
                        
                        // JSON validation before parsing
                        if (tool === 'pylint' || tool === 'eslint') {
                            try {
                                const issues = JSON.parse(stdout);
                                if (tool === 'pylint') {
                                    issues.forEach((issue: any) => {
                                        allResults.push({
                                            tool: 'pylint',
                                            severity: issue.type === 'error' ? 'error' : 'warning',
                                            file: filePath,
                                            line: issue.line,
                                            message: issue.message,
                                            canFix: false
                                        });
                                    });
                                } else {
                                    issues.forEach((res: any) => {
                                        res.messages.forEach((msg: any) => {
                                            allResults.push({
                                                tool: 'eslint',
                                                severity: msg.severity === 2 ? 'error' : 'warning',
                                                file: filePath,
                                                line: msg.line,
                                                message: msg.message,
                                                canFix: !!msg.fix
                                            });
                                        });
                                    });
                                }
                            } catch (e) { 
                                log(`Failed to parse ${tool} output for ${path.basename(filePath)}. Output was not valid JSON.`);
                            }
                        } else if (tool === 'htmllint') {
                            const lines = stdout.split('\n');
                            lines.forEach(line => {
                                const match = line.match(/^line (\d+), col \d+, (.*)$/i);
                                if (match) {
                                    allResults.push({
                                        tool: 'htmllint',
                                        severity: 'error',
                                        file: filePath,
                                        line: parseInt(match[1]),
                                        message: match[2],
                                        canFix: true
                                    });
                                }
                            });
                        }
                    } catch (error: any) {
                        log(`Major error during linting of ${filePath}: ${error.message}`);
                    }
                }
            }
        }
    });

    // Update UI once at the end (flicker prevention)
    sidebarProvider.updateState({ lintingResults: allResults }, true);
    
    // Save results for persistence
    await dataManager.writeLintingResults(allResults);
    
    if (allResults.length > 0) {
        vscode.window.showInformationMessage(`${getToolName()}: Linting completed. Found ${allResults.length} issues.`);
    } else if (failedToolsInThisRun.size === 0) {
        vscode.window.showInformationMessage(`${getToolName()}: Linting completed. No issues found.`);
    }
}

/**
 * Find the repository that contains the given file
 */
function getRepoForFile(filePath: string): Repository | undefined {
    const repos = sidebarProvider.getState().repositories;
    const normalizedFile = filePath.toLowerCase().replace(/\\/g, '/');
    
    // Sort by path length descending to find the most specific match
    const sortedRepos = [...repos].sort((a, b) => b.path.length - a.path.length);
    
    let match = sortedRepos.find(r => {
        const normalizedRepo = r.path.toLowerCase().replace(/\\/g, '/');
        return normalizedFile.startsWith(normalizedRepo);
    });

    if (!match) {
        // Fallback to VS Code API
        const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
        if (folder) {
            return {
                name: folder.name,
                path: folder.uri.fsPath,
                mode: 'active',
                currentBranch: 'main',
                baseBranch: 'main',
                status: { state: 'clean' },
                hasUncommittedChanges: false,
                uncommittedFiles: 0,
                uncommittedLines: 0
            };
        }
    }
    return match;
}

/**
 * Fix a specific linting issue
 */
async function fixIssue(payload: any): Promise<void> {
    const { file, line } = payload as { file: string, line: number };
    await ensureEnvironmentsExist();
    log(`Attempting to auto-fix issue in ${path.basename(file)}...`);

    const ext = path.extname(file).toLowerCase();
    let command = '';

    if (ext === '.py') {
        command = `${getToolCommand('autopep8')} --in-place "${file}"`;
    } else if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
        command = `${getToolCommand('eslint')} --fix "${file}"`;
    } else if (['.html', '.htm'].includes(ext)) {
        command = `${getToolCommand('prettier')} --write "${file}"`;
    }

    if (command) {
        const cp = require('child_process');
        const util = require('util');
        const exec = util.promisify(cp.exec);

        try {
            const repo = getRepoForFile(file);
            const execOptions: any = { cwd: repo ? repo.path : path.dirname(file) };
            const searchDir = repo ? repo.path : path.dirname(file);
            
            log(`Fixing ${ext} file. Repo: ${repo ? repo.name : 'Not found'} at ${execOptions.cwd}`);

            // Special handling for ESLint
            if (command.includes('eslint')) {
                execOptions.env = { ...process.env, ESLINT_USE_FLAT_CONFIG: 'false' };
                if (ext === '.ts' || ext === '.tsx') {
                    const tsConfig = await ensureLinterConfig(searchDir, 'typescript');
                    if (tsConfig && !command.includes('--parser-options')) {
                        command += ` --parser-options=project:./${tsConfig}`;
                    }
                }
            } else if (command.includes('autopep8')) {
                const pyConfig = await ensureLinterConfig(searchDir, 'python');
                if (pyConfig) {
                    command += ` --global-config ./${pyConfig}`;
                }
            } else if (command.includes('prettier')) {
                const htmlConfig = await ensureLinterConfig(searchDir, 'html');
                if (htmlConfig) {
                    command += ` --config ./${htmlConfig}`;
                }
            }
            
            log(`Executing: ${command}`);
            await exec(command, execOptions);
            log(`Auto-fix successful for ${path.basename(file)}`);
            vscode.window.showInformationMessage(`${getToolName()}: Fixed issues in ${path.basename(file)}`);
            
            // Re-run linting to update UI
            await runLinting();
        } catch (error: any) {
            log(`Failed to auto-fix ${file}: ${error.message}`);
            
            // Retry specifically if we didn't have the project flag and it's requested
            if (error.message.includes('parserServices') && !command.includes('--parser-options')) {
                const repo = getRepoForFile(file);
                if (repo) {
                    const fs = require('fs');
                    const tsconfigPath = path.join(repo.path, 'tsconfig.json');
                    if (fs.existsSync(tsconfigPath)) {
                        log(`Retrying with tsconfig.json for ${path.basename(file)}...`);
                        const retryCommand = `${command} --parser-options project:tsconfig.json`;
                        try {
                            const execOptions: any = { 
                                cwd: repo.path,
                                env: { ...process.env, ESLINT_USE_FLAT_CONFIG: 'false' }
                            };
                            await exec(retryCommand, execOptions);
                            log(`Auto-fix successful on retry for ${path.basename(file)}`);
                            vscode.window.showInformationMessage(`${getToolName()}: Fixed issues in ${path.basename(file)} (with TS project)`);
                            await runLinting();
                            return;
                        } catch (retryError: any) {
                            log(`Retry failed for ${file}: ${retryError.message}`);
                        }
                    }
                }
            }
            
            // Provide more helpful message for ESLint config errors
            if (error.message.includes('ESLint couldn\'t find an eslint.config')) {
                vscode.window.showErrorMessage(`${getToolName()}: ESLint auto-fix failed. No configuration found. Try creating an eslint.config.js or .eslintrc file.`);
            } else if (error.message.includes('parserServices')) {
                vscode.window.showErrorMessage(`${getToolName()}: TypeScript ESLint requires a tsconfig.json to run this rule. ${error.message.substring(0, 100)}...`);
            } else {
                vscode.window.showErrorMessage(`${getToolName()}: Auto-fix failed: ${error.message}`);
            }
        }
    } else {
        vscode.window.showInformationMessage(`${getToolName()}: No auto-fix command available for this file type.`);
    }
}

/**
 * Fix all auto-fixable issues in a specific category
 */
async function fixAllIssues(category: string): Promise<void> {
    const results = sidebarProvider.getState().lintingResults || [];
    let toFix: string[] = [];

    if (category === 'python') {
        toFix = [...new Set(results.filter(r => ['pylint', 'pep8', 'pyflakes'].includes(r.tool.toLowerCase())).map(r => r.file))];
    } else if (category === 'javascript') {
        toFix = [...new Set(results.filter(r => ['eslint', 'jslint', 'typescript'].includes(r.tool.toLowerCase()) && r.canFix).map(r => r.file))];
    } else if (category === 'html') {
        toFix = [...new Set(results.filter(r => r.tool.toLowerCase() === 'htmllint').map(r => r.file))];
    }

    if (toFix.length === 0) {
        vscode.window.showInformationMessage(`${getToolName()}: No auto-fixable issues found for ${category}.`);
        return;
    }

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Fixing ${category} issues...`,
        cancellable: false
    }, async (progress) => {
        for (let i = 0; i < toFix.length; i++) {
            const file = toFix[i];
            progress.report({ message: `Fixing ${path.basename(file)}...`, increment: (100 / toFix.length) });
            
            const ext = path.extname(file).toLowerCase();
            let command = '';
            if (ext === '.py') command = `npx autopep8 --in-place "${file}"`;
            else if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) command = `npx eslint --fix "${file}"`;
            else if (['.html', '.htm'].includes(ext)) command = `npx prettier --write "${file}"`;

            if (command) {
                try {
                    const cp = require('child_process');
                    const util = require('util');
                    const exec = util.promisify(cp.exec);
                    
                    const repo = getRepoForFile(file);
                    const execOptions: any = { cwd: repo ? repo.path : path.dirname(file) };
                    const searchDir = repo ? repo.path : path.dirname(file);
                    
                    if (command.includes('eslint')) {
                        execOptions.env = { ...process.env, ESLINT_USE_FLAT_CONFIG: 'false' };
                        if (ext === '.ts' || ext === '.tsx') {
                            const tsConfig = await ensureLinterConfig(searchDir, 'typescript');
                            if (tsConfig && !command.includes('--parser-options')) {
                                command += ` --parser-options=project:./${tsConfig}`;
                            }
                        }
                    } else if (command.includes('autopep8')) {
                        const pyConfig = await ensureLinterConfig(searchDir, 'python');
                        if (pyConfig) command += ` --global-config ./${pyConfig}`;
                    } else if (command.includes('prettier')) {
                        const htmlConfig = await ensureLinterConfig(searchDir, 'html');
                        if (htmlConfig) command += ` --config ./${htmlConfig}`;
                    }
                    
                    log(`Batch executing: ${command}`);
                    await exec(command, execOptions);
                } catch (e) {
                    log(`Error fixing ${file}: ${e}`);
                }
            }
        }
    });

    log(`Fixed all ${category} issues.`);
    vscode.window.showInformationMessage(`${getToolName()}: Finished fixing ${category} issues.`);
    
    // Re-run linting to update UI
    await runLinting();
}

/**
 * Ensure a linter config exists for the given type
 */
async function ensureLinterConfig(repoPath: string, type: 'typescript' | 'python' | 'html'): Promise<string | undefined> {
    const fs = require('fs');
    
    if (type === 'typescript') {
        const primary = path.join(repoPath, 'tsconfig.json');
        if (fs.existsSync(primary)) return 'tsconfig.json';
        const secondary = path.join(repoPath, 'tsconfig.eslint.json');
        if (fs.existsSync(secondary)) return 'tsconfig.eslint.json';

        const devloopConfig = path.join(repoPath, '.devloop.tsconfig.json');
        if (!fs.existsSync(devloopConfig)) {
            try {
                const templatePath = path.join(globalExtensionUri.fsPath, 'resources', 'tsconfig.eslint.json');
                if (fs.existsSync(templatePath)) {
                    fs.writeFileSync(devloopConfig, fs.readFileSync(templatePath, 'utf8'));
                } else {
                    const minimal = { compilerOptions: { target: "es6", module: "commonjs", allowJs: true, noEmit: true, skipLibCheck: true }, include: ["**/*"] };
                    fs.writeFileSync(devloopConfig, JSON.stringify(minimal, null, 2));
                }
            } catch (e) { log(`Failed to create TS config: ${e}`); return undefined; }
        }
        return '.devloop.tsconfig.json';
    } 
    
    if (type === 'python') {
        const primary = path.join(repoPath, '.pep8');
        if (fs.existsSync(primary)) return '.pep8';
        const secondary = path.join(repoPath, 'setup.cfg');
        if (fs.existsSync(secondary)) return 'setup.cfg';

        const devloopConfig = path.join(repoPath, '.devloop.pep8');
        if (!fs.existsSync(devloopConfig)) {
            try {
                const templatePath = path.join(globalExtensionUri.fsPath, 'resources', 'pep8.config');
                if (fs.existsSync(templatePath)) {
                    fs.writeFileSync(devloopConfig, fs.readFileSync(templatePath, 'utf8'));
                } else {
                    fs.writeFileSync(devloopConfig, "[pycodestyle]\nmax_line_length = 120\n");
                }
            } catch (e) { log(`Failed to create PEP8 config: ${e}`); return undefined; }
        }
        return '.devloop.pep8';
    }

    if (type === 'html') {
        const primary = path.join(repoPath, '.prettierrc');
        if (fs.existsSync(primary)) return '.prettierrc';
        const secondary = path.join(repoPath, 'prettier.config.json');
        if (fs.existsSync(secondary)) return 'prettier.config.json';

        const devloopConfig = path.join(repoPath, '.devloop.prettierrc');
        if (!fs.existsSync(devloopConfig)) {
            try {
                const templatePath = path.join(globalExtensionUri.fsPath, 'resources', 'prettier.config.json');
                if (fs.existsSync(templatePath)) {
                    fs.writeFileSync(devloopConfig, fs.readFileSync(templatePath, 'utf8'));
                } else {
                    fs.writeFileSync(devloopConfig, "{ \"semi\": true, \"singleQuote\": true }\n");
                }
            } catch (e) { log(`Failed to create Prettier config: ${e}`); return undefined; }
        }
        return '.devloop.prettierrc';
    }

    return undefined;
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
export async function deactivate() {
    log('Extension deactivating...');
    if (timeTracker && timeTracker.getState().isRunning) {
        // One final persist
        const state = timeTracker.getPersistenceState();
        await dataManager.saveTimerState(state);
        log('Final timer state persisted');
    }
    
    if (timeTracker) {
        timeTracker.dispose();
    }
    if (outputChannel) {
        outputChannel.dispose();
    }
}
