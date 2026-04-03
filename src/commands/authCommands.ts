import * as vscode from 'vscode';
import { AuthService } from '../services/authService';
import { PostHogService } from '../services/postHogService';
import { PostHogAuthenticationProvider, AUTH_PROVIDER_ID, SCOPES } from '../services/postHogAuthProvider';
import { TelemetryService } from '../services/telemetryService';
import { Commands, ContextKeys } from '../constants';
import { Project } from '../models/types';

interface Refreshable { refresh(): void; }

export function registerAuthCommands(
    authService: AuthService,
    postHogService: PostHogService,
    authProvider: PostHogAuthenticationProvider,
    sidebar: Refreshable,
    telemetry: TelemetryService,
): vscode.Disposable[] {

    async function fetchProjects(): Promise<Project[]> {
        const scopedTeams = await authProvider.getScopedTeams();
        if (scopedTeams.length > 0) {
            return Promise.all(scopedTeams.map(id => postHogService.getProject(id)));
        }
        return postHogService.getProjects();
    }

    async function pickProject(): Promise<Project | undefined> {
        const projects = await fetchProjects();
        if (projects.length === 0) { return undefined; }
        if (projects.length === 1) { return projects[0]; }
        const pick = await vscode.window.showQuickPick(
            projects.map(p => ({ label: p.name, detail: `ID: ${p.id}`, project: p })),
            { placeHolder: 'Select a project' }
        );
        return pick?.project;
    }

    async function applyProject(project: Project): Promise<void> {
        await authService.setProjectId(project.id);
        await authService.setProjectName(project.name);
        await authService.setAuthenticated(true);
        await vscode.commands.executeCommand('setContext', ContextKeys.IS_AUTHENTICATED, true);
        sidebar.refresh();
        postHogService.checkPermissions(project.id).then(perms => {
            authService.setCanWrite(perms.canWrite);
        }).catch(() => {});
    }

    const signIn = vscode.commands.registerCommand(Commands.SIGN_IN, async () => {
        telemetry.capture('sign_in_started');

        try {
            const session = await vscode.authentication.getSession(AUTH_PROVIDER_ID, SCOPES, { createIfNone: true });
            if (!session) { return; }

            const host = await authProvider.getSessionHost();
            if (host) {
                await authService.setHost(host);
            }

            const project = await pickProject();
            if (!project) {
                await authProvider.removeSession();
                return;
            }

            await applyProject(project);
            telemetry.capture('sign_in_completed');
            telemetry.identify();
            vscode.window.showInformationMessage(`PostHog: Signed in to ${project.name}`);
        } catch (err) {
            telemetry.capture('sign_in_failed');
            const detail = err instanceof Error ? err.message : 'Unknown error';
            if (detail !== 'User did not consent to login.' && detail !== 'Authentication timed out') {
                vscode.window.showErrorMessage(`PostHog: Failed to sign in — ${detail}`);
            }
            await authService.setAuthenticated(false);
            await vscode.commands.executeCommand('setContext', ContextKeys.IS_AUTHENTICATED, false);
        }
    });

    const signOut = vscode.commands.registerCommand(Commands.SIGN_OUT, async () => {
        telemetry.capture('sign_out');
        await authProvider.removeSession();
        await authService.clearProjectId();
        await authService.clearProjectName();
        await authService.setAuthenticated(false);
        await vscode.commands.executeCommand('setContext', ContextKeys.IS_AUTHENTICATED, false);
        telemetry.reset();
        sidebar.refresh();
        vscode.window.showInformationMessage('PostHog: Signed out.');
    });

    const selectProject = vscode.commands.registerCommand(Commands.SELECT_PROJECT, async () => {
        try {
            const project = await pickProject();
            if (!project) { return; }
            await applyProject(project);
            telemetry.capture('project_selected', { project_id: project.id });
            telemetry.identify();
            vscode.window.showInformationMessage(`PostHog: Switched to ${project.name}`);
        } catch {
            vscode.window.showErrorMessage('PostHog: Failed to fetch projects.');
        }
    });

    return [signIn, signOut, selectProject];
}
