import * as vscode from 'vscode';
import { AuthService } from '../services/authService';
import { PostHogService } from '../services/postHogService';
import { FlagCacheService } from '../services/flagCacheService';
import { Commands } from '../constants';

interface Refreshable {
    refresh(): void;
    navigateToFlag(flagKey: string): void;
}

export function registerFeatureFlagCommands(
    authService: AuthService,
    postHogService: PostHogService,
    sidebar: Refreshable,
    flagCache?: FlagCacheService,
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
            vscode.window.showErrorMessage('PostHog: Please sign in first.');
            return;
        }

        const key = flagKey ?? await vscode.window.showInputBox({
            prompt: 'Enter the feature flag key',
            placeHolder: 'my-new-flag',
        });
        if (!key) {
            return;
        }

        const name = await vscode.window.showInputBox({
            prompt: 'Display name for this flag',
            value: key.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            placeHolder: 'My New Flag',
        });
        if (name === undefined) { return; }

        const activeChoice = await vscode.window.showQuickPick(
            [
                { label: '$(circle-slash) Inactive', description: 'Create as inactive (default)', value: false },
                { label: '$(pass) Active', description: 'Enable immediately for all users', value: true },
            ],
            { placeHolder: 'Should the flag be active right away?' },
        );
        if (!activeChoice) { return; }

        try {
            const flag = await postHogService.createFeatureFlag(projectId, key, name || key, activeChoice.value);
            // Refresh the flag cache so decorations & code actions update immediately
            if (flagCache) {
                const flags = await postHogService.getFeatureFlags(projectId);
                flagCache.update(flags);
            }
            sidebar.navigateToFlag(flag.key);
            vscode.window.showInformationMessage(`PostHog: Created feature flag "${flag.key}"`);
        } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`PostHog: Failed to create flag "${key}": ${detail}`);
        }
    });

    return [refresh, copyKey, openInBrowser, createFlag];
}
