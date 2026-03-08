import * as vscode from 'vscode';
import { AuthService } from '../services/authService';
import { PostHogService } from '../services/postHogService';
import { FlagCacheService } from '../services/flagCacheService';
import { FeatureFlag, Experiment, ExperimentResults, ErrorTrackingIssue, Insight } from '../models/types';

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) { nonce += chars.charAt(Math.floor(Math.random() * chars.length)); }
    return nonce;
}

export class DetailPanelProvider {
    private panels = new Map<string, vscode.WebviewPanel>();

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly authService: AuthService,
        private readonly postHogService: PostHogService,
        private readonly flagCache: FlagCacheService,
    ) {}

    showFlag(flag: FeatureFlag) {
        const panel = this.getOrCreatePanel('flag-' + flag.id, flag.key, 'Flag');
        panel.webview.html = this.buildHtml(panel.webview, 'flag', { flag, host: this.getHost(), projectId: this.authService.getProjectId() });
        this.bindFlagMessages(panel);
    }

    showExperiment(experiment: Experiment, results?: ExperimentResults) {
        const panel = this.getOrCreatePanel('exp-' + experiment.id, experiment.name, 'Experiment');
        panel.webview.html = this.buildHtml(panel.webview, 'experiment', {
            experiment, results,
            host: this.getHost(), projectId: this.authService.getProjectId(),
        });
        this.bindCommonMessages(panel);
    }

    showError(error: ErrorTrackingIssue) {
        const panel = this.getOrCreatePanel('err-' + error.id, error.name || 'Error', 'Error');
        panel.webview.html = this.buildHtml(panel.webview, 'error', { error, host: this.getHost(), projectId: this.authService.getProjectId() });
        this.bindErrorMessages(panel);
    }

    showInsight(insight: Insight) {
        const panel = this.getOrCreatePanel('ins-' + insight.id, insight.name || 'Insight', 'Insight');
        panel.webview.html = this.buildHtml(panel.webview, 'insight', {
            insight,
            host: this.getHost(), projectId: this.authService.getProjectId(),
        });
        this.bindInsightMessages(panel);
    }

    // ── Panel management ──

    private getOrCreatePanel(id: string, title: string, type: string): vscode.WebviewPanel {
        const existing = this.panels.get(id);
        if (existing) {
            existing.reveal();
            return existing;
        }

        const panel = vscode.window.createWebviewPanel(
            'codehog.detail',
            `${title}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'resources')],
                retainContextWhenHidden: true,
            },
        );

        const iconPath = vscode.Uri.joinPath(this.extensionUri, 'resources', 'icons', 'codehog.svg');
        panel.iconPath = iconPath;

        this.panels.set(id, panel);
        panel.onDidDispose(() => this.panels.delete(id));
        return panel;
    }

    private getHost(): string {
        return this.authService.getHost().replace(/\/+$/, '');
    }

    // ── Message handlers ──

    private bindCommonMessages(panel: vscode.WebviewPanel) {
        panel.webview.onDidReceiveMessage(async (msg: { type: string; [k: string]: unknown }) => {
            switch (msg.type) {
                case 'copy':
                    await vscode.env.clipboard.writeText(msg.text as string);
                    vscode.window.showInformationMessage(`Copied: ${msg.text}`);
                    break;
                case 'openExternal':
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

    private bindFlagMessages(panel: vscode.WebviewPanel) {
        panel.webview.onDidReceiveMessage(async (msg: { type: string; [k: string]: unknown }) => {
            switch (msg.type) {
                case 'copy':
                    await vscode.env.clipboard.writeText(msg.text as string);
                    vscode.window.showInformationMessage(`Copied: ${msg.text}`);
                    break;
                case 'openExternal':
                    vscode.env.openExternal(vscode.Uri.parse(msg.url as string));
                    break;
                case 'findReferences':
                    vscode.commands.executeCommand('workbench.action.findInFiles', {
                        query: msg.key as string, isRegex: false, isCaseSensitive: true,
                        filesToExclude: '**/node_modules/**',
                    });
                    break;
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
                    } catch (err) {
                        const detail = err instanceof Error ? err.message : String(err);
                        panel.webview.postMessage({ type: 'flagSaveError', message: detail });
                    }
                    break;
                }
            }
        });
    }

    private bindErrorMessages(panel: vscode.WebviewPanel) {
        this.bindCommonMessages(panel);
        panel.webview.onDidReceiveMessage(async (msg: { type: string; [k: string]: unknown }) => {
            if (msg.type === 'jumpToError') {
                // Re-use logic from SidebarProvider
                const projectId = this.authService.getProjectId();
                if (!projectId) { return; }
                try {
                    const exceptions = await this.postHogService.getErrorStackTrace(projectId, msg.issueId as string);
                    if (exceptions.length === 0) {
                        vscode.window.showInformationMessage('No stack trace available.');
                        return;
                    }
                    for (const entry of exceptions) {
                        const frames = entry.stack_trace?.frames;
                        if (!frames) { continue; }
                        const ordered = [...frames].reverse();
                        for (const frame of ordered) {
                            if (!frame.filename || frame.filename.includes('node_modules')) { continue; }
                            let filePath = frame.filename;
                            try { filePath = new URL(filePath).pathname.replace(/^\//, ''); } catch { /* not a URL */ }
                            const matches = await vscode.workspace.findFiles(`**/${filePath}`, '**/node_modules/**', 1);
                            if (matches.length > 0) {
                                const doc = await vscode.workspace.openTextDocument(matches[0]);
                                const pos = new vscode.Position(Math.max(0, (frame.lineno || 1) - 1), Math.max(0, (frame.colno || 1) - 1));
                                await vscode.window.showTextDocument(doc, { selection: new vscode.Range(pos, pos), preview: true });
                                return;
                            }
                        }
                    }
                    vscode.window.showInformationMessage('Could not match stack trace to a local file.');
                } catch {
                    vscode.window.showErrorMessage('Failed to fetch error details.');
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
                } catch {
                    vscode.window.showErrorMessage('Failed to refresh insight.');
                }
            }
        });
    }

    // ── HTML builder ──

    private buildHtml(webview: vscode.Webview, type: string, data: Record<string, unknown>): string {
        const nonce = getNonce();
        const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'resources', 'icons', 'posthog-logo-white.svg'));
        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">${getDetailStyles()}</style>
</head>
<body>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const DATA = ${JSON.stringify(data)};
const LOGO_URI = "${logoUri}";
${getDetailScript(type)}
</script>
</body>
</html>`;
    }
}

