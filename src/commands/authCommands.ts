import * as vscode from 'vscode';
import { AuthService } from '../services/authService';
import { PostHogService } from '../services/postHogService';
import { Commands, ContextKeys, Defaults } from '../constants';

interface Refreshable { refresh(): void; }

export function registerAuthCommands(
    authService: AuthService,
    postHogService: PostHogService,
    sidebar: Refreshable
): vscode.Disposable[] {
    const signIn = vscode.commands.registerCommand(Commands.SIGN_IN, async () => {
        const hostChoice = await vscode.window.showQuickPick(
            Defaults.HOSTS.map(h => ({ label: h.label, detail: h.url || 'Enter custom URL' })),
            { placeHolder: 'Select your PostHog instance' }
        );
        if (!hostChoice) {
            return;
        }

        let host: string;
        const match = Defaults.HOSTS.find(h => h.label === hostChoice.label);
        if (match && match.url) {
            host = match.url;
        } else {
            const customHost = await vscode.window.showInputBox({
                prompt: 'Enter your PostHog instance URL',
                placeHolder: 'https://posthog.example.com',
                validateInput: (value) => {
                    try {
                        new URL(value);
                        return null;
                    } catch {
                        return 'Please enter a valid URL';
                    }
                },
            });
            if (!customHost) {
                return;
            }
            host = customHost.replace(/\/+$/, '');
        }

        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your PostHog Personal API Key',
            placeHolder: 'phx_...',
            password: true,
            validateInput: (value) => {
                if (!value.startsWith('phx_')) {
                    return 'Personal API key should start with phx_';
                }
                return null;
            },
        });
        if (!apiKey) {
            return;
        }

        await authService.setHost(host);
        await authService.setApiKey(apiKey);

        try {
            const projects = await postHogService.getProjects();
            if (projects.length === 0) {
                vscode.window.showErrorMessage('PostHog: No projects found for this API key.');
                await authService.deleteApiKey();
                return;
            }

            let selectedProject;
            if (projects.length === 1) {
                selectedProject = projects[0];
            } else {
                const pick = await vscode.window.showQuickPick(
                    projects.map(p => ({ label: p.name, detail: `ID: ${p.id}`, project: p })),
                    { placeHolder: 'Select a project' }
                );
                if (!pick) {
                    await authService.deleteApiKey();
                    return;
                }
                selectedProject = pick.project;
            }

            await authService.setProjectId(selectedProject.id);
            await authService.setAuthenticated(true);
            await vscode.commands.executeCommand('setContext', ContextKeys.IS_AUTHENTICATED, true);
            sidebar.refresh();
            vscode.window.showInformationMessage(`PostHog: Signed in to ${selectedProject.name}`);
        } catch {
            vscode.window.showErrorMessage('PostHog: Failed to connect. Check your API key and host.');
            await authService.deleteApiKey();
        }
    });

    const signOut = vscode.commands.registerCommand(Commands.SIGN_OUT, async () => {
        await authService.deleteApiKey();
        await authService.clearProjectId();
        await authService.setAuthenticated(false);
        await vscode.commands.executeCommand('setContext', ContextKeys.IS_AUTHENTICATED, false);
        sidebar.refresh();
        vscode.window.showInformationMessage('PostHog: Signed out.');
    });

    const selectProject = vscode.commands.registerCommand(Commands.SELECT_PROJECT, async () => {
        try {
            const projects = await postHogService.getProjects();
            const pick = await vscode.window.showQuickPick(
                projects.map(p => ({ label: p.name, detail: `ID: ${p.id}`, project: p })),
                { placeHolder: 'Select a project' }
            );
            if (!pick) {
                return;
            }
            await authService.setProjectId(pick.project.id);
            sidebar.refresh();
            vscode.window.showInformationMessage(`PostHog: Switched to ${pick.label}`);
        } catch {
            vscode.window.showErrorMessage('PostHog: Failed to fetch projects.');
        }
    });

    return [signIn, signOut, selectProject];
}
