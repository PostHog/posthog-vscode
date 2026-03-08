import * as vscode from 'vscode';
import { AuthService } from '../services/authService';
import { PostHogService } from '../services/postHogService';
import { FlagCacheService } from '../services/flagCacheService';
import { StackFrame } from '../models/types';
import { Commands } from '../constants';
import { getWebviewHtml } from './getWebviewHtml';

export class SidebarProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly authService: AuthService,
        private readonly postHogService: PostHogService,
        private readonly flagCache: FlagCacheService,
    ) {}

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'resources')],
        };

        webviewView.onDidDispose(() => { this.view = undefined; });

        const logoUri = webviewView.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'resources', 'icons', 'posthog-logo-white.svg')
        );

        const initialAuth = this.authService.isAuthenticated();
        webviewView.webview.html = getWebviewHtml(webviewView.webview, logoUri, initialAuth);
        webviewView.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
    }

    async refresh() {
        await this.sendAuthState();
    }

    // ── Message routing ──

    private async handleMessage(msg: { type: string; [key: string]: unknown }) {
        switch (msg.type) {
            case 'ready':
                return this.sendAuthState();
            case 'signIn':
                await vscode.commands.executeCommand(Commands.SIGN_IN);
                return this.sendAuthState();
            case 'signOut':
                await vscode.commands.executeCommand(Commands.SIGN_OUT);
                return this.sendAuthState();
            case 'selectProject':
                return vscode.commands.executeCommand(Commands.SELECT_PROJECT);
            case 'loadFlags':
                return this.loadFlags();
            case 'loadErrors':
                return this.loadErrors();
            case 'loadExperiments':
                return this.loadExperiments();
            case 'copyFlagKey':
                await vscode.env.clipboard.writeText(msg.key as string);
                vscode.window.showInformationMessage(`Copied: ${msg.key}`);
                return;
            case 'createFlag':
                await vscode.commands.executeCommand(Commands.CREATE_FLAG, msg.key);
                return this.loadFlags();
            case 'jumpToError':
                return this.jumpToError(msg.issueId as string);
            case 'findReferences':
                return vscode.commands.executeCommand('workbench.action.findInFiles', {
                    query: msg.key,
                    isRegex: false,
                    isCaseSensitive: true,
                    matchWholeWord: false,
                    filesToInclude: '',
                    filesToExclude: '**/node_modules/**',
                });
            case 'openExternal': {
                const host = this.authService.getHost().replace(/\/+$/, '');
                return vscode.env.openExternal(vscode.Uri.parse(`${host}${msg.path}`));
            }
        }
    }

    // ── Auth ──

    private async sendAuthState() {
        let authed = this.authService.isAuthenticated();
        if (!authed) {
            const hasKey = await this.authService.getApiKey();
            if (hasKey) {
                await this.authService.setAuthenticated(true);
                authed = true;
            }
        }
        this.postMessage({ type: 'authState', authenticated: authed });
        if (authed) {
            await this.loadFlags();
        }
    }

    // ── Data loaders ──

    private async loadFlags() {
        const projectId = this.authService.getProjectId();
        if (!projectId) { return; }

        this.postMessage({ type: 'loading', section: 'flags' });
        try {
            const flags = await this.postHogService.getFeatureFlags(projectId);
            this.flagCache.update(flags);
            const active = flags.filter(f => !f.deleted);
            active.sort((a, b) => {
                if (a.active !== b.active) { return a.active ? -1 : 1; }
                return a.key.localeCompare(b.key);
            });
            this.postMessage({ type: 'flags', data: active, projectId });
        } catch {
            this.postMessage({ type: 'error', section: 'flags', message: 'Failed to load feature flags' });
        }
    }

    private async loadErrors() {
        const projectId = this.authService.getProjectId();
        if (!projectId) { return; }

        this.postMessage({ type: 'loading', section: 'errors' });
        try {
            const issues = await this.postHogService.getErrorTrackingIssues(projectId);
            this.postMessage({ type: 'errors', data: issues, projectId });
        } catch {
            this.postMessage({ type: 'error', section: 'errors', message: 'Failed to load errors' });
        }
    }

    private async loadExperiments() {
        const projectId = this.authService.getProjectId();
        if (!projectId) { return; }

        this.postMessage({ type: 'loading', section: 'experiments' });
        try {
            const experiments = await this.postHogService.getExperiments(projectId);
            this.postMessage({ type: 'experiments', data: experiments, projectId });
        } catch {
            this.postMessage({ type: 'error', section: 'experiments', message: 'Failed to load experiments' });
        }
    }

    // ── Error navigation ──

    private async jumpToError(issueId: string) {
        const projectId = this.authService.getProjectId();
        if (!projectId) { return; }

        try {
            const exceptions = await this.postHogService.getErrorStackTrace(projectId, issueId);
            if (exceptions.length === 0) {
                vscode.window.showInformationMessage('No stack trace available for this error.');
                return;
            }

            for (const entry of exceptions) {
                const frames = entry.stack_trace?.frames;
                if (!frames) { continue; }

                // Frames are typically bottom-up; reverse to get top (most relevant) first
                const ordered = [...frames].reverse();

                for (const frame of ordered) {
                    const localFile = await this.resolveFrame(frame);
                    if (localFile) {
                        const line = Math.max(0, (frame.lineno || 1) - 1);
                        const col = Math.max(0, (frame.colno || 1) - 1);
                        const position = new vscode.Position(line, col);
                        const doc = await vscode.workspace.openTextDocument(localFile);
                        await vscode.window.showTextDocument(doc, {
                            selection: new vscode.Range(position, position),
                            preview: true,
                        });
                        return;
                    }
                }
            }

            vscode.window.showInformationMessage('Could not match stack trace to a local file.');
        } catch {
            vscode.window.showErrorMessage('Failed to fetch error details.');
        }
    }

    private async resolveFrame(frame: StackFrame): Promise<vscode.Uri | null> {
        if (!frame.filename) { return null; }

        let filePath = frame.filename;

        // Strip URL origin (e.g. http://localhost:5173/src/foo.tsx -> src/foo.tsx)
        try {
            const url = new URL(filePath);
            filePath = url.pathname.replace(/^\//, '');
        } catch {
            // Not a URL, use as-is
        }

        if (filePath.includes('node_modules') || filePath.startsWith('chrome-extension')) {
            return null;
        }

        const matches = await vscode.workspace.findFiles(`**/${filePath}`, '**/node_modules/**', 1);
        if (matches.length > 0) {
            return matches[0];
        }

        const basename = filePath.split('/').pop();
        if (basename) {
            const fallback = await vscode.workspace.findFiles(`**/${basename}`, '**/node_modules/**', 3);
            if (fallback.length === 1) {
                return fallback[0];
            }
        }

        return null;
    }

    // ── Webview messaging ──

    private postMessage(msg: unknown) {
        this.view?.webview.postMessage(msg);
    }
}