// ── Styles ──

function getDetailStyles(): string {
    return /*css*/ `
:root {
    --ph-blue: #1D4AFF;
    --ph-green: #4CBB17;
    --ph-red: #F44;
    --ph-yellow: #F9BD2B;
    --radius: 8px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 0;
}

/* ── Layout ── */
.page { max-width: 720px; margin: 0 auto; padding: 24px 32px 48px; }

.hero {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 24px;
    gap: 16px;
}
.hero-left { flex: 1; min-width: 0; }
.hero-title {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 4px;
    word-break: break-word;
}
.hero-subtitle {
    font-size: 12px;
    opacity: 0.5;
}
.hero-badges { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
}
.badge.active { background: rgba(76, 187, 23, 0.15); color: #4CBB17; }
.badge.inactive { background: rgba(255,255,255,0.08); opacity: 0.6; }
.badge.running { background: rgba(29, 74, 255, 0.15); color: #5B8AFF; }
.badge.complete { background: rgba(76, 187, 23, 0.15); color: #4CBB17; }
.badge.draft { background: rgba(255,255,255,0.08); opacity: 0.6; }
.badge.error { background: rgba(244, 68, 68, 0.15); color: #f66; }
.badge.resolved { background: rgba(76, 187, 23, 0.15); color: #4CBB17; }

.hero-actions { display: flex; gap: 8px; flex-shrink: 0; }
.btn {
    padding: 7px 16px;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
    white-space: nowrap;
}
.btn:hover { opacity: 0.85; }
.btn-primary { background: var(--ph-blue); color: #fff; }
.btn-secondary {
    background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.08));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
}
.btn-ghost {
    background: none;
    color: var(--vscode-foreground);
    opacity: 0.7;
}
.btn-ghost:hover { opacity: 1; }

/* ── Cards ── */
.card {
    background: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.04));
    border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.06));
    border-radius: var(--radius);
    padding: 16px 20px;
    margin-bottom: 16px;
}
.card-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.5;
    margin-bottom: 12px;
}
.card-row {
    display: flex;
    gap: 16px;
    margin-bottom: 16px;
}
.card-row > .card { flex: 1; margin-bottom: 0; }

/* ── Fields ── */
.field { margin-bottom: 16px; }
.field-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.5;
    margin-bottom: 4px;
}
.field-value {
    font-size: 13px;
    line-height: 1.5;
    word-break: break-word;
}
.field-value code {
    font-family: var(--vscode-editor-font-family);
    background: rgba(255,255,255,0.06);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 12px;
}

/* ── Toggle ── */
.toggle-row { display: flex; align-items: center; gap: 12px; }
.toggle {
    width: 40px; height: 22px; border-radius: 11px;
    border: none; background: rgba(255,255,255,0.15); cursor: pointer;
    position: relative; transition: background 0.2s; padding: 0; flex-shrink: 0;
}
.toggle.on { background: var(--ph-green); }
.toggle-knob {
    display: block; width: 16px; height: 16px; border-radius: 50%;
    background: #fff; position: absolute; top: 3px; left: 3px;
    transition: transform 0.2s;
}
.toggle.on .toggle-knob { transform: translateX(18px); }
.toggle-label { font-size: 13px; font-weight: 500; }

/* ── Slider ── */
.slider-row { display: flex; align-items: center; gap: 10px; }
.slider {
    flex: 1; height: 6px; -webkit-appearance: none; appearance: none;
    background: rgba(255,255,255,0.1); border-radius: 3px; outline: none;
}
.slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
    background: var(--ph-blue); cursor: pointer;
}
.num-input {
    width: 56px; background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px; padding: 5px 8px; font-size: 13px; text-align: right;
}
.pct-sign { opacity: 0.4; font-size: 13px; }

/* ── Variants ── */
.variant-list { display: flex; flex-direction: column; gap: 8px; }
.variant-row {
    display: flex; align-items: center; gap: 8px;
    background: rgba(255,255,255,0.03);
    padding: 8px 12px; border-radius: 6px;
}
.variant-key-input {
    flex: 1; background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px; padding: 6px 10px; font-size: 12px;
    font-family: var(--vscode-editor-font-family);
}
.variant-pct-input {
    width: 56px; background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px; padding: 6px 8px; font-size: 12px; text-align: right;
}
.variant-remove {
    background: none; border: none; color: var(--ph-red); cursor: pointer;
    font-size: 18px; padding: 0 4px; opacity: 0.5; line-height: 1;
}
.variant-remove:hover { opacity: 1; }
.add-variant-btn {
    background: none; border: 1px dashed rgba(255,255,255,0.12);
    color: var(--vscode-foreground); padding: 8px; border-radius: 6px;
    font-size: 12px; cursor: pointer; opacity: 0.5; margin-top: 4px;
}
.add-variant-btn:hover { opacity: 1; }

/* ── Payload ── */
.payload-editor {
    width: 100%; min-height: 80px; background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 6px; padding: 10px 12px; font-size: 12px;
    font-family: var(--vscode-editor-font-family); resize: vertical;
    line-height: 1.5; box-sizing: border-box;
}
.payload-label {
    font-size: 10px; font-family: var(--vscode-editor-font-family);
    opacity: 0.4; margin-bottom: 4px;
}

/* ── Save bar ── */
.save-bar {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 0; margin-top: 8px;
}
.save-status { font-size: 12px; }
.save-status.ok { color: var(--ph-green); }
.save-status.err { color: var(--ph-red); }

/* ── Tables ── */
.data-table { width: 100%; border-collapse: collapse; }
.data-table th {
    text-align: left; font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.3px; opacity: 0.4; font-weight: 500;
    padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border);
}
.data-table th.r, .data-table td.r { text-align: right; }
.data-table td {
    padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.04);
    font-size: 12px; vertical-align: top;
}
.data-table .total td { font-weight: 600; border-top: 1px solid var(--vscode-panel-border); }
.data-table .baseline td { opacity: 0.6; }
.sub { font-size: 10px; opacity: 0.45; }
.delta { font-weight: 500; }
.delta.up { color: var(--ph-green); }
.delta.down { color: var(--ph-red); }
.win-badge {
    font-weight: 600; padding: 2px 8px; border-radius: 4px; font-size: 11px;
    display: inline-block;
}
.win-badge.sig-win { background: rgba(76,187,23,0.12); color: #4CBB17; }
.win-badge.sig-lose { background: rgba(244,68,68,0.08); color: #f66; }

/* ── CI bars ── */
.ci-section { margin-top: 10px; }
.ci-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; font-size: 10px; }
.ci-label { width: 55px; font-family: var(--vscode-editor-font-family); opacity: 0.5; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; }
.ci-track { flex: 1; height: 10px; background: rgba(255,255,255,0.04); border-radius: 5px; position: relative; }
.ci-zero { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--vscode-foreground); opacity: 0.15; }
.ci-bar { position: absolute; top: 2px; height: 6px; border-radius: 3px; opacity: 0.7; }
.ci-bar.pos { background: var(--ph-green); }
.ci-bar.neg { background: var(--ph-red); }
.ci-bar.neu { background: var(--vscode-foreground); opacity: 0.25; }
.ci-range { font-family: var(--vscode-editor-font-family); opacity: 0.4; white-space: nowrap; flex-shrink: 0; }

/* ── Conclusion ── */
.conclusion {
    padding: 12px 16px; border-radius: var(--radius); margin-bottom: 16px; font-size: 13px;
}
.conclusion.won { background: rgba(76,187,23,0.08); }
.conclusion.lost { background: rgba(244,68,68,0.08); }
.conclusion-comment { margin-top: 4px; opacity: 0.6; font-size: 12px; font-style: italic; }

/* ── Meta ── */
.meta-row {
    display: flex; gap: 24px; font-size: 12px; opacity: 0.5;
    margin-top: 24px; padding-top: 16px;
    border-top: 1px solid var(--vscode-panel-border);
}

/* ── Insight viz ── */
.viz-container {
    background: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.04));
    border-radius: var(--radius); padding: 20px; margin-bottom: 16px;
    min-height: 120px;
}
.viz-container svg { display: block; }
`;
}

