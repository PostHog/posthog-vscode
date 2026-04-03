import * as vscode from 'vscode';
import { AuthService } from '../services/authService';
import { PostHogService } from '../services/postHogService';
import { FlagCacheService } from '../services/flagCacheService';
import { ExperimentCacheService } from '../services/experimentCacheService';
import { Commands } from '../constants';
import { getWebviewHtml } from './getWebviewHtml';
import { DetailPanelProvider } from './DetailPanelProvider';
import { TelemetryService } from '../services/telemetryService';

export class SidebarProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly authService: AuthService,
        private readonly postHogService: PostHogService,
        private readonly flagCache: FlagCacheService,
        private readonly experimentCache?: ExperimentCacheService,
        private readonly detailPanel?: DetailPanelProvider,
        private readonly telemetry?: TelemetryService,
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
                this.telemetry?.capture('sidebar_opened');
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
                this.telemetry?.capture('sidebar_tab_viewed', { tab: 'flags' });
                return this.loadFlags();
            case 'loadExperiments':
                this.telemetry?.capture('sidebar_tab_viewed', { tab: 'experiments' });
                return this.loadExperiments();
            case 'copyFlagKey':
                this.telemetry?.capture('flag_key_copied', { flag_key: msg.key, source: 'sidebar' });
                await vscode.env.clipboard.writeText(msg.key as string);
                vscode.window.showInformationMessage(`Copied: ${msg.key}`);
                return;
            case 'createFlag':
                this.telemetry?.capture('flag_create_from_sidebar', { flag_key: msg.key });
                await vscode.commands.executeCommand(Commands.CREATE_FLAG, msg.key);
                return this.loadFlags();
            case 'findReferences':
                this.telemetry?.capture('flag_references_searched', { flag_key: msg.key, source: 'sidebar' });
                return vscode.commands.executeCommand('workbench.action.findInFiles', {
                    query: msg.key,
                    isRegex: false,
                    isCaseSensitive: true,
                    matchWholeWord: false,
                    filesToInclude: '',
                    filesToExclude: '**/node_modules/**',
                });
            case 'loadInsights':
                this.telemetry?.capture('sidebar_tab_viewed', { tab: 'analytics' });
                return this.loadInsights();
            case 'refreshInsight':
                this.telemetry?.capture('insight_refreshed', { insight_id: msg.insightId });
                return this.refreshInsight(msg.insightId as number);
            case 'updateFlag':
                this.telemetry?.capture('flag_saved', { flag_id: msg.flagId, source: 'sidebar' });
                return this.updateFlag(msg.flagId as number, msg.active as boolean, msg.filters as Record<string, unknown>);
            case 'openFlagPanel':
                this.telemetry?.capture('sidebar_flag_clicked', { flag_key: msg.key });
                return this.openFlagPanel(msg.key as string);
            case 'openExperimentPanel':
                this.telemetry?.capture('sidebar_experiment_clicked', { experiment_id: msg.id });
                return this.openExperimentPanel(msg.id as number);
            case 'openInsightPanel':
                this.telemetry?.capture('sidebar_insight_clicked', { insight_id: msg.id });
                return this.openInsightPanel(msg.id as number);
            case 'retry': {
                this.telemetry?.capture('sidebar_retry', { section: msg.section });
                const section = msg.section as string;
                if (section === 'flags') { return this.loadFlags(); }
                if (section === 'errors') { return; }
                if (section === 'experiments') { return this.loadExperiments(); }
                if (section === 'analytics') { return this.loadInsights(); }
                return;
            }
            case 'openExternal': {
                this.telemetry?.capture('external_link_opened', { source: 'sidebar' });
                const host = this.authService.getHost().replace(/\/+$/, '');
                return vscode.env.openExternal(vscode.Uri.parse(`${host}${msg.path}`));
            }
        }
    }

    // ── Auth ──

    private async sendAuthState() {
        const authed = this.authService.isAuthenticated();
        const hasProject = !!this.authService.getProjectId();
        this.postMessage({
            type: 'authState',
            authenticated: authed,
            needsProject: authed && !hasProject,
            projectName: this.authService.getProjectName() ?? null,
            posthogHost: this.authService.getHost(),
            canWrite: this.authService.getCanWrite(),
        });
        if (authed && hasProject) {
            this.loadInsights().catch(() => {});
        }
    }

    // ── Data loaders ──

    private userEmail: string | null = null;

    private async loadFlags() {
        const projectId = this.authService.getProjectId();
        if (!projectId) { return; }

        this.postMessage({ type: 'loading', section: 'flags' });
        try {
            const [flags] = await Promise.all([
                this.postHogService.getFeatureFlags(projectId),
                // Fetch user email once for the "My flags" filter
                this.userEmail ? Promise.resolve(null) : this.postHogService.getCurrentUserEmail().then(email => { this.userEmail = email; }),
            ]);
            this.flagCache.update(flags);
            const active = flags.filter(f => !f.deleted);
            active.sort((a, b) => {
                if (a.active !== b.active) { return a.active ? -1 : 1; }
                return a.key.localeCompare(b.key);
            });
            this.postMessage({ type: 'flags', data: active, projectId, userEmail: this.userEmail });
        } catch (err) {
            const detail = err instanceof Error ? err.message : 'Unknown error';
            this.postMessage({ type: 'error', section: 'flags', message: `Failed to load feature flags: ${detail}` });
        }
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
        } catch (err) {
            const detail = err instanceof Error ? err.message : 'Unknown error';
            this.postMessage({ type: 'error', section: 'experiments', message: `Failed to load experiments: ${detail}` });
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
            this.telemetry?.capture('insights_loaded', { count: insights.length });

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
        } catch (err) {
            const detail = err instanceof Error ? err.message : 'Unknown error';
            this.postMessage({ type: 'error', section: 'analytics', message: `Failed to load insights: ${detail}` });
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
            this.telemetry?.capture('flag_saved_success', { flag_id: flagId });
        } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            this.postMessage({ type: 'flagUpdateError', message: detail });
            this.telemetry?.capture('flag_save_failed', { flag_id: flagId });
        }
    }

    // ── Detail panels ──

    private async openFlagPanel(key: string) {
        if (!this.detailPanel) { return; }
        const flag = this.flagCache.getFlag(key);
        if (flag) { this.detailPanel.showFlag(flag); }
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

    // ── Webview messaging ──

    private postMessage(msg: unknown) {
        this.view?.webview.postMessage(msg);
    }
}
