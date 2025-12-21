import * as vscode from 'vscode';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { CredentialManager } from './CredentialManager';

/**
 * Jenkins job status
 */
export interface JenkinsJobStatus {
    building: boolean;
    result: 'SUCCESS' | 'FAILURE' | 'UNSTABLE' | 'ABORTED' | 'NOT_BUILT' | null;
    duration: number;
    estimatedDuration: number;
    timestamp: number;
    url: string;
}

/**
 * Jenkins build info
 */
export interface JenkinsBuildInfo {
    number: number;
    url: string;
    queueId: number;
}

/**
 * Jenkins connection status
 */
export interface JenkinsConnectionStatus {
    connected: boolean;
    message: string;
    version?: string;
}

/**
 * Jenkins REST API Client
 * Handles job triggering, status monitoring, and build log retrieval
 */
export class JenkinsClient {
    private client: AxiosInstance | null = null;
    private useMock: boolean;
    private outputChannel: vscode.OutputChannel;

    constructor(
        private readonly credentialManager: CredentialManager,
        outputChannel: vscode.OutputChannel
    ) {
        this.outputChannel = outputChannel;
        this.useMock = vscode.workspace.getConfiguration('devloop').get('useMockData', false);
    }

    /**
     * Initialize the HTTP client with credentials
     */
    async initialize(): Promise<boolean> {
        if (this.useMock) {
            this.log('Using mock Jenkins data (devloop.useMockData = true)');
            return true;
        }

        const baseUrl = vscode.workspace.getConfiguration('devloop').get<string>('jenkins.baseUrl');
        const username = vscode.workspace.getConfiguration('devloop').get<string>('jenkins.username');
        const token = await this.credentialManager.getJenkinsToken();

        if (!baseUrl) {
            this.log('Jenkins not configured: missing baseUrl');
            return false;
        }

        if (!username || !token) {
            this.log('Jenkins not configured: missing username or API token');
            return false;
        }

        // Jenkins uses username:token as Basic Auth
        const authString = Buffer.from(`${username}:${token}`).toString('base64');

        this.client = axios.create({
            baseURL: baseUrl,
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 30000 // Jenkins can be slow
        });

        this.log('Jenkins client initialized');
        return true;
    }

    /**
     * Check if Jenkins is configured and accessible
     */
    async checkConnection(): Promise<JenkinsConnectionStatus> {
        if (this.useMock) {
            return { 
                connected: true, 
                message: 'Mock Connected',
                version: '2.0.0-mock'
            };
        }

        if (!this.client) {
            const initialized = await this.initialize();
            if (!initialized) {
                return { connected: false, message: 'Not configured' };
            }
        }

        try {
            const response = await this.client!.get('/api/json');
            return { 
                connected: true, 
                message: 'Connected',
                version: response.data.version || 'Unknown'
            };
        } catch (error) {
            const msg = this.getErrorMessage(error);
            return { connected: false, message: msg };
        }
    }