// ── Script ──

function getDetailScript(type: string): string {
    const common = /*js*/ `
function send(msg) { vscode.postMessage(msg); }
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtNum(n) { if (n >= 1e6) return (n/1e6).toFixed(1)+'M'; if (n >= 1e3) return (n/1e3).toFixed(1)+'K'; return String(n); }
function fmtPct(n) { return (n*100).toFixed(1)+'%'; }
function fmtVal(v, t) { if (v==null) return '-'; if (t==='funnel'||t==='retention') return fmtPct(v); return typeof v==='number' ? v.toFixed(2) : String(v); }
`;

    switch (type) {
        case 'flag': return common + getFlagScript();
        case 'experiment': return common + getExperimentScript();
        case 'error': return common + getErrorScript();
        case 'insight': return common + getInsightScript();
        default: return common;
    }
}

function getFlagScript(): string {
    return /*js*/ `
(function() {
    const f = DATA.flag;
    const host = DATA.host;
    const projectId = DATA.projectId;
    const filters = f.filters || {};
    const groups = filters.groups || [];
    const multivariate = filters.multivariate;
    const variants = multivariate && multivariate.variants ? multivariate.variants : [];
    const isMulti = variants.length > 0;
    let rollout = 100;
    if (groups.length > 0 && groups[0].rollout_percentage != null) rollout = groups[0].rollout_percentage;
    else if (f.rollout_percentage != null) rollout = f.rollout_percentage;
    const payloads = filters.payloads || {};
    const created = f.created_at ? new Date(f.created_at).toLocaleDateString() : 'Unknown';
    const createdBy = f.created_by ? (f.created_by.first_name || f.created_by.email) : 'Unknown';

    let html = '<div class="page">';

    // Hero
    html += '<div class="hero"><div class="hero-left">'
        + '<div class="hero-title">' + esc(f.key) + '</div>'
        + (f.name && f.name !== f.key ? '<div class="hero-subtitle">' + esc(f.name) + '</div>' : '')
        + '<div class="hero-badges"><span class="badge ' + (f.active ? 'active' : 'inactive') + '">' + (f.active ? 'Active' : 'Inactive') + '</span></div>'
        + '</div><div class="hero-actions">'
        + '<button class="btn btn-secondary" onclick="send({type:\\'findReferences\\',key:\\'' + esc(f.key) + '\\'})">Find References</button>'
        + '<button class="btn btn-secondary" onclick="send({type:\\'copy\\',text:\\'' + esc(f.key) + '\\'})">Copy Key</button>'
        + '<button class="btn btn-ghost" onclick="send({type:\\'openExternal\\',url:\\'' + esc(host) + '/project/' + projectId + '/feature_flags/' + f.id + '\\'})">Open in PostHog &#x2197;</button>'
        + '</div></div>';

    // Status toggle
    html += '<div class="card"><div class="card-title">Status</div>'
        + '<div class="toggle-row">'
        + '<button class="toggle' + (f.active ? ' on' : '') + '" id="flag-toggle"><span class="toggle-knob"></span></button>'
        + '<span class="toggle-label" id="toggle-label">' + (f.active ? 'Active' : 'Inactive') + '</span>'
        + '</div></div>';

    // Rollout / Variants
    if (isMulti) {
        html += '<div class="card"><div class="card-title">Variants</div><div class="variant-list" id="variant-list">';
        variants.forEach(function(v, i) {
            html += '<div class="variant-row" data-idx="' + i + '">'
                + '<input class="variant-key-input" value="' + esc(v.key) + '" data-field="key" />'
                + '<input class="variant-pct-input" type="number" min="0" max="100" value="' + v.rollout_percentage + '" data-field="pct" />'
                + '<span class="pct-sign">%</span>'
                + '<button class="variant-remove" title="Remove">&times;</button>'
                + '</div>';
        });
        html += '</div><button class="add-variant-btn" id="add-variant">+ Add variant</button></div>';
    } else {
        html += '<div class="card"><div class="card-title">Rollout</div>'
            + '<div class="slider-row">'
            + '<input type="range" class="slider" id="rollout-slider" min="0" max="100" value="' + rollout + '" />'
            + '<input type="number" class="num-input" id="rollout-num" min="0" max="100" value="' + rollout + '" />'
            + '<span class="pct-sign">%</span>'
            + '</div></div>';
    }

    // Payload
    const payloadKeys = isMulti ? variants.map(function(v) { return v.key; }) : ['true'];
    html += '<div class="card"><div class="card-title">Payload</div>';
    payloadKeys.forEach(function(pk) {
        const val = payloads[pk] != null ? (typeof payloads[pk] === 'string' ? payloads[pk] : JSON.stringify(payloads[pk], null, 2)) : '';
        if (payloadKeys.length > 1) html += '<div class="payload-label">' + esc(pk) + '</div>';
        html += '<textarea class="payload-editor" data-key="' + esc(pk) + '" placeholder="JSON payload (optional)" spellcheck="false">' + esc(val) + '</textarea>';
    });
    html += '</div>';

    // Save bar
    html += '<div class="save-bar">'
        + '<button class="btn btn-primary" id="save-btn">Save Changes</button>'
        + '<span class="save-status" id="save-status"></span></div>';

    // Meta
    html += '<div class="meta-row"><span>Created ' + created + ' by ' + esc(createdBy) + '</span></div>';
    html += '</div>';

    document.body.innerHTML = html;

    // Bindings
    var toggle = document.getElementById('flag-toggle');
    toggle.addEventListener('click', function() {
        toggle.classList.toggle('on');
        document.getElementById('toggle-label').textContent = toggle.classList.contains('on') ? 'Active' : 'Inactive';
    });

    var slider = document.getElementById('rollout-slider');
    var num = document.getElementById('rollout-num');
    if (slider && num) {
        slider.addEventListener('input', function() { num.value = slider.value; });
        num.addEventListener('input', function() { slider.value = num.value; });
    }

    var addBtn = document.getElementById('add-variant');
    if (addBtn) {
        addBtn.addEventListener('click', function() {
            var list = document.getElementById('variant-list');
            var row = document.createElement('div');
            row.className = 'variant-row';
            row.innerHTML = '<input class="variant-key-input" value="" data-field="key" placeholder="key" />'
                + '<input class="variant-pct-input" type="number" min="0" max="100" value="0" data-field="pct" />'
                + '<span class="pct-sign">%</span>'
                + '<button class="variant-remove" title="Remove">&times;</button>';
            list.appendChild(row);
            bindRemove();
        });
    }
    function bindRemove() {
        document.querySelectorAll('.variant-remove').forEach(function(b) {
            b.onclick = function() { b.closest('.variant-row').remove(); };
        });
    }
    bindRemove();

    document.getElementById('save-btn').addEventListener('click', function() {
        var active = toggle.classList.contains('on');
        var patch = { active: active };
        var newFilters = {};
        var rows = document.querySelectorAll('.variant-row');
        if (rows.length > 0) {
            var vv = [];
            rows.forEach(function(r) {
                var k = r.querySelector('[data-field="key"]').value.trim();
                var p = Number(r.querySelector('[data-field="pct"]').value) || 0;
                if (k) vv.push({ key: k, rollout_percentage: p });
            });
            newFilters.multivariate = { variants: vv };
            newFilters.groups = groups.length > 0 ? groups : [{ properties: [], rollout_percentage: 100 }];
        } else {
            newFilters.groups = [{ properties: [], rollout_percentage: Number(num.value) }];
        }
        var editors = document.querySelectorAll('.payload-editor');
        var pp = {}; var hasP = false;
        editors.forEach(function(ta) {
            var v = ta.value.trim();
            if (v) { try { pp[ta.dataset.key] = JSON.parse(v); } catch(e) { pp[ta.dataset.key] = v; } hasP = true; }
        });
        if (hasP) newFilters.payloads = pp;
        patch.filters = newFilters;

        document.getElementById('save-status').textContent = 'Saving...';
        document.getElementById('save-status').className = 'save-status';
        send({ type: 'saveFlag', flagId: f.id, patch: patch });
    });

    window.addEventListener('message', function(e) {
        if (e.data.type === 'flagSaved') {
            document.getElementById('save-status').textContent = 'Saved!';
            document.getElementById('save-status').className = 'save-status ok';
        } else if (e.data.type === 'flagSaveError') {
            document.getElementById('save-status').textContent = e.data.message || 'Failed';
            document.getElementById('save-status').className = 'save-status err';
        }
    });
})();
`;
}

