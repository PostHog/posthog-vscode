import * as vscode from 'vscode';

export interface PostHogProjectConfig {
    host?: string;
    projectId?: number;
    additionalClientNames?: string[];
    additionalFlagFunctions?: string[];
}

export class ConfigService {
    private config: PostHogProjectConfig | null = null;
    private configByFolder = new Map<string, PostHogProjectConfig>();

    async loadWorkspaceConfig(): Promise<PostHogProjectConfig | null> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) { return null; }

        for (const folder of workspaceFolders) {
            const configUri = vscode.Uri.joinPath(folder.uri, '.posthog.json');
            try {
                const content = await vscode.workspace.fs.readFile(configUri);
                const parsed: PostHogProjectConfig = JSON.parse(Buffer.from(content).toString('utf-8'));
                this.configByFolder.set(folder.uri.toString(), parsed);
                // Use the first found config as the primary
                if (!this.config) {
                    this.config = parsed;
                }
            } catch {
                // No config file in this folder
            }
        }
        return this.config;
    }

    getConfig(): PostHogProjectConfig | null {
        return this.config;
    }

    getConfigForFolder(folderUri: string): PostHogProjectConfig | undefined {
        return this.configByFolder.get(folderUri);
    }

    getAllFolderConfigs(): Map<string, PostHogProjectConfig> {
        return this.configByFolder;
    }
}