    /**
     * Trigger a Jenkins job with parameters
     */
    async triggerJob(
        jobName: string, 
        parameters: Record<string, string> = {}
    ): Promise<JenkinsBuildInfo | null> {
        this.log(`Triggering job: ${jobName} with parameters: ${JSON.stringify(parameters)}`);

        if (this.useMock) {
            const mockBuild: JenkinsBuildInfo = {
                number: Math.floor(Math.random() * 1000) + 1,
                url: `http://jenkins.mock/job/${jobName}/123/`,
                queueId: Math.floor(Math.random() * 10000)
            };
            this.log(`[MOCK] Job triggered: ${JSON.stringify(mockBuild)}`);
            vscode.window.showInformationMessage(`[Mock] Jenkins job ${jobName} #${mockBuild.number} triggered`);
            return mockBuild;
        }

        try {
            // Build the job URL
            const hasParams = Object.keys(parameters).length > 0;
            const endpoint = hasParams 
                ? `/job/${jobName}/buildWithParameters`
                : `/job/${jobName}/build`;

            // Trigger the build
            const response = await this.client!.post(endpoint, null, {
                params: parameters
            });

            // Extract queue location from response headers
            const queueLocation = response.headers['location'];
            if (!queueLocation) {
                this.log('Warning: No queue location in response');
                return null;
            }

            // Parse queue ID from location
            const queueIdMatch = queueLocation.match(/\/queue\/item\/(\d+)\//);
            const queueId = queueIdMatch ? parseInt(queueIdMatch[1]) : 0;

            this.log(`Job queued with ID: ${queueId}`);

            return {
                number: 0, // Will be assigned when build starts
                url: queueLocation,
                queueId
            };
        } catch (error) {
            this.log(`Error triggering job: ${this.getErrorMessage(error)}`);
            vscode.window.showErrorMessage(`Failed to trigger Jenkins job: ${this.getErrorMessage(error)}`);
            return null;
        }
    }

    /**
     * Get job status by build number
     */
    async getJobStatus(jobName: string, buildNumber: number): Promise<JenkinsJobStatus | null> {
        this.log(`Getting status for ${jobName} #${buildNumber}`);

        if (this.useMock) {
            const mockStatus: JenkinsJobStatus = {
                building: false,
                result: 'SUCCESS',
                duration: 45000,
                estimatedDuration: 60000,
                timestamp: Date.now() - 60000,
                url: `http://jenkins.mock/job/${jobName}/${buildNumber}/`
            };
            return mockStatus;
        }

        try {
            const response = await this.client!.get(`/job/${jobName}/${buildNumber}/api/json`);
            const data = response.data;

            return {
                building: data.building || false,
                result: data.result,
                duration: data.duration || 0,
                estimatedDuration: data.estimatedDuration || 0,
                timestamp: data.timestamp || 0,
                url: data.url || ''
            };
        } catch (error) {
            this.log(`Error getting job status: ${this.getErrorMessage(error)}`);
            return null;
        }
    }

    /**
     * Get build console log
     */
    async getBuildLog(jobName: string, buildNumber: number): Promise<string | null> {
        this.log(`Fetching build log for ${jobName} #${buildNumber}`);

        if (this.useMock) {
            return `[MOCK] Build log for ${jobName} #${buildNumber}\nBuild started...\nRunning tests...\nBuild completed successfully!`;
        }

        try {
            const response = await this.client!.get(
                `/job/${jobName}/${buildNumber}/consoleText`,
                { responseType: 'text' }
            );
            return response.data;
        } catch (error) {
            this.log(`Error fetching build log: ${this.getErrorMessage(error)}`);
            return null;
        }
    }

    /**
     * Get latest build number for a job
     */
    async getLatestBuildNumber(jobName: string): Promise<number | null> {
        if (this.useMock) {
            return Math.floor(Math.random() * 100) + 1;
        }

        try {
            const response = await this.client!.get(`/job/${jobName}/api/json`);
            return response.data.lastBuild?.number || null;
        } catch (error) {
            this.log(`Error getting latest build number: ${this.getErrorMessage(error)}`);
            return null;
        }
    }

    /**
     * Wait for build to complete
     */
    async waitForBuildCompletion(
        jobName: string, 
        buildNumber: number,
        timeoutMs: number = 300000 // 5 minutes default
    ): Promise<JenkinsJobStatus | null> {
        const startTime = Date.now();
        const pollInterval = 5000; // Poll every 5 seconds

        while (Date.now() - startTime < timeoutMs) {
            const status = await this.getJobStatus(jobName, buildNumber);
            
            if (!status) {
                return null;
            }

            if (!status.building) {
                this.log(`Build completed with result: ${status.result}`);
                return status;
            }

            this.log(`Build still running... (${Math.floor((Date.now() - startTime) / 1000)}s elapsed)`);
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        this.log('Build wait timeout exceeded');
        return null;
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
        this.outputChannel.appendLine(`[${timestamp}] [Jenkins] ${message}`);
    }
}