function getExperimentScript(): string {
    return /*js*/ `
(function() {
    const exp = DATA.experiment;
    const results = DATA.results;
    const host = DATA.host;
    const projectId = DATA.projectId;

    let status, badgeCls;
    if (exp.end_date) { status = 'Complete'; badgeCls = 'complete'; }
    else if (exp.start_date) { status = 'Running'; badgeCls = 'running'; }
    else { status = 'Draft'; badgeCls = 'draft'; }

    const created = exp.created_at ? new Date(exp.created_at).toLocaleDateString() : 'Unknown';
    const createdBy = exp.created_by ? (exp.created_by.first_name || exp.created_by.email) : 'Unknown';
    const variants = exp.parameters && exp.parameters.feature_flag_variants;

    let html = '<div class="page">';

    // Hero
    html += '<div class="hero"><div class="hero-left">'
        + '<div class="hero-title">' + esc(exp.name) + '</div>'
        + '<div class="hero-subtitle"><code>' + esc(exp.feature_flag_key) + '</code></div>'
        + '<div class="hero-badges"><span class="badge ' + badgeCls + '">' + status + '</span>';
    if (exp.start_date) {
        var start = new Date(exp.start_date);
        var end = exp.end_date ? new Date(exp.end_date) : new Date();
        var days = Math.ceil((end.getTime() - start.getTime()) / 86400000);
        html += '<span class="badge draft">' + days + ' day' + (days !== 1 ? 's' : '') + '</span>';
    }
    html += '</div></div><div class="hero-actions">'
        + '<button class="btn btn-secondary" onclick="send({type:\\'findReferences\\',key:\\'' + esc(exp.feature_flag_key) + '\\'})">Find References</button>'
        + '<button class="btn btn-secondary" onclick="send({type:\\'copy\\',text:\\'' + esc(exp.feature_flag_key) + '\\'})">Copy Flag Key</button>'
        + '<button class="btn btn-ghost" onclick="send({type:\\'openExternal\\',url:\\'' + esc(host) + '/project/' + projectId + '/experiments/' + exp.id + '\\'})">Open in PostHog &#x2197;</button>'
        + '</div></div>';

    if (exp.description) {
        html += '<div class="field"><div class="field-value">' + esc(exp.description) + '</div></div>';
    }

    // Conclusion
    if (exp.conclusion) {
        var cText = exp.conclusion === 'won' ? '&#x1F3C6; Winner declared' : '&#x274C; No winner';
        html += '<div class="conclusion ' + exp.conclusion + '"><strong>' + cText + '</strong>';
        if (exp.conclusion_comment) html += '<div class="conclusion-comment">' + esc(exp.conclusion_comment) + '</div>';
        html += '</div>';
    }

    // Exposures
    if (results) {
        var exposures = [];
        if (results.variants && results.variants.length > 0) {
            exposures = results.variants;
        } else if (results.primary && results.primary.results && results.primary.results[0]) {
            var d = results.primary.results[0].data;
            if (d && d.baseline) {
                exposures.push({ key: d.baseline.key, absolute_exposure: d.baseline.absolute_exposure || d.baseline.number_of_samples });
                (d.variant_results || []).forEach(function(v) {
                    exposures.push({ key: v.key, absolute_exposure: v.absolute_exposure || v.number_of_samples });
                });
            }
        }
        if (exposures.length > 0) {
            var total = exposures.reduce(function(s,e) { return s + (e.absolute_exposure||0); }, 0);
            html += '<div class="card"><div class="card-title">Exposures</div>'
                + '<table class="data-table"><thead><tr><th>Variant</th><th class="r">Exposures</th><th class="r">%</th></tr></thead><tbody>';
            exposures.forEach(function(e) {
                html += '<tr><td>' + esc(e.key) + '</td><td class="r">' + fmtNum(e.absolute_exposure||0) + '</td><td class="r">' + (total > 0 ? ((e.absolute_exposure||0)/total*100).toFixed(1)+'%' : '-') + '</td></tr>';
            });
            html += '<tr class="total"><td>Total</td><td class="r">' + fmtNum(total) + '</td><td class="r">100%</td></tr>';
            html += '</tbody></table></div>';
        }
    }

    // Metric tables
    function renderMetrics(label, metrics, metricResults) {
        if (!metrics || metrics.length === 0) return '';
        var h = '<div class="card"><div class="card-title">' + esc(label) + '</div>';
        metrics.forEach(function(m, mi) {
            var r = metricResults ? metricResults[mi] : null;
            var typeLabels = { funnel: 'Funnel', mean: 'Mean', ratio: 'Ratio', retention: 'Retention' };
            h += '<div style="margin-bottom:16px"><div style="font-size:13px;font-weight:600;margin-bottom:8px">'
                + (mi+1) + '. ' + esc(m.name || 'Unnamed')
                + ' <span style="font-weight:400;opacity:0.4;font-size:11px">' + (typeLabels[m.metric_type]||m.metric_type) + '</span></div>';

            if (r && r.data) {
                var bl = r.data.baseline;
                var vrs = r.data.variant_results || [];
                var winner = vrs.length > 0 ? vrs.reduce(function(b,v) { return v.chance_to_win > b.chance_to_win ? v : b; }) : null;

                h += '<table class="data-table"><thead><tr><th>Variant</th><th class="r">Value</th><th class="r">Delta</th><th class="r">Win %</th></tr></thead><tbody>';
                h += '<tr class="baseline"><td>' + esc(bl.key) + '</td><td class="r">' + fmtVal(bl.mean, m.metric_type) + '<div class="sub">' + fmtNum(bl.number_of_samples) + '</div></td><td class="r">-</td><td class="r">-</td></tr>';
                vrs.forEach(function(v) {
                    var wp = Math.round(v.chance_to_win*100);
                    var isW = v === winner && v.significant;
                    var dStr = v.delta != null ? '<span class="delta ' + (v.delta > 0 ? 'up' : v.delta < 0 ? 'down' : '') + '">' + (v.delta > 0 ? '+' : '') + (v.delta*100).toFixed(1) + '%</span>' : '-';
                    var wCls = v.significant ? (isW ? 'sig-win' : 'sig-lose') : '';
                    h += '<tr><td>' + esc(v.key) + (isW ? ' &#x2B50;' : '') + '</td>'
                        + '<td class="r">' + fmtVal(v.mean, m.metric_type) + '<div class="sub">' + fmtNum(v.number_of_samples) + '</div></td>'
                        + '<td class="r">' + dStr + '</td>'
                        + '<td class="r"><span class="win-badge ' + wCls + '">' + wp + '%</span></td></tr>';
                });
                h += '</tbody></table>';

                // CI bars
                if (vrs.some(function(v) { return v.credible_interval; })) {
                    h += '<div class="ci-section">';
                    vrs.forEach(function(v) {
                        if (!v.credible_interval) return;
                        var lo = v.credible_interval[0]*100, hi = v.credible_interval[1]*100;
                        var mn = Math.min(lo, -50), mx = Math.max(hi, 50), sp = mx - mn;
                        var lp = (lo-mn)/sp*100, wp2 = (hi-lo)/sp*100, zp = (0-mn)/sp*100;
                        var cls = lo > 0 ? 'pos' : hi < 0 ? 'neg' : 'neu';
                        h += '<div class="ci-row"><span class="ci-label">' + esc(v.key) + '</span>'
                            + '<div class="ci-track"><div class="ci-zero" style="left:'+zp+'%"></div><div class="ci-bar '+cls+'" style="left:'+lp+'%;width:'+Math.max(wp2,1)+'%"></div></div>'
                            + '<span class="ci-range">['+lo.toFixed(1)+'%, '+hi.toFixed(1)+'%]</span></div>';
                    });
                    h += '</div>';
                }
            } else {
                h += '<div style="opacity:0.5;font-size:12px">No results yet</div>';
            }
            h += '</div>';
        });
        h += '</div>';
        return h;
    }

    if (results) {
        html += renderMetrics('Primary metrics', exp.metrics, results.primary && results.primary.results);
        html += renderMetrics('Secondary metrics', exp.metrics_secondary, results.secondary && results.secondary.results);
    } else if (variants && variants.length > 0) {
        html += '<div class="card"><div class="card-title">Variant allocation</div>'
            + '<table class="data-table"><thead><tr><th>Variant</th><th class="r">%</th></tr></thead><tbody>';
        variants.forEach(function(v) { html += '<tr><td>' + esc(v.key) + '</td><td class="r">' + v.rollout_percentage + '%</td></tr>'; });
        html += '</tbody></table></div>';
    }

    html += '<div class="meta-row"><span>Created ' + created + ' by ' + esc(createdBy) + '</span></div>';
    html += '</div>';
    document.body.innerHTML = html;
})();
`;
}

