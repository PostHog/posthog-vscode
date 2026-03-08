import * as vscode from 'vscode';
import { AuthService } from '../services/authService';
import { PostHogService } from '../services/postHogService';
import { Commands } from '../constants';

interface Refreshable { refresh(): void; }

export function registerFeatureFlagCommands(
    authService: AuthService,
    postHogService: PostHogService,
    sidebar: Refreshable
): vscode.Disposable[] {
    const refresh = vscode.commands.registerCommand(Commands.REFRESH_FEATURE_FLAGS, () => {
        sidebar.refresh();
    });

    const copyKey = vscode.commands.registerCommand(Commands.COPY_FLAG_KEY, (flagKey?: string) => {
        if (flagKey) {
            vscode.env.clipboard.writeText(flagKey);
            vscode.window.showInformationMessage(`Copied: ${flagKey}`);
        }
    });

    const openInBrowser = vscode.commands.registerCommand(Commands.OPEN_FLAG_IN_BROWSER, (flagId?: number) => {
        if (flagId) {
            const host = authService.getHost().replace(/\/+$/, '');
            const projectId = authService.getProjectId();
            if (projectId) {
                const url = `${host}/project/${projectId}/feature_flags/${flagId}`;
                vscode.env.openExternal(vscode.Uri.parse(url));
            }
        }
    });

    const createFlag = vscode.commands.registerCommand(Commands.CREATE_FLAG, async (flagKey?: string) => {
        const projectId = authService.getProjectId();
        if (!projectId) {
            vscode.window.showErrorMessage('CodeHog: Please sign in first.');
            return;
        }

        const key = flagKey ?? await vscode.window.showInputBox({
            prompt: 'Enter the feature flag key',
            placeHolder: 'my-new-flag',
        });
        if (!key) {
            return;
        }

        try {
            const flag = await postHogService.createFeatureFlag(projectId, key);
            sidebar.refresh();
            vscode.window.showInformationMessage(`CodeHog: Created feature flag "${flag.key}"`);
        } catch {
            vscode.window.showErrorMessage(`CodeHog: Failed to create feature flag "${key}".`);
        }
    });

    return [refresh, copyKey, openInBrowser, createFlag];
}
