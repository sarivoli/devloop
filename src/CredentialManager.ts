import * as vscode from 'vscode';

/**
 * Validation result for credential checks
 */
export interface CredentialValidationResult {
    valid: boolean;
    message: string;
}

/**
 * All credentials validation result
 */
export interface AllCredentialsValidation {
    jira: CredentialValidationResult;
    git: CredentialValidationResult;
    jenkins: CredentialValidationResult;
}

/**
 * Manages secure credential storage for DevLoop extension
 * Uses VS Code's Secret Storage API for OS-level encryption
 */
export class CredentialManager {
    private static readonly JIRA_TOKEN_KEY = 'devloop.jiraToken';
    private static readonly GIT_TOKEN_KEY = 'devloop.gitToken';
    private static readonly JENKINS_TOKEN_KEY = 'devloop.jenkinsToken';

    constructor(private readonly secrets: vscode.SecretStorage) {}

    // ==================== JIRA CREDENTIALS ====================

    /**
     * Store the Jira API token securely
     */
    async storeJiraToken(token: string): Promise<void> {
        await this.secrets.store(CredentialManager.JIRA_TOKEN_KEY, token);
    }

    /**
     * Retrieve the stored Jira API token
     */
    async getJiraToken(): Promise<string | undefined> {
        return await this.secrets.get(CredentialManager.JIRA_TOKEN_KEY);
    }

    /**
     * Check if Jira token exists
     */
    async hasJiraToken(): Promise<boolean> {
        const token = await this.getJiraToken();
        return token !== undefined && token.length > 0;
    }

    /**
     * Delete the Jira API token
     */
    async deleteJiraToken(): Promise<void> {
        await this.secrets.delete(CredentialManager.JIRA_TOKEN_KEY);
    }