function getErrorScript(): string {
    return /*js*/ `
(function() {
    const e = DATA.error;
    const host = DATA.host;
    const projectId = DATA.projectId;
    const issueId = e.short_id || e.id;

    let html = '<div class="page">';
    html += '<div class="hero"><div class="hero-left">'
        + '<div class="hero-title">' + esc(e.name || 'Unknown error') + '</div>'
        + '<div class="hero-badges"><span class="badge ' + (e.status === 'resolved' ? 'resolved' : 'error') + '">' + esc(e.status) + '</span></div>'
        + '</div><div class="hero-actions">'
        + '<button class="btn btn-primary" onclick="send({type:\\'jumpToError\\',issueId:\\'' + esc(e.id) + '\\'})">Jump to Code</button>'
        + '<button class="btn btn-ghost" onclick="send({type:\\'openExternal\\',url:\\'' + esc(host) + '/project/' + projectId + '/error_tracking/' + issueId + '\\'})">Open in PostHog &#x2197;</button>'
        + '</div></div>';

    html += '<div class="card-row">';
    if (e.occurrences != null) html += '<div class="card"><div class="card-title">Occurrences</div><div style="font-size:24px;font-weight:700">' + fmtNum(e.occurrences) + '</div></div>';
    if (e.sessions != null) html += '<div class="card"><div class="card-title">Sessions</div><div style="font-size:24px;font-weight:700">' + fmtNum(e.sessions) + '</div></div>';
    if (e.users != null) html += '<div class="card"><div class="card-title">Users</div><div style="font-size:24px;font-weight:700">' + fmtNum(e.users) + '</div></div>';
    html += '</div>';

    if (e.description) html += '<div class="card"><div class="card-title">Description</div><div class="field-value">' + esc(e.description) + '</div></div>';

    function timeAgo(d) { if (!d) return 'Unknown'; var diff = Date.now() - new Date(d).getTime(); var days = Math.floor(diff/86400000); if (days===0) return 'Today'; if (days===1) return 'Yesterday'; if (days<30) return days+'d ago'; return Math.floor(days/30)+'mo ago'; }
    html += '<div class="meta-row"><span>First seen: ' + timeAgo(e.first_seen) + '</span>' + (e.last_seen ? '<span>Last seen: ' + timeAgo(e.last_seen) + '</span>' : '') + '</div>';
    html += '</div>';
    document.body.innerHTML = html;
})();
`;
}

