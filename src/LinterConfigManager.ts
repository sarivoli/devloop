
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface LinterConfig {
    fileTypes: Record<string, string[]>;
    javascript?: any;
    html?: any;
    python?: any;
    fixableRules?: Record<string, string[]>;
}

export class LinterConfigManager {
    private config: LinterConfig;
    private projectRoot: string;

    constructor(projectRoot: string) {
        this.projectRoot = projectRoot;
        this.config = this.loadConfig();
    }

    private loadConfig(): LinterConfig {
        // Try to load from workspace resources first, or fallback to default
        // In the context of the extension, we might want to look at a specific location
        // For now, assuming the resources/linter.config.json is meant to be the source of truth
        // or a project-specific one.
        // Let's look for .devloop/linter.config.json in the project root, 
        // fallback to the one bundled with the extension if not found.
        
        const localConfigPath = path.join(this.projectRoot, 'linter.config.json');
        
        if (fs.existsSync(localConfigPath)) {
            try {
                const configContent = fs.readFileSync(localConfigPath, 'utf-8');
                return JSON.parse(configContent);
            } catch (error) {
                console.error('Error loading linter.config.json:', error);
            }
        }
        
        return this.getDefaultConfig();
    }

    private getDefaultConfig(): LinterConfig {
        return {
            fileTypes: {
                javascript: ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'],
                html: ['.html', '.htm'],
                python: ['.py']
            },
            javascript: {
                rules: {
                    "semi": ["error", "always"],
                    "quotes": ["error", "single"]
                }
            },
            html: {
                rules: {
                    "tagname-lowercase": true,
                    "attr-lowercase": true
                }
            },
            python: {
                // Default pylint/autopep8 args could be here
            },
            fixableRules: {
                javascript: ["semi", "quotes", "indent"],
                html: ["tagname-lowercase", "attr-lowercase"],
                python: [] 
            }
        };
    }

    public updateProjectRoot(newRoot: string) {
        this.projectRoot = newRoot;
        this.config = this.loadConfig();
    }

    public getFileType(filePath: string): string | null {
        const ext = path.extname(filePath).toLowerCase();
        for (const [type, extensions] of Object.entries(this.config.fileTypes)) {
            if (extensions.includes(ext)) {
                return type;
            }
        }
        return null; // unsupported
    }

    public isFixable(ruleId: string, fileType: string): boolean {
        const fixableRules = this.config.fixableRules?.[fileType] || [];
        return fixableRules.includes(ruleId);
    }

    public async generateTempConfig(type: string): Promise<string | undefined> {
        // Create a temporary config file for the tool to use, based on our centralized config
        if (type === 'javascript') {
            const configPath = path.join(this.projectRoot, '.temp.eslintrc.json');
            fs.writeFileSync(configPath, JSON.stringify(this.config.javascript || {}, null, 2));
            return configPath;
        } else if (type === 'html') {
            const configPath = path.join(this.projectRoot, '.temp.htmlhintrc');
            fs.writeFileSync(configPath, JSON.stringify(this.config.html?.rules || {}, null, 2));
            return configPath;
        }
        return undefined;
    }
    
    public cleanupTempConfigs() {
        const jsConfig = path.join(this.projectRoot, '.temp.eslintrc.json');
        const htmlConfig = path.join(this.projectRoot, '.temp.htmlhintrc');
        if (fs.existsSync(jsConfig)) fs.unlinkSync(jsConfig);
        if (fs.existsSync(htmlConfig)) fs.unlinkSync(htmlConfig);
    }
}
