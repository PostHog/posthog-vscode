import * as vscode from 'vscode';
import { AuthService } from '../services/authService';
import { PostHogService } from '../services/postHogService';
import { FlagCacheService } from '../services/flagCacheService';
import { ExperimentCacheService } from '../services/experimentCacheService';
import { FeatureFlag, Experiment, ExperimentResults, Insight, SessionReplayEntry } from '../models/types';
import { TelemetryService } from '../services/telemetryService';

// Webview assets (imported as strings via webpack asset/source)
import detailHtml from './webview/detail/index.html';
import detailCss from './webview/detail/detail.css';
import commonJs from './webview/detail/common.js';
import flagJs from './webview/detail/flag.js';
import experimentJs from './webview/detail/experiment.js';
import insightJs from './webview/detail/insight.js';
import sessionsJs from './webview/detail/sessions.js';
import replayHtml from './webview/detail/replay.html';
import replayCss from './webview/detail/replay.css';
import replayJs from './webview/detail/replay.js';

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) { nonce += chars.charAt(Math.floor(Math.random() * chars.length)); }
    return nonce;
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class DetailPanelProvider {
    private panels = new Map<string, vscode.WebviewPanel>();

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly authService: AuthService,
        private readonly postHogService: PostHogService,
        private readonly flagCache: FlagCacheService,
        private readonly experimentCache: ExperimentCacheService,
        private readonly telemetry?: TelemetryService,
    ) {}

    showFlag(flag: FeatureFlag) {
        this.telemetry?.capture('flag_detail_opened', { flag_key: flag.key, source: 'detail_panel' });
        const panel = this.getOrCreatePanel('flag-' + flag.id, flag.key, 'Flag');
        const experiment = this.experimentCache.getByFlagKey(flag.key);
        panel.webview.html = this.buildHtml(panel.webview, 'flag', {
            flag,
            experiment: experiment ?? null,
            host: this.getHost(),
            projectId: this.authService.getProjectId(),
        });
        this.bindFlagMessages(panel);
    }

    showExperiment(experiment: Experiment, results?: ExperimentResults) {
        this.telemetry?.capture('experiment_detail_opened', { experiment_id: experiment.id });
        const panel = this.getOrCreatePanel('exp-' + experiment.id, experiment.name, 'Experiment');
        panel.webview.html = this.buildHtml(panel.webview, 'experiment', {
            experiment, results,
            host: this.getHost(), projectId: this.authService.getProjectId(),
        });
        this.bindExperimentMessages(panel, experiment);
    }

    showInsight(insight: Insight) {
        const panel = this.getOrCreatePanel('ins-' + insight.id, insight.name || 'Insight', 'Insight');
        panel.webview.html = this.buildHtml(panel.webview, 'insight', {
            insight,
            host: this.getHost(), projectId: this.authService.getProjectId(),
        });
        this.bindInsightMessages(panel);
    }

    async showReplay(session: SessionReplayEntry) {
        const projectId = this.authService.getProjectId();
        if (!projectId) { return; }
        const host = this.getHost();
        const panelId = `replay-${session.sessionId}`;
        const label = session.distinctId.length > 16
            ? session.distinctId.substring(0, 13) + '...'
            : session.distinctId;
        const panel = this.getOrCreatePanel(panelId, `Replay: ${label}`, 'Replay');

        // Show loading state immediately
        panel.webview.html = this.buildReplayHtml(panel.webview, host, projectId, session, undefined);
        this.bindCommonMessages(panel);

        // Fetch sharing URL
        const sharingUrl = await this.postHogService.getSessionSharingUrl(projectId, session.sessionId);
        panel.webview.html = this.buildReplayHtml(panel.webview, host, projectId, session, sharingUrl);
        this.bindCommonMessages(panel);
    }

    async showSessions(key: string, type: 'event' | 'flag') {
        this.telemetry?.capture('sessions_viewed', { key, type });
        const projectId = this.authService.getProjectId();
        if (!projectId) { return; }

        const panelId = `sessions-${type}-${key}`;
        const title = type === 'event' ? `Sessions: ${key}` : `Sessions: ${key}`;
        const panel = this.getOrCreatePanel(panelId, title, 'Sessions');

        // Show loading state immediately
        panel.webview.html = this.buildHtml(panel.webview, 'sessions', {
            key, type, sessions: null,
            host: this.getHost(), projectId,
        });
        this.bindSessionMessages(panel);

        // Fetch sessions
        const sessions = type === 'event'
            ? await this.postHogService.getRecentSessions(projectId, key)
            : await this.postHogService.getRecentSessionsForFlag(projectId, key);

        panel.webview.html = this.buildHtml(panel.webview, 'sessions', {
            key, type, sessions,
            host: this.getHost(), projectId,
        });
        this.bindSessionMessages(panel);
    }

    // ── Panel management ──

    private getOrCreatePanel(id: string, title: string, type: string): vscode.WebviewPanel {
        const existing = this.panels.get(id);
        if (existing) {
            existing.reveal();
            return existing;
        }

        const panel = vscode.window.createWebviewPanel(
            'posthog.detail',
            `${title}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'resources')],
                retainContextWhenHidden: true,
            },
        );

        const iconPath = vscode.Uri.joinPath(this.extensionUri, 'resources', 'icons', 'posthog.svg');
        panel.iconPath = iconPath;

        this.panels.set(id, panel);
        panel.onDidDispose(() => this.panels.delete(id));
        return panel;
    }

    private getHost(): string {
        return this.authService.getHost().replace(/\/+$/, '');
    }

    // ── HTML builders ──

    private buildHtml(webview: vscode.Webview, type: string, data: Record<string, unknown>): string {
        const nonce = getNonce();
        const logoUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'resources', 'icons', 'posthog-logo-white.svg')
        );

        const scriptMap: Record<string, string> = {
            flag: flagJs,
            experiment: experimentJs,
            insight: insightJs,
            sessions: sessionsJs,
        };
        const typeScript = scriptMap[type] || '';

        return detailHtml
            .replace(/\{\{NONCE\}\}/g, nonce)
            .replace('{{CSP_SOURCE}}', webview.cspSource)
            .replace('{{STYLES}}', detailCss)
            .replace('{{DATA}}', JSON.stringify(data).replace(/<\//g, '<\\/'))
            .replace('{{LOGO_URI}}', String(logoUri))
            .replace('{{SCRIPT}}', commonJs + '\n' + typeScript);
    }

    private buildReplayHtml(
        webview: vscode.Webview, host: string, projectId: number,
        session: SessionReplayEntry, sharingUrl: string | null | undefined,
    ): string {
        const nonce = getNonce();
        const replayUrl = `${host}/project/${projectId}/replay/${session.sessionId}`;
        let frameHost: string;
        try { frameHost = new URL(host).origin; } catch { frameHost = host; }

        const isLoading = sharingUrl === undefined;
        let replayContent: string;
        if (isLoading) {
            replayContent = '<div class="center-msg"><div class="spinner"></div><p>Generating sharing link...</p></div>';
        } else if (sharingUrl) {
            replayContent = `<iframe id="replay-frame" src="${sharingUrl}" allow="clipboard-read; clipboard-write"></iframe>`;
        } else {
            replayContent = '<div class="center-msg"><div class="icon">&#x1F3AC;</div>'
                + '<p>Could not generate an embeddable link for this replay.<br>'
                + 'The sharing API may not be available on this PostHog instance.</p>'
                + '<button class="btn" id="btn-fallback-open">Open in Browser Instead</button></div>';
        }

        return replayHtml
            .replace(/\{\{NONCE\}\}/g, nonce)
            .replace('{{FRAME_HOST}}', frameHost)
            .replace('{{STYLES}}', replayCss)
            .replace('{{DISTINCT_ID}}', escapeHtml(session.distinctId))
            .replace('{{CURRENT_URL}}', escapeHtml(session.currentUrl || ''))
            .replace('{{REPLAY_CONTENT}}', replayContent)
            .replace('{{SCRIPT}}', replayJs.replace('{{REPLAY_URL}}', JSON.stringify(replayUrl)));
    }

    // ── Message handlers ──

    private bindSessionMessages(panel: vscode.WebviewPanel) {
        panel.webview.onDidReceiveMessage(async (msg: { type: string; [k: string]: unknown }) => {
            switch (msg.type) {
                case 'watchReplay':
                    this.telemetry?.capture('replay_watched', { session_id: (msg.session as SessionReplayEntry)?.sessionId });
                    this.showReplay(msg.session as SessionReplayEntry);
                    break;
                case 'copy':
                    this.telemetry?.capture('text_copied', { source: 'detail_panel' });
                    await vscode.env.clipboard.writeText(msg.text as string);
                    vscode.window.showInformationMessage(`Copied: ${msg.text}`);
                    break;
                case 'openExternal':
                    this.telemetry?.capture('external_link_opened', { source: 'detail_panel' });
                    vscode.env.openExternal(vscode.Uri.parse(msg.url as string));
                    break;
                case 'findReferences':
                    vscode.commands.executeCommand('workbench.action.findInFiles', {
                        query: msg.key as string, isRegex: false, isCaseSensitive: true,
                        filesToExclude: '**/node_modules/**',
                    });
                    break;
            }
        });
    }

    private bindCommonMessages(panel: vscode.WebviewPanel) {
        panel.webview.onDidReceiveMessage(async (msg: { type: string; [k: string]: unknown }) => {
            switch (msg.type) {
                case 'copy':
                    this.telemetry?.capture('text_copied', { source: 'detail_panel' });
                    await vscode.env.clipboard.writeText(msg.text as string);
                    vscode.window.showInformationMessage(`Copied: ${msg.text}`);
                    break;
                case 'openExternal':
                    this.telemetry?.capture('external_link_opened', { source: 'detail_panel' });
                    vscode.env.openExternal(vscode.Uri.parse(msg.url as string));
                    break;
                case 'findReferences':
                    vscode.commands.executeCommand('workbench.action.findInFiles', {
                        query: msg.key as string, isRegex: false, isCaseSensitive: true,
                        filesToExclude: '**/node_modules/**',
                    });
                    break;
            }
        });
    }

    private bindExperimentMessages(panel: vscode.WebviewPanel, experiment: Experiment) {
        this.bindCommonMessages(panel);
        panel.webview.onDidReceiveMessage(async (msg: { type: string; [k: string]: unknown }) => {
            const projectId = this.authService.getProjectId();
            if (!projectId) { return; }
            switch (msg.type) {
                case 'launch-experiment': {
                    try {
                        const updated = await this.postHogService.launchExperiment(projectId, msg.experimentId as number);
                        const results = await this.postHogService.getExperimentResults(projectId, updated.id).catch(() => null);
                        this.showExperiment(updated, results ?? undefined);
                        panel.webview.postMessage({ type: 'experimentUpdated' });
                        this.telemetry?.capture('experiment_launched', { experiment_id: msg.experimentId });
                    } catch (err) {
                        const detail = err instanceof Error ? err.message : String(err);
                        panel.webview.postMessage({ type: 'experimentError', message: detail });
                        this.telemetry?.capture('experiment_launch_failed', { experiment_id: msg.experimentId });
                    }
                    break;
                }
                case 'stop-experiment': {
                    try {
                        const updated = await this.postHogService.stopExperiment(projectId, msg.experimentId as number);
                        const results = await this.postHogService.getExperimentResults(projectId, updated.id).catch(() => null);
                        this.showExperiment(updated, results ?? undefined);
                        panel.webview.postMessage({ type: 'experimentUpdated' });
                        this.telemetry?.capture('experiment_stopped', { experiment_id: msg.experimentId });
                    } catch (err) {
                        const detail = err instanceof Error ? err.message : String(err);
                        panel.webview.postMessage({ type: 'experimentError', message: detail });
                        this.telemetry?.capture('experiment_stop_failed', { experiment_id: msg.experimentId });
                    }
                    break;
                }
            }
        });
    }

    private bindFlagMessages(panel: vscode.WebviewPanel) {
        panel.webview.onDidReceiveMessage(async (msg: { type: string; [k: string]: unknown }) => {
            switch (msg.type) {
                case 'copy':
                    this.telemetry?.capture('text_copied', { source: 'detail_panel' });
                    await vscode.env.clipboard.writeText(msg.text as string);
                    vscode.window.showInformationMessage(`Copied: ${msg.text}`);
                    break;
                case 'openExternal':
                    this.telemetry?.capture('external_link_opened', { source: 'detail_panel' });
                    vscode.env.openExternal(vscode.Uri.parse(msg.url as string));
                    break;
                case 'findReferences':
                    vscode.commands.executeCommand('workbench.action.findInFiles', {
                        query: msg.key as string, isRegex: false, isCaseSensitive: true,
                        filesToExclude: '**/node_modules/**',
                    });
                    break;
                case 'openExperimentPanel': {
                    const experimentId = msg.id as number;
                    const exp = this.experimentCache.getExperiments().find(e => e.id === experimentId);
                    if (exp) {
                        const results = this.experimentCache.getResults(exp.id);
                        this.showExperiment(exp, results);
                    }
                    break;
                }
                case 'saveFlag': {
                    const projectId = this.authService.getProjectId();
                    if (!projectId) { return; }
                    try {
                        const updated = await this.postHogService.updateFeatureFlag(
                            projectId, msg.flagId as number, msg.patch as Record<string, unknown>,
                        );
                        const flags = await this.postHogService.getFeatureFlags(projectId);
                        this.flagCache.update(flags);
                        panel.webview.postMessage({ type: 'flagSaved', flag: updated });
                        this.telemetry?.capture('flag_saved', { flag_id: msg.flagId, source: 'detail_panel' });
                    } catch (err) {
                        const detail = err instanceof Error ? err.message : String(err);
                        panel.webview.postMessage({ type: 'flagSaveError', message: detail });
                        this.telemetry?.capture('flag_save_failed', { flag_id: msg.flagId });
                    }
                    break;
                }
            }
        });
    }

    private bindInsightMessages(panel: vscode.WebviewPanel) {
        this.bindCommonMessages(panel);
        panel.webview.onDidReceiveMessage(async (msg: { type: string; [k: string]: unknown }) => {
            if (msg.type === 'refreshInsight') {
                const projectId = this.authService.getProjectId();
                if (!projectId) { return; }
                try {
                    const insight = await this.postHogService.refreshInsight(projectId, msg.insightId as number);
                    panel.webview.postMessage({ type: 'insightRefreshed', data: insight });
                    this.telemetry?.capture('insight_refreshed', { insight_id: msg.insightId, source: 'detail_panel' });
                } catch {
                    vscode.window.showErrorMessage('Failed to refresh insight.');
                }
            }
        });
    }
}
