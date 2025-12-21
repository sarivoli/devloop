import * as vscode from 'vscode';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { JiraTicket, JiraComment, JiraWorklog, JiraStatus } from './types';
import { CredentialManager } from './CredentialManager';

/**
 * Mock data for development/testing without live Jira
 */
const MOCK_TICKETS: Record<string, JiraTicket> = {
    'JIRA-1234': {
        id: '10001',
        key: 'JIRA-1234',
        summary: 'Implement OAuth2 authentication for user login',
        description: 'Add OAuth2 support with SSO integration',
        status: { id: '3', name: 'Dev Assigned', category: 'in_progress' },
        assignee: 'developer@company.com',
        reporter: 'pm@company.com',
        priority: 'High',
        issueType: 'Story',
        created: '2025-01-10T09:00:00Z',
        updated: '2025-01-15T14:30:00Z'
    },
    'DL-123': {
        id: '10002',
        key: 'DL-123',
        summary: `Setup ${vscode.workspace.getConfiguration('devloop').get('branding.name') || 'DevLoop'} extension infrastructure`,
        description: `Create base extension with sidebar and data management`,
        status: { id: '3', name: 'In Progress', category: 'in_progress' },
        assignee: 'developer@company.com',
        reporter: 'tech-lead@company.com',
        priority: 'Medium',
        issueType: 'Task',
        created: '2025-01-12T10:00:00Z',
        updated: '2025-01-15T11:00:00Z'
    }
};

/**
 * Jira REST API Client with mock fallback
 */
export class JiraClient {
    private client: AxiosInstance | null = null;
    private useMock: boolean;
    private outputChannel: vscode.OutputChannel;

    constructor(
        private readonly credentialManager: CredentialManager,
        outputChannel: vscode.OutputChannel
    ) {
        this.outputChannel = outputChannel;
        // Default to FALSE (Real Mode) unless explicitly set to true
        this.useMock = vscode.workspace.getConfiguration('devloop').get('useMockData', false);
    }

    /**
     * Normalize and validate Jira URL
     */
    private normalizeUrl(url: string): string {
        let normalized = url.trim();
        
        // Remove trailing slashes
        normalized = normalized.replace(/\/+$/, '');
        
        // Ensure https if no protocol specified
        if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
            normalized = 'https://' + normalized;
        }
        
