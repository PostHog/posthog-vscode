import * as vscode from 'vscode';
import { AuthService } from '../services/authService';
import { PostHogService } from '../services/postHogService';
import { Commands, ContextKeys, Defaults, OAuthConfig } from '../constants';

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
        await authService.setAuthMethod('api_key');

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

    const signInOAuth = vscode.commands.registerCommand(Commands.SIGN_IN_OAUTH, async () => {
        // Gate on CLIENT_ID being configured
        if (!OAuthConfig.CLIENT_ID) {
            vscode.window.showErrorMessage(
                'PostHog: OAuth is not yet available. Please sign in with an API key.',
                'Sign In with API Key'
            ).then(choice => {
                if (choice === 'Sign In with API Key') {
                    vscode.commands.executeCommand(Commands.SIGN_IN);
                }
            });
            return;
        }

        // Host selection (same as API key flow)
        const hostChoice = await vscode.window.showQuickPick(
            Defaults.HOSTS.map(h => ({ label: h.label, detail: h.url || 'Enter custom URL' })),
            { placeHolder: 'Select your PostHog instance' }
        );
        if (!hostChoice) { return; }

        let host: string;
        const match = Defaults.HOSTS.find(h => h.label === hostChoice.label);
        if (match && match.url) {
            host = match.url;
        } else {
            const customHost = await vscode.window.showInputBox({
                prompt: 'Enter your PostHog instance URL',
                placeHolder: 'https://posthog.example.com',
                validateInput: (value) => {
                    try { new URL(value); return null; }
                    catch { return 'Please enter a valid URL'; }
                },
            });
            if (!customHost) { return; }
            host = customHost.replace(/\/+$/, '');
        }

        await authService.setHost(host);

        // Generate PKCE and state
        const { verifier, challenge } = authService.generatePkce();
        const state = authService.generateState();

        // Build callback URI using vscode.env for environment compatibility
        const callbackUri = await vscode.env.asExternalUri(
            vscode.Uri.parse(`${vscode.env.uriScheme}://PostHog.posthog-vscode${OAuthConfig.CALLBACK_PATH}`)
        );

        // Build authorization URL
        const params = new URLSearchParams({
            client_id: OAuthConfig.CLIENT_ID,
            redirect_uri: callbackUri.toString(),
            response_type: 'code',
            code_challenge: challenge,
            code_challenge_method: 'S256',
            scope: OAuthConfig.SCOPES,
            state,
        });
        const authorizeUrl = `${host}${OAuthConfig.AUTHORIZE_PATH}?${params.toString()}`;

        // Open browser and wait for callback with progress notification
        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'PostHog: Waiting for sign-in...',
                    cancellable: true,
                },
                async (_progress, token) => {
                    // Start waiting for callback BEFORE opening browser
                    const codePromise = authService.waitForOAuthCode(state, verifier);

                    // Cancel handling
                    token.onCancellationRequested(() => {
                        // Force reject the pending promise
                        authService.handleOAuthCallback('', 'cancelled');
                    });

                    // Open browser
                    await vscode.env.openExternal(vscode.Uri.parse(authorizeUrl));

                    // Wait for auth code from callback
                    const code = await codePromise;

                    // Exchange code for tokens
                    await authService.exchangeCodeForTokens(code, callbackUri.toString());

                    // Project selection (same as API key flow)
                    const projects = await postHogService.getProjects();
                    if (projects.length === 0) {
                        vscode.window.showErrorMessage('PostHog: No projects found for this account.');
                        await authService.clearOAuthTokens();
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
                            await authService.clearOAuthTokens();
                            return;
                        }
                        selectedProject = pick.project;
                    }

                    await authService.setProjectId(selectedProject.id);
                    await authService.setAuthenticated(true);
                    await vscode.commands.executeCommand('setContext', ContextKeys.IS_AUTHENTICATED, true);
                    sidebar.refresh();
                    vscode.window.showInformationMessage(`PostHog: Signed in to ${selectedProject.name}`);
                }
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('cancelled') || message.includes('Superseded')) {
                // User cancelled or started a new attempt — no error needed
                return;
            }
            if (message.includes('State mismatch')) {
                // CSRF protection — reject silently per AUTH-04
                return;
            }
            vscode.window.showErrorMessage(`PostHog: OAuth sign-in failed. ${message}`);
        }
    });

    const signOut = vscode.commands.registerCommand(Commands.SIGN_OUT, async () => {
        // Clear ALL auth storage regardless of current method (AUTH-06)
        await authService.deleteApiKey();
        await authService.clearOAuthTokens();
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

    return [signIn, signInOAuth, signOut, selectProject];
}