function getInsightScript(): string {
    return /*js*/ `
(function() {
    const ins = DATA.insight;
    const host = DATA.host;
    const projectId = DATA.projectId;
    const refreshed = ins.last_refresh ? 'Last refreshed ' + new Date(ins.last_refresh).toLocaleDateString() : 'Not yet computed';
    const kind = ins.query?.source?.kind || 'Unknown';

    let html = '<div class="page">';
    html += '<div class="hero"><div class="hero-left">'
        + '<div class="hero-title">' + esc(ins.name || 'Untitled') + '</div>'
        + '<div class="hero-badges"><span class="badge draft">' + kind + '</span><span class="badge draft">' + refreshed + '</span></div>'
        + '</div><div class="hero-actions">'
        + '<button class="btn btn-secondary" id="refresh-btn">Refresh Data</button>'
        + '<button class="btn btn-ghost" onclick="send({type:\\'openExternal\\',url:\\'' + esc(host) + '/project/' + projectId + '/insights/' + (ins.short_id || ins.id) + '\\'})">Open in PostHog &#x2197;</button>'
        + '</div></div>';

    if (ins.description) html += '<div class="field"><div class="field-value">' + esc(ins.description) + '</div></div>';

    // Visualization
    html += '<div class="viz-container" id="viz">' + renderViz(ins) + '</div>';

    // Data table
    if (ins.result && Array.isArray(ins.result) && ins.result.length > 0) {
        html += '<div class="card"><div class="card-title">Data</div>' + renderDataTable(ins) + '</div>';
    }

    html += '<div class="meta-row"><span>Created ' + (ins.created_at ? new Date(ins.created_at).toLocaleDateString() : 'Unknown') + '</span></div>';
    html += '</div>';
    document.body.innerHTML = html;

    document.getElementById('refresh-btn').addEventListener('click', function() {
        this.textContent = 'Refreshing...';
        this.disabled = true;
        send({ type: 'refreshInsight', insightId: ins.id });
    });

    window.addEventListener('message', function(ev) {
        if (ev.data.type === 'insightRefreshed') {
            location.reload(); // simplest approach
        }
    });

    function renderViz(insight) {
        var r = insight.result;
        if (!r || !Array.isArray(r) || r.length === 0) return '<div style="opacity:0.4;text-align:center;padding:20px">No data</div>';
        var k = insight.query?.source?.kind;
        if (k === 'TrendsQuery' && r[0] && r[0].data) return renderSparklines(r);
        if (k === 'FunnelsQuery' && r[0] && r[0].count != null) return renderFunnel(r);
        return '<div style="opacity:0.4;text-align:center;padding:20px">' + (k || 'Unknown') + ' visualization</div>';
    }

    function renderSparklines(results) {
        var w = 640, h = 160, pad = 30;
        var allVals = []; results.forEach(function(s) { allVals = allVals.concat(s.data); });
        var minV = Math.min.apply(null, allVals), maxV = Math.max.apply(null, allVals);
        if (minV === maxV) { minV -= 1; maxV += 1; }
        var colors = ['#1D4AFF','#4CBB17','#F9BD2B','#F44','#9B59B6','#1ABC9C'];
        var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">';
        results.forEach(function(series, si) {
            if (!series.data || series.data.length < 2) return;
            var pts = series.data.map(function(v, i) {
                var x = pad + i / (series.data.length - 1) * (w - pad * 2);
                var y = h - pad - ((v - minV) / (maxV - minV)) * (h - pad * 2);
                return x + ',' + y;
            }).join(' ');
            svg += '<polyline points="' + pts + '" fill="none" stroke="' + colors[si % colors.length] + '" stroke-width="2" />';
        });
        svg += '</svg>';
        // Legend
        var legend = '<div style="display:flex;gap:16px;margin-top:8px;flex-wrap:wrap">';
        results.forEach(function(s, i) {
            legend += '<span style="font-size:11px;display:flex;align-items:center;gap:4px">'
                + '<span style="width:8px;height:8px;border-radius:50%;background:' + colors[i%colors.length] + '"></span>'
                + esc(s.label || 'Series ' + (i+1)) + ' (' + fmtNum(s.count) + ')</span>';
        });
        legend += '</div>';
        return svg + legend;
    }

    function renderFunnel(steps) {
        var maxCount = steps[0] ? steps[0].count : 1;
        var h2 = '<div>';
        steps.forEach(function(step, i) {
            var pct = maxCount > 0 ? (step.count / maxCount * 100) : 0;
            var convRate = i > 0 && steps[i-1].count > 0 ? (step.count / steps[i-1].count * 100).toFixed(1) + '%' : '';
            h2 += '<div style="margin-bottom:8px">'
                + '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">'
                + '<span>' + (i+1) + '. ' + esc(step.name || step.custom_name || 'Step') + '</span>'
                + '<span>' + fmtNum(step.count) + (convRate ? ' (' + convRate + ')' : '') + '</span></div>'
                + '<div style="height:8px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden">'
                + '<div style="height:100%;width:' + pct + '%;background:#1D4AFF;border-radius:4px"></div></div></div>';
        });
        h2 += '</div>';
        return h2;
    }

    function renderDataTable(insight) {
        var r = insight.result;
        if (!r || r.length === 0) return '';
        var k = insight.query?.source?.kind;
        if (k === 'TrendsQuery' && r[0] && r[0].data) {
            var t = '<table class="data-table"><thead><tr><th>Series</th><th class="r">Total</th></tr></thead><tbody>';
            r.forEach(function(s) { t += '<tr><td>' + esc(s.label) + '</td><td class="r">' + fmtNum(s.count) + '</td></tr>'; });
            t += '</tbody></table>';
            return t;
        }
        return '';
    }
})();
`;
}