        return normalized;
    }

    /**
     * Initialize the HTTP client with credentials
     */
    async initialize(): Promise<boolean> {
        if (this.useMock) {
            this.log('Using mock Jira data (devloop.useMockData = true)');
            return true;
        }

        const baseUrl = vscode.workspace.getConfiguration('devloop').get<string>('jira.baseUrl');
        const email = vscode.workspace.getConfiguration('devloop').get<string>('jira.email');
        const token = await this.credentialManager.getJiraToken();

        if (!baseUrl) {
            this.log('Jira not configured: missing baseUrl');
            return false;
        }

        if (!email || !token) {
            this.log('Jira not configured: missing email or API token');
            return false;
        }

        // Normalize URL
        const normalizedUrl = this.normalizeUrl(baseUrl);

        // Jira uses email:token as Basic Auth for API v3
        const authString = Buffer.from(`${email}:${token}`).toString('base64');

        this.client = axios.create({
            baseURL: normalizedUrl,
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 15000
        });

        this.log('Jira client initialized with API v3 token-based auth');
        return true;
    }

    /**
     * Validate complete Jira configuration
     */
    async validateConfiguration(): Promise<{
        valid: boolean;
        url: boolean;
        auth: boolean;
        permissions: boolean;
        message: string;
        userInfo?: { email: string; displayName: string };
    }> {
        const baseUrl = vscode.workspace.getConfiguration('devloop').get<string>('jira.baseUrl');
        const email = vscode.workspace.getConfiguration('devloop').get<string>('jira.email');
        const token = await this.credentialManager.getJiraToken();

        // Check URL
        if (!baseUrl || baseUrl.trim().length === 0) {
            return {
                valid: false,
                url: false,
                auth: false,
                permissions: false,
                message: 'Jira base URL is not configured. Please set it in settings.'
            };
        }

        // Validate URL format
        try {
            const normalized = this.normalizeUrl(baseUrl);
            new URL(normalized);
        } catch (error) {
            return {
                valid: false,
                url: false,
                auth: false,
                permissions: false,
                message: 'Invalid Jira URL format. Please check the URL in settings.'
            };
        }

        // Check credentials
        if (!email || !token) {
            return {
                valid: false,
                url: true,
                auth: false,
                permissions: false,
                message: 'Jira credentials are missing. Please configure email and API token.'
            };
        }

        // Validate email format
        if (!email.includes('@')) {
            return {
                valid: false,
                url: true,
                auth: false,
                permissions: false,
                message: 'Invalid email format. Please check your Jira email in settings.'
            };
        }

        // Initialize client
        const initialized = await this.initialize();
        if (!initialized) {
            return {
                valid: false,
                url: true,
                auth: false,
                permissions: false,
                message: 'Failed to initialize Jira client.'
            };
        }

        // Test connection and get user info
        const userInfo = await this.getCurrentUser();
        if (!userInfo) {
            return {
                valid: false,
                url: true,
                auth: false,
                permissions: false,
                message: 'Authentication failed. Please verify your API token.'
            };
        }

        // All checks passed
        return {
            valid: true,
            url: true,
            auth: true,
            permissions: true,
            message: 'Connected successfully',
            userInfo
        };
    }

    /**
     * Get current authenticated user information
     */
    async getCurrentUser(): Promise<{ email: string; displayName: string; accountId: string } | null> {
        if (this.useMock) {
            return {
                email: 'developer@company.com',
                displayName: 'Mock Developer',
                accountId: 'mock-account-123'
            };
        }

        try {
            // Use API v3 endpoint
            const response = await this.client!.get('/rest/api/3/myself');
            return {
                email: response.data.emailAddress || '',
                displayName: response.data.displayName || '',
                accountId: response.data.accountId || ''
            };
        } catch (error) {
            this.log(`Error fetching current user: ${this.getErrorMessage(error)}`);
            return null;
        }
    }

    /**
     * Check if Jira is configured and accessible
     */
    async checkConnection(): Promise<{ connected: boolean; message: string }> {
        if (this.useMock) {
            return { connected: true, message: 'Mock Connected' };
        }

        if (!this.client) {
            const initialized = await this.initialize();
            if (!initialized) {
                return { connected: false, message: 'Not configured' };
            }
        }

        try {
            // Use API v3 endpoint
            await this.client!.get('/rest/api/3/myself');
            return { connected: true, message: 'Connected' };
        } catch (error) {
            const msg = this.getErrorMessage(error);
            return { connected: false, message: msg };
        }
    }

    /**
     * Fetch ticket details by ID
     */
    async getTicket(ticketId: string): Promise<JiraTicket | null> {
        this.log(`Fetching ticket: ${ticketId}`);

        if (this.useMock) {
            const ticket = MOCK_TICKETS[ticketId.toUpperCase()];
            if (ticket) {
                return ticket;
            }
            // Return a generic mock ticket for any ID
            return {
                id: '99999',
                key: ticketId.toUpperCase(),
                summary: `Mock ticket for ${ticketId}`,
                description: 'This is a mock ticket for development',
                status: { id: '3', name: 'In Progress', category: 'in_progress' },
                assignee: 'developer@company.com',
                reporter: 'system',
                priority: 'Medium',
                issueType: 'Task',
                created: new Date().toISOString(),
                updated: new Date().toISOString()
            };
        }

        try {
            this.log(`[REAL] Fetching ticket ${ticketId} from Jira API v3...`);
            const response = await this.client!.get(`/rest/api/3/issue/${ticketId}`);
            return this.mapTicketResponse(response.data);
        } catch (error) {
            this.log(`Error fetching ticket ${ticketId}: ${this.getErrorMessage(error)}`);
            return null;
        }
    }

    /**
     * Post a comment to a ticket
     */
    async postComment(ticketId: string, body: string): Promise<boolean> {
        this.log(`Posting comment to ${ticketId}`);

        if (this.useMock) {
            this.log(`[MOCK] Comment posted to ${ticketId}: ${body.substring(0, 50)}...`);
            vscode.window.showInformationMessage(`[Mock] Comment posted to ${ticketId}`);
            return true;
        }

        try {
            // API v3 uses different comment structure
            await this.client!.post(`/rest/api/3/issue/${ticketId}/comment`, { 
                body: {
                    type: 'doc',
                    version: 1,
                    content: [
                        {
                            type: 'paragraph',
                            content: [
                                {
                                    type: 'text',
                                    text: body
                                }
                            ]
                        }
                    ]
                }
            });
            return true;
        } catch (error) {
            this.log(`Error posting comment: ${this.getErrorMessage(error)}`);
            return false;
        }
    }

    /**
     * Update ticket status via transition
     */
    async updateStatus(ticketId: string, transitionId: string): Promise<boolean> {
        this.log(`Updating status for ${ticketId} to transition ${transitionId}`);

        if (this.useMock) {
            this.log(`[MOCK] Status updated for ${ticketId}`);
            return true;
        }

        try {
            await this.client!.post(`/rest/api/3/issue/${ticketId}/transitions`, {
                transition: { id: transitionId }
            });
            return true;
        } catch (error) {
            this.log(`Error updating status: ${this.getErrorMessage(error)}`);
            return false;
        }
    }

    /**
     * Log work time to ticket
     */
    async logWorkTime(ticketId: string, minutes: number, comment?: string): Promise<boolean> {
        this.log(`Logging ${minutes} minutes to ${ticketId}`);

        if (this.useMock) {
            this.log(`[MOCK] Logged ${minutes} minutes to ${ticketId}`);
            vscode.window.showInformationMessage(
                `[Mock] Logged ${Math.floor(minutes / 60)}h ${minutes % 60}m to ${ticketId}`
            );
            return true;
        }

        const worklog: JiraWorklog = {
            timeSpentSeconds: minutes * 60,
            comment: comment || `Development work - Auto-logged by ${vscode.workspace.getConfiguration('devloop').get('branding.name') || 'DevLoop'} Extension`,
            started: new Date().toISOString().replace('Z', '+0000')
        };

        try {
            await this.client!.post(`/rest/api/3/issue/${ticketId}/worklog`, worklog);
            return true;
        } catch (error) {
            this.log(`Error logging work: ${this.getErrorMessage(error)}`);
            return false;
        }
    }

    /**
     * Get available transitions for a ticket
     */
    async getTransitions(ticketId: string): Promise<Array<{ id: string; name: string }>> {
        if (this.useMock) {
            return [
                { id: '11', name: 'Start Progress' },
                { id: '21', name: 'Resolve' },
                { id: '31', name: 'Close' }
            ];
        }

        try {
            const response = await this.client!.get(`/rest/api/3/issue/${ticketId}/transitions`);
            return response.data.transitions.map((t: any) => ({
                id: t.id,
                name: t.name
            }));
        } catch (error) {
            this.log(`Error getting transitions: ${this.getErrorMessage(error)}`);
            return [];
        }
    }

    /**
     * Find transition ID by name (case-insensitive)
     */
    async findTransitionByName(ticketId: string, transitionName: string): Promise<string | null> {
        const transitions = await this.getTransitions(ticketId);
        const found = transitions.find(t => 
            t.name.toLowerCase().includes(transitionName.toLowerCase())
        );
        return found ? found.id : null;
    }

    /**
     * Start development on a ticket (transition to "In Progress" or "Dev Assigned")
     */
    async startDevelopment(ticketId: string): Promise<boolean> {
        this.log(`Starting development on ${ticketId}`);

        if (this.useMock) {
            this.log(`[MOCK] Started development on ${ticketId}`);
            return true;
        }

        // Try common transition names
        const transitionNames = ['In Progress', 'Start Progress', 'Dev Assigned', 'Start Development'];
        
        for (const name of transitionNames) {
            const transitionId = await this.findTransitionByName(ticketId, name);
            if (transitionId) {
                this.log(`Found transition "${name}" (ID: ${transitionId})`);
                return await this.updateStatus(ticketId, transitionId);
            }
        }

        this.log(`No suitable transition found for starting development on ${ticketId}`);
        return false;
    }

    /**
     * Map Jira API response to our ticket type
     */
    private mapTicketResponse(data: any): JiraTicket {
        const fields = data.fields || {};
        return {
            id: data.id,
            key: data.key,
            summary: fields.summary || '',
            description: fields.description || '',
            status: {
                id: fields.status?.id || '',
                name: fields.status?.name || 'Unknown',
                category: this.mapStatusCategory(fields.status?.statusCategory?.key)
            },
            assignee: fields.assignee?.emailAddress || fields.assignee?.displayName || null,
            reporter: fields.reporter?.emailAddress || fields.reporter?.displayName || '',
            priority: fields.priority?.name || 'Medium',
            issueType: fields.issuetype?.name || 'Task',
            created: fields.created || '',
            updated: fields.updated || ''
        };
    }

    /**
     * Map Jira status category to our categories
     */
    private mapStatusCategory(key: string): 'todo' | 'in_progress' | 'done' {
        switch (key) {
            case 'new':
            case 'undefined':
                return 'todo';
            case 'indeterminate':
                return 'in_progress';
            case 'done':
                return 'done';
            default:
                return 'in_progress';
        }
    }

    /**
     * Extract error message from axios error
     */
    private getErrorMessage(error: unknown): string {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;
            if (axiosError.response) {
                return `${axiosError.response.status}: ${axiosError.response.statusText}`;
            }
            return axiosError.message;
        }
        return String(error);
    }

    /**
     * Log to output channel
     */
    private log(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] [Jira] ${message}`);
    }
}
