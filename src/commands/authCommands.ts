import * as vscode from 'vscode';
import { AuthService } from '../services/authService';
import { PostHogService } from '../services/postHogService';
import { TelemetryService } from '../services/telemetryService';
import { Commands, ContextKeys, Defaults } from '../constants';

interface Refreshable { refresh(): void; }

export function registerAuthCommands(
    authService: AuthService,
    postHogService: PostHogService,
    sidebar: Refreshable,
    telemetry: TelemetryService,
): vscode.Disposable[] {
    const signIn = vscode.commands.registerCommand(Commands.SIGN_IN, async () => {
        telemetry.capture('sign_in_started');
        const hostChoice = await vscode.window.showQuickPick(
            Defaults.HOSTS.map(h => ({ label: h.label, detail: h.url || 'Enter custom URL' })),
            { placeHolder: 'Select your PostHog instance' }
        );
        if (!hostChoice) {
            return;
        }
        const host_type = hostChoice.label.toLowerCase().replace(' ', '_');
        telemetry.capture('sign_in_host_selected', { host_type });

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
            prompt: `Enter your PostHog Personal API Key (create one at ${host}/settings/user-api-keys)`,
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
            await authService.setProjectName(selectedProject.name);
            await authService.setAuthenticated(true);
            await vscode.commands.executeCommand('setContext', ContextKeys.IS_AUTHENTICATED, true);
            await vscode.commands.executeCommand('setContext', 'posthog.hasApiKey', true);
            sidebar.refresh();
            telemetry.capture('sign_in_completed', { host_type, project_count: projects.length });
            telemetry.identify();
            vscode.window.showInformationMessage(`PostHog: Signed in to ${selectedProject.name}`);
            // Check API key permissions (non-blocking)
            postHogService.checkPermissions(selectedProject.id).then(perms => {
                authService.setCanWrite(perms.canWrite);
            }).catch(() => {});
        } catch (err) {
            telemetry.capture('sign_in_failed', { host_type });
            const detail = err instanceof Error ? err.message : 'Unknown error';
            vscode.window.showErrorMessage(`PostHog: Failed to connect — ${detail}`);
            await authService.deleteApiKey();
            await authService.setAuthenticated(false);
            await vscode.commands.executeCommand('setContext', ContextKeys.IS_AUTHENTICATED, false);
            await vscode.commands.executeCommand('setContext', 'posthog.hasApiKey', false);
        }
    });

    // Stub — OAuth not yet implemented. UI button is wired; someone else will fill in the flow.
    const signInOAuth = vscode.commands.registerCommand(Commands.SIGN_IN_OAUTH, async () => {
        telemetry.capture('sign_in_oauth_attempted');
        const choice = await vscode.window.showErrorMessage(
            'PostHog: OAuth is not yet available. Please sign in with an API key.',
            'Sign In with API Key'
        );
        if (choice === 'Sign In with API Key') {
            vscode.commands.executeCommand(Commands.SIGN_IN);
        }
    });

    const signOut = vscode.commands.registerCommand(Commands.SIGN_OUT, async () => {
        telemetry.capture('sign_out');
        await authService.deleteApiKey();
        await authService.clearProjectId();
        await authService.clearProjectName();
        await authService.setAuthenticated(false);
        await vscode.commands.executeCommand('setContext', ContextKeys.IS_AUTHENTICATED, false);
        await vscode.commands.executeCommand('setContext', 'posthog.hasApiKey', false);
        telemetry.reset();
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
            await authService.setProjectName(pick.project.name);
            // Check permissions for the new project
            const perms = await postHogService.checkPermissions(pick.project.id);
            await authService.setCanWrite(perms.canWrite);
            sidebar.refresh();
            telemetry.capture('project_selected', { project_id: pick.project.id });
            telemetry.identify();
            vscode.window.showInformationMessage(`PostHog: Switched to ${pick.label}`);
        } catch {
            vscode.window.showErrorMessage('PostHog: Failed to fetch projects.');
        }
    });

    return [signIn, signInOAuth, signOut, selectProject];
}
