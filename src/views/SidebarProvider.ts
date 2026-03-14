import * as vscode from 'vscode';
import { AuthService } from '../services/authService';
import { PostHogService } from '../services/postHogService';
import { FlagCacheService } from '../services/flagCacheService';
import { ExperimentCacheService } from '../services/experimentCacheService';
import { StackFrame } from '../models/types';
import { ErrorCacheService } from '../services/errorCacheService';
import { Commands } from '../constants';
import { getWebviewHtml } from './getWebviewHtml';
import { DetailPanelProvider } from './DetailPanelProvider';

export class SidebarProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly authService: AuthService,
        private readonly postHogService: PostHogService,
        private readonly flagCache: FlagCacheService,
        private readonly experimentCache?: ExperimentCacheService,
        private readonly detailPanel?: DetailPanelProvider,
        private readonly errorCache?: ErrorCacheService,
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

        webviewView.webview.html = getWebviewHtml(webviewView.webview, logoUri);
        webviewView.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
    }

    async refresh() {
        await this.sendAuthState();
    }

    async navigateToFlag(flagKey: string) {
        if (this.detailPanel) {
            const flag = this.flagCache.getFlag(flagKey);
            if (flag) {
                this.detailPanel.showFlag(flag);
                return;
            }
            // Flag not in cache – fetch and try again
            const projectId = this.authService.getProjectId();
            if (projectId) {
                const flags = await this.postHogService.getFeatureFlags(projectId);
                this.flagCache.update(flags);
                const found = this.flagCache.getFlag(flagKey);
                if (found) { this.detailPanel.showFlag(found); return; }
            }
        }
        // Fallback to sidebar navigation
        await this.loadFlags();
        this.postMessage({ type: 'navigateToFlag', key: flagKey });
    }

    async navigateToExperiment(flagKey: string) {
        if (this.detailPanel && this.experimentCache) {
            let exp = this.experimentCache.getByFlagKey(flagKey);
            if (!exp) {
                const projectId = this.authService.getProjectId();
                if (projectId) {
                    const exps = await this.postHogService.getExperiments(projectId);
                    this.experimentCache.update(exps);
                    exp = this.experimentCache.getByFlagKey(flagKey);
                }
            }
            if (exp) {
                const results = this.experimentCache.getResults(exp.id);
                this.detailPanel.showExperiment(exp, results);
                return;
            }
        }
        // Fallback to sidebar navigation
        await this.loadExperiments();
        this.postMessage({ type: 'navigateToExperiment', flagKey });
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
            case 'loadInsights':
                return this.loadInsights();
            case 'refreshInsight':
                return this.refreshInsight(msg.insightId as number);
            case 'updateFlag':
                return this.updateFlag(msg.flagId as number, msg.active as boolean, msg.filters as Record<string, unknown>);
            case 'openFlagPanel':
                return this.openFlagPanel(msg.key as string);
            case 'openErrorPanel':
                return this.openErrorPanel(msg.id as string);
            case 'openExperimentPanel':
                return this.openExperimentPanel(msg.id as number);
            case 'openInsightPanel':
                return this.openInsightPanel(msg.id as number);
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
            await this.loadInsights();
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

            // Resolve which issues have files in the current workspace
            const localIssueIds: string[] = [];
            if (this.errorCache) {
                const occurrences = this.errorCache.getAll();
                const issueIdSet = new Set(occurrences.map(o => o.issueId));
                for (const id of issueIdSet) {
                    const occ = occurrences.find(o => o.issueId === id);
                    if (occ) {
                        const resolved = await this.resolveFilePath(occ.filePath);
                        if (resolved) { localIssueIds.push(id); }
                    }
                }
            }

            this.postMessage({ type: 'errors', data: issues, projectId, localIssueIds });
        } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            console.error('[PostHog] loadErrors failed:', detail);
            this.postMessage({ type: 'error', section: 'errors', message: `Failed to load errors: ${detail}` });
        }
    }

    private async resolveFilePath(filePath: string): Promise<vscode.Uri | null> {
        let cleaned = filePath;
        try {
            const url = new URL(cleaned);
            cleaned = url.pathname.replace(/^\//, '');
        } catch { /* not a URL */ }

        if (cleaned.includes('node_modules') || cleaned.startsWith('chrome-extension')) {
            return null;
        }

        const matches = await vscode.workspace.findFiles(`**/${cleaned}`, '**/node_modules/**', 1);
        if (matches.length > 0) { return matches[0]; }

        const basename = cleaned.split('/').pop();
        if (basename) {
            const fallback = await vscode.workspace.findFiles(`**/${basename}`, '**/node_modules/**', 3);
            if (fallback.length === 1) { return fallback[0]; }
        }
        return null;
    }

    private async loadExperiments() {
        const projectId = this.authService.getProjectId();
        if (!projectId) { return; }

        this.postMessage({ type: 'loading', section: 'experiments' });
        try {
            const experiments = await this.postHogService.getExperiments(projectId);
            // Build results map from cache (prefetched on startup)
            const resultsMap: Record<number, unknown> = {};
            if (this.experimentCache) {
                for (const exp of experiments) {
                    const r = this.experimentCache.getResults(exp.id);
                    if (r) { resultsMap[exp.id] = r; }
                }
            }
            this.postMessage({ type: 'experiments', data: experiments, results: resultsMap, projectId });
        } catch {
            this.postMessage({ type: 'error', section: 'experiments', message: 'Failed to load experiments' });
        }
    }

    private async loadInsights() {
        const projectId = this.authService.getProjectId();
        if (!projectId) { return; }

        this.postMessage({ type: 'loading', section: 'analytics' });
        try {
            const insights = await this.postHogService.getInsights(projectId);
            this.insightsCache = insights;
            // Send whatever we have immediately
            this.postMessage({ type: 'insights', data: insights, projectId });

            // Refresh insights that have no cached results
            const stale = insights.filter(i => !i.result || i.result.length === 0);
            if (stale.length > 0) {
                const refreshed = await Promise.allSettled(
                    stale.map(i => this.postHogService.refreshInsight(projectId, i.id))
                );
                let changed = false;
                for (let idx = 0; idx < stale.length; idx++) {
                    const r = refreshed[idx];
                    if (r.status === 'fulfilled' && r.value.result) {
                        const i = insights.findIndex(x => x.id === stale[idx].id);
                        if (i >= 0) { insights[i] = r.value; changed = true; }
                    }
                }
                if (changed) {
                    this.postMessage({ type: 'insights', data: insights, projectId });
                }
            }
        } catch {
            this.postMessage({ type: 'error', section: 'analytics', message: 'Failed to load insights' });
        }
    }

    private async refreshInsight(insightId: number) {
        const projectId = this.authService.getProjectId();
        if (!projectId) { return; }

        try {
            const insight = await this.postHogService.refreshInsight(projectId, insightId);
            this.postMessage({ type: 'insightRefreshed', data: insight });
        } catch {
            vscode.window.showErrorMessage('Failed to refresh insight.');
        }
    }

    // ── Flag update ──

    private async updateFlag(flagId: number, active: boolean, filters: Record<string, unknown>) {
        const projectId = this.authService.getProjectId();
        if (!projectId) { return; }

        try {
            const updated = await this.postHogService.updateFeatureFlag(projectId, flagId, { active, filters });
            // Refresh cache so inline decorations update
            const flags = await this.postHogService.getFeatureFlags(projectId);
            this.flagCache.update(flags);
            this.postMessage({ type: 'flagUpdated', data: updated });
        } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            this.postMessage({ type: 'flagUpdateError', message: detail });
        }
    }

    // ── Detail panels ──

    private async openFlagPanel(key: string) {
        if (!this.detailPanel) { return; }
        const flag = this.flagCache.getFlag(key);
        if (flag) { this.detailPanel.showFlag(flag); }
    }

    private async openErrorPanel(id: string) {
        if (!this.detailPanel) { return; }
        const projectId = this.authService.getProjectId();
        if (!projectId) { return; }
        try {
            const issues = await this.postHogService.getErrorTrackingIssues(projectId);
            const error = issues.find(e => e.id === id);
            if (error) { this.detailPanel.showError(error); }
        } catch { /* ignore */ }
    }

    private async openExperimentPanel(id: number) {
        if (!this.detailPanel || !this.experimentCache) { return; }
        const exps = this.experimentCache.getExperiments();
        const exp = exps.find(e => e.id === id);
        if (exp) {
            const results = this.experimentCache.getResults(exp.id);
            this.detailPanel.showExperiment(exp, results);
        }
    }

    private async openInsightPanel(id: number) {
        if (!this.detailPanel) { return; }
        const ins = (await this.getCachedInsights())?.find(i => i.id === id);
        if (ins) { this.detailPanel.showInsight(ins); }
    }

    private insightsCache: import('../models/types').Insight[] | null = null;

    private async getCachedInsights() {
        if (this.insightsCache) { return this.insightsCache; }
        const projectId = this.authService.getProjectId();
        if (!projectId) { return []; }
        try {
            this.insightsCache = await this.postHogService.getInsights(projectId);
            return this.insightsCache;
        } catch { return []; }
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