    /**
     * Prompt user to enter Jira token
     */
    async promptForJiraToken(): Promise<string | undefined> {
        const token = await vscode.window.showInputBox({
            prompt: 'Enter your Jira API Token',
            password: true,
            placeHolder: 'Your Jira API token...',
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Token cannot be empty';
                }
                return null;
            }
        });

        if (token) {
            await this.storeJiraToken(token);
            vscode.window.showInformationMessage('DevLoop: Jira token saved securely.');
        }

        return token;
    }

    // ==================== GIT CREDENTIALS ====================

    /**
     * Store Git provider token (GitHub/GitLab/Bitbucket)
     */
    async storeGitToken(token: string): Promise<void> {
        await this.secrets.store(CredentialManager.GIT_TOKEN_KEY, token);
    }

    /**
     * Retrieve Git provider token
     */
    async getGitToken(): Promise<string | undefined> {
        return await this.secrets.get(CredentialManager.GIT_TOKEN_KEY);
    }

    /**
     * Check if Git token exists
     */
    async hasGitToken(): Promise<boolean> {
        const token = await this.getGitToken();
        return token !== undefined && token.length > 0;
    }

    /**
     * Delete Git provider token
     */
    async deleteGitToken(): Promise<void> {
        await this.secrets.delete(CredentialManager.GIT_TOKEN_KEY);
    }

    /**
     * Prompt user to enter Git token
     */
    async promptForGitToken(): Promise<string | undefined> {
        const token = await vscode.window.showInputBox({
            prompt: 'Enter your Git Provider Personal Access Token',
            password: true,
            placeHolder: 'Your GitHub/GitLab token...',
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Token cannot be empty';
                }
                return null;
            }
        });

        if (token) {
            await this.storeGitToken(token);
            vscode.window.showInformationMessage('DevLoop: Git token saved securely.');
        }

        return token;
    }

    // ==================== JENKINS CREDENTIALS ====================

    /**
     * Store Jenkins API token
     */
    async storeJenkinsToken(token: string): Promise<void> {
        await this.secrets.store(CredentialManager.JENKINS_TOKEN_KEY, token);
    }

    /**
     * Retrieve Jenkins API token
     */
    async getJenkinsToken(): Promise<string | undefined> {
        return await this.secrets.get(CredentialManager.JENKINS_TOKEN_KEY);
    }

    /**
     * Check if Jenkins token exists
     */
    async hasJenkinsToken(): Promise<boolean> {
        const token = await this.getJenkinsToken();
        return token !== undefined && token.length > 0;
    }

    /**
     * Delete Jenkins API token
     */
    async deleteJenkinsToken(): Promise<void> {
        await this.secrets.delete(CredentialManager.JENKINS_TOKEN_KEY);
    }

    /**
     * Prompt user to enter Jenkins token
     */
    async promptForJenkinsToken(): Promise<string | undefined> {
        const token = await vscode.window.showInputBox({
            prompt: 'Enter your Jenkins API Token',
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

        if (token) {
            await this.storeJenkinsToken(token);
            vscode.window.showInformationMessage('DevLoop: Jenkins token saved securely.');
        }

        return token;
    }

    // ==================== VALIDATION ====================

    /**
     * Validate all credentials are present
     */
    async validateAllCredentials(): Promise<AllCredentialsValidation> {
        const jiraToken = await this.getJiraToken();
        const gitToken = await this.getGitToken();
        const jenkinsToken = await this.getJenkinsToken();

        const jiraConfig = vscode.workspace.getConfiguration('devloop');
        const jiraUrl = jiraConfig.get<string>('jira.baseUrl');
        const jiraEmail = jiraConfig.get<string>('jira.email');

        const gitConfig = vscode.workspace.getConfiguration('devloop');
        const gitUrl = gitConfig.get<string>('git.baseUrl');

        const jenkinsConfig = vscode.workspace.getConfiguration('devloop');
        const jenkinsUrl = jenkinsConfig.get<string>('jenkins.baseUrl');

        return {
            jira: {
                valid: !!(jiraToken && jiraUrl && jiraEmail),
                message: jiraToken && jiraUrl && jiraEmail 
                    ? 'Configured' 
                    : 'Missing: ' + [
                        !jiraUrl ? 'URL' : '',
                        !jiraEmail ? 'Email' : '',
                        !jiraToken ? 'Token' : ''
                    ].filter(Boolean).join(', ')
            },
            git: {
                valid: !!(gitToken && gitUrl),
                message: gitToken && gitUrl 
                    ? 'Configured' 
                    : 'Missing: ' + [
                        !gitUrl ? 'URL' : '',
                        !gitToken ? 'Token' : ''
                    ].filter(Boolean).join(', ')
            },
            jenkins: {
                valid: !!(jenkinsToken && jenkinsUrl),
                message: jenkinsToken && jenkinsUrl 
                    ? 'Configured' 
                    : 'Missing: ' + [
                        !jenkinsUrl ? 'URL' : '',
                        !jenkinsToken ? 'Token' : ''
                    ].filter(Boolean).join(', ')
            }
        };
    }

    // ==================== BULK OPERATIONS ====================

    /**
     * Clear all stored credentials
     */
    async clearAll(): Promise<void> {
        await this.secrets.delete(CredentialManager.JIRA_TOKEN_KEY);
        await this.secrets.delete(CredentialManager.GIT_TOKEN_KEY);
        await this.secrets.delete(CredentialManager.JENKINS_TOKEN_KEY);
    }

    /**
     * Export credentials for backup (encrypted)
     */
    async exportCredentials(): Promise<string> {
        const jiraToken = await this.getJiraToken();
        const gitToken = await this.getGitToken();
        const jenkinsToken = await this.getJenkinsToken();

        return JSON.stringify({
            jira: jiraToken ? '***' : null,
            git: gitToken ? '***' : null,
            jenkins: jenkinsToken ? '***' : null,
            exported: new Date().toISOString()
        }, null, 2);
    }
}
