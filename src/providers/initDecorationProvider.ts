import * as vscode from 'vscode';
import { AuthService } from '../services/authService';
import { PostHogService } from '../services/postHogService';
import { TreeSitterService, PostHogInitCall } from '../services/treeSitterService';
import { Project } from '../models/types';

export class InitDecorationProvider {
    private readonly decoration: vscode.TextEditorDecorationType;
    private readonly invalidTokenDecoration: vscode.TextEditorDecorationType;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;
    private projectsByToken = new Map<string, Project>();
    private projectsFetched = false;

    constructor(
        private readonly authService: AuthService,
        private readonly postHogService: PostHogService,
        private readonly treeSitter: TreeSitterService,
    ) {
        this.decoration = vscode.window.createTextEditorDecorationType({});
        this.invalidTokenDecoration = vscode.window.createTextEditorDecorationType({
            textDecoration: 'underline wavy #E53E3E',
            backgroundColor: 'rgba(229, 62, 62, 0.08)',
        });
    }

    register(): vscode.Disposable[] {
        const disposables: vscode.Disposable[] = [this.decoration, this.invalidTokenDecoration];
        disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => this.triggerUpdate()),
            vscode.workspace.onDidChangeTextDocument(e => {
                if (vscode.window.activeTextEditor?.document === e.document) {
                    this.triggerUpdate();
                }
            }),
        );
        this.triggerUpdate();
        return disposables;
    }

    private triggerUpdate(): void {
        if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
        this.debounceTimer = setTimeout(() => this.update(), 200);
    }

    private async update(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const config = vscode.workspace.getConfiguration('posthog');
        if (!config.get<boolean>('showInlineDecorations', true)) {
            editor.setDecorations(this.decoration, []);
            editor.setDecorations(this.invalidTokenDecoration, []);
            return;
        }

        const doc = editor.document;
        if (!this.treeSitter.isSupported(doc.languageId)) { return; }

        const initCalls = await this.treeSitter.findInitCalls(doc);
        if (initCalls.length === 0) {
            editor.setDecorations(this.decoration, []);
            editor.setDecorations(this.invalidTokenDecoration, []);
            return;
        }

        // Lazy-fetch projects to match tokens
        await this.ensureProjects();

        const decorations: vscode.DecorationOptions[] = [];
        const invalidDecorations: vscode.DecorationOptions[] = [];

        for (const init of initCalls) {
            const { label, color, isValid } = this.buildLabel(init);
            const hover = this.buildHover(init);
            const line = doc.lineAt(init.tokenLine);

            decorations.push({
                range: new vscode.Range(init.tokenLine, line.text.length, init.tokenLine, line.text.length),
                hoverMessage: hover,
                renderOptions: {
                    after: {
                        contentText: label,
                        color,
                        fontStyle: 'italic',
                        margin: '0 0 0 1.5em',
                    },
                },
            });

            if (!isValid) {
                invalidDecorations.push({
                    range: new vscode.Range(init.tokenLine, init.tokenStartCol, init.tokenLine, init.tokenEndCol),
                    hoverMessage: hover,
                });
            }
        }

        editor.setDecorations(this.decoration, decorations);
        editor.setDecorations(this.invalidTokenDecoration, invalidDecorations);
    }

    private buildLabel(init: PostHogInitCall): { label: string; color: string; isValid: boolean } {
        const token = init.token;

        // Invalid token format
        if (!token.startsWith('phc_')) {
            return { label: '⚠ invalid token (expected phc_...)', color: '#E53E3E', isValid: false };
        }

        const parts: string[] = [];

        // Match to project
        const project = this.projectsByToken.get(token);
        if (project) {
            parts.push(`● ${project.name}`);
        } else if (this.projectsFetched) {
            parts.push('● connected');
        } else {
            parts.push('● PostHog');
        }

        // Host info
        const host = this.resolveHost(init);
        if (host) { parts.push(host); }

        // Config highlights
        const configNotes = this.getConfigNotes(init);
        if (configNotes.length > 0) { parts.push(configNotes.join(' · ')); }

        // Use yellow for warnings (missing ui_host, invalid ui_host, or direct cloud without proxy)
        const hasWarning = this.isMissingUiHost(init) || this.isInvalidUiHost(init) || this.isDirectCloudHost(init);
        const color = hasWarning ? '#F9BD2B' : '#4CBB17';

        return { label: parts.join(' · '), color, isValid: true };
    }

    private buildHover(init: PostHogInitCall): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;

        const token = init.token;
        const masked = token.length > 10 ? token.slice(0, 7) + '...' + token.slice(-4) : token;

        if (!token.startsWith('phc_')) {
            md.appendMarkdown(`#### ⚠️ Invalid PostHog Token\n\n`);
            md.appendMarkdown(`\`${masked}\` does not start with \`phc_\`.\n\n`);
            md.appendMarkdown('PostHog project API tokens start with `phc_`. Personal API keys (`phx_`) should not be used in `init()`.\n');
            return md;
        }

        // Project match
        const project = this.projectsByToken.get(token);
        if (project) {
            md.appendMarkdown(`#### 🟢 PostHog · ${project.name}\n\n`);
            md.appendMarkdown(`**Token**: \`${masked}\`\n\n`);
            md.appendMarkdown(`**Project ID**: ${project.id}\n\n`);
        } else {
            md.appendMarkdown(`#### 🟢 PostHog SDK Initialized\n\n`);
            md.appendMarkdown(`**Token**: \`${masked}\`\n\n`);
        }

        // Host
        const apiHost = init.apiHost;
        if (apiHost) {
            const hostLabel = this.classifyHost(apiHost);
            md.appendMarkdown(`**Host**: ${apiHost} (${hostLabel})\n\n`);
        } else {
            md.appendMarkdown(`**Host**: default (US Cloud)\n\n`);
        }

        // Warning for missing ui_host with custom api_host
        if (this.isMissingUiHost(init)) {
            md.appendMarkdown('---\n\n');
            md.appendMarkdown('⚠️ **Missing `ui_host`**: You\'re using a custom `api_host` but haven\'t set `ui_host`.\n\n');
            md.appendMarkdown('The PostHog toolbar won\'t work without it. Add `ui_host: "https://us.posthog.com"` (or `eu.posthog.com`) to your config.\n\n');
            md.appendMarkdown('[Learn more about reverse proxy setup](https://posthog.com/docs/advanced/proxy)\n\n');
        } else if (this.isInvalidUiHost(init)) {
            const uiHost = init.configProperties.get('ui_host') || '';
            md.appendMarkdown('---\n\n');
            md.appendMarkdown(`⚠️ **Invalid \`ui_host\`**: \`${this.truncate(uiHost, 40)}\` is not a valid PostHog UI URL.\n\n`);
            md.appendMarkdown('`ui_host` must be `https://us.posthog.com` or `https://eu.posthog.com` — the URL you use to access PostHog.\n\n');
            md.appendMarkdown('[Learn more about reverse proxy setup](https://posthog.com/docs/advanced/proxy)\n\n');
        } else if (this.isDirectCloudHost(init)) {
            // Reverse proxy suggestion for direct cloud hosts
            md.appendMarkdown('---\n\n');
            md.appendMarkdown('💡 **Tip**: Sending events directly to PostHog can be blocked by ad blockers.\n\n');
            md.appendMarkdown('Set up a [reverse proxy](https://posthog.com/docs/advanced/proxy) to route events through your own domain and improve data accuracy.\n\n');
        }

        // Config details
        if (init.configProperties.size > 0) {
            md.appendMarkdown('---\n\n**SDK Configuration**\n\n');
            const important = [
                'api_host', 'autocapture', 'capture_pageview', 'capture_pageleave',
                'disable_session_recording', 'session_recording', 'persistence',
                'bootstrap', 'advanced_disable_decide', 'loaded', 'opt_out_capturing_by_default',
            ];
            for (const key of important) {
                const value = init.configProperties.get(key);
                if (value !== undefined) {
                    md.appendMarkdown(`- \`${key}\`: \`${this.truncate(value, 60)}\`\n`);
                }
            }
            // Show remaining config keys not in the important list
            for (const [key, value] of init.configProperties) {
                if (!important.includes(key)) {
                    md.appendMarkdown(`- \`${key}\`: \`${this.truncate(value, 60)}\`\n`);
                }
            }
        }

        return md;
    }

    private resolveHost(init: PostHogInitCall): string | null {
        if (!init.apiHost) { return 'US Cloud'; }
        return this.classifyHost(init.apiHost);
    }

    private classifyHost(host: string): string {
        try {
            const hostname = new URL(host).hostname;
            if (hostname === 'us.posthog.com' || hostname === 'us.i.posthog.com') { return 'US Cloud'; }
            if (hostname === 'eu.posthog.com' || hostname === 'eu.i.posthog.com') { return 'EU Cloud'; }
            return hostname;
        } catch {
            return host;
        }
    }

    private isDirectCloudHost(init: PostHogInitCall): boolean {
        // No api_host means default (us.posthog.com) - also direct
        if (!init.apiHost) { return true; }
        try {
            const hostname = new URL(init.apiHost).hostname;
            return hostname === 'us.posthog.com' || hostname === 'eu.posthog.com'
                || hostname === 'us.i.posthog.com' || hostname === 'eu.i.posthog.com';
        } catch {
            return false;
        }
    }

    private isMissingUiHost(init: PostHogInitCall): boolean {
        // If using a custom api_host (not cloud) but no ui_host, toolbar won't work
        if (!init.apiHost) { return false; } // Using default, no issue
        if (this.isDirectCloudHost(init)) { return false; } // Using cloud directly, no issue
        return !init.configProperties.has('ui_host');
    }

    private isInvalidUiHost(init: PostHogInitCall): boolean {
        const uiHost = init.configProperties.get('ui_host');
        if (!uiHost) { return false; }
        // Remove quotes if present
        const cleaned = uiHost.replace(/^['"]|['"]$/g, '');
        try {
            const hostname = new URL(cleaned).hostname;
            return hostname !== 'us.posthog.com' && hostname !== 'eu.posthog.com';
        } catch {
            return true; // Invalid URL
        }
    }

    private getConfigNotes(init: PostHogInitCall): string[] {
        const notes: string[] = [];
        const props = init.configProperties;

        // Warnings (show first as they're important)
        if (this.isMissingUiHost(init)) { notes.push('⚠ missing ui_host'); }
        if (this.isInvalidUiHost(init)) { notes.push('⚠ invalid ui_host'); }
        if (this.isDirectCloudHost(init)) { notes.push('⚠ no reverse proxy'); }

        if (props.get('autocapture') === 'false') { notes.push('autocapture off'); }
        if (props.get('disable_session_recording') === 'true') { notes.push('replay off'); }
        if (props.get('capture_pageview') === 'false') { notes.push('no pageviews'); }
        if (props.get('opt_out_capturing_by_default') === 'true') { notes.push('opt-out default'); }
        if (props.has('bootstrap')) { notes.push('bootstrapped'); }
        if (props.get('persistence') === "'memory'") { notes.push('memory persistence'); }

        return notes;
    }

    private async ensureProjects(): Promise<void> {
        if (this.projectsFetched) { return; }
        if (!this.authService.isAuthenticated()) { return; }

        try {
            const projects = await this.postHogService.getProjects();
            for (const p of projects) {
                if (p.api_token) {
                    this.projectsByToken.set(p.api_token, p);
                }
            }
        } catch { /* silent */ }
        this.projectsFetched = true;
    }

    private truncate(s: string, max: number): string {
        return s.length > max ? s.slice(0, max) + '...' : s;
    }
}
