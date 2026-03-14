import * as vscode from 'vscode';
import { ErrorCacheService } from '../services/errorCacheService';
import { AuthService } from '../services/authService';
import { ErrorOccurrence } from '../models/types';

function formatCount(n: number): string {
    if (n >= 1_000_000) { return `${(n / 1_000_000).toFixed(1)}M`; }
    if (n >= 1_000) { return `${(n / 1_000).toFixed(1)}K`; }
    return String(n);
}

function timeAgo(dateStr: string): string {
    const ms = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 60) { return `${minutes}m ago`; }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) { return `${hours}h ago`; }
    const days = Math.floor(hours / 24);
    if (days < 30) { return `${days}d ago`; }
    return new Date(dateStr).toLocaleDateString();
}

export class ErrorDecorationProvider {
    private readonly gutterDecoration: vscode.TextEditorDecorationType;
    private readonly lineDecoration: vscode.TextEditorDecorationType;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private readonly errorCache: ErrorCacheService,
        private readonly authService: AuthService,
    ) {
        this.gutterDecoration = vscode.window.createTextEditorDecorationType({
            gutterIconPath: undefined, // Will use inline rendering instead
            overviewRulerColor: 'rgba(229, 62, 62, 0.6)',
            overviewRulerLane: vscode.OverviewRulerLane.Right,
        });
        this.lineDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(229, 62, 62, 0.08)',
            isWholeLine: true,
        });
    }

    register(): vscode.Disposable[] {
        const disposables: vscode.Disposable[] = [this.gutterDecoration, this.lineDecoration];

        disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => this.triggerUpdate()),
            vscode.workspace.onDidChangeTextDocument(e => {
                if (vscode.window.activeTextEditor?.document === e.document) {
                    this.triggerUpdate();
                }
            }),
        );

        this.errorCache.onChange(() => this.triggerUpdate());
        this.triggerUpdate();

        return disposables;
    }

    private triggerUpdate(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => this.updateDecorations(), 200);
    }

    private updateDecorations(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const doc = editor.document;
        if (doc.uri.scheme !== 'file') { return; }

        const relativePath = this.getRelativePath(doc.uri);
        if (!relativePath) { return; }

        const errors = this.errorCache.getForFile(relativePath);
        if (errors.length === 0) {
            editor.setDecorations(this.gutterDecoration, []);
            editor.setDecorations(this.lineDecoration, []);
            return;
        }

        // Group errors by line (multiple issues can point to the same line)
        const byLine = new Map<number, ErrorOccurrence[]>();
        for (const err of errors) {
            // Stack traces use 1-based lines, VS Code uses 0-based
            const line = err.line - 1;
            if (line < 0 || line >= doc.lineCount) { continue; }

            const existing = byLine.get(line);
            if (existing) {
                existing.push(err);
            } else {
                byLine.set(line, [err]);
            }
        }

        const gutterDecorations: vscode.DecorationOptions[] = [];
        const lineDecorations: vscode.DecorationOptions[] = [];

        for (const [line, lineErrors] of byLine) {
            const docLine = doc.lineAt(line);
            const totalOccurrences = lineErrors.reduce((sum, e) => sum + e.occurrences, 0);
            const mostRecent = lineErrors.reduce((latest, e) =>
                (e.lastSeen && (!latest.lastSeen || e.lastSeen > latest.lastSeen)) ? e : latest
            );

            const label = lineErrors.length === 1
                ? lineErrors[0].title
                : `${lineErrors.length} errors`;
            const countText = totalOccurrences > 0 ? ` · ${formatCount(totalOccurrences)}x` : '';
            const lastSeenText = mostRecent.lastSeen ? ` · ${timeAgo(mostRecent.lastSeen)}` : '';

            const hover = this.buildHover(lineErrors);

            gutterDecorations.push({
                range: new vscode.Range(line, docLine.text.length, line, docLine.text.length),
                hoverMessage: hover,
                renderOptions: {
                    after: {
                        contentText: `    🔴 ${label}${countText}${lastSeenText}`,
                        color: '#E53E3E',
                        fontStyle: 'italic',
                    },
                },
            });

            lineDecorations.push({
                range: new vscode.Range(line, 0, line, 0),
            });
        }

        editor.setDecorations(this.gutterDecoration, gutterDecorations);
        editor.setDecorations(this.lineDecoration, lineDecorations);
    }

    private buildHover(errors: ErrorOccurrence[]): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;

        const host = this.authService.getHost().replace(/\/+$/, '');
        const projectId = this.authService.getProjectId();

        for (let i = 0; i < errors.length; i++) {
            const err = errors[i];
            if (i > 0) { md.appendMarkdown('\n---\n\n'); }

            md.appendMarkdown(`#### 🔴 ${this.escapeMarkdown(err.title)}\n\n`);

            if (err.description) {
                md.appendMarkdown(`${this.escapeMarkdown(err.description)}\n\n`);
            }

            if (err.functionName) {
                md.appendMarkdown(`📍 \`${err.functionName}\`\n\n`);
            }

            const parts: string[] = [];
            if (err.occurrences > 0) {
                parts.push(`${formatCount(err.occurrences)} occurrences`);
            }
            if (err.lastSeen) {
                parts.push(`last seen ${timeAgo(err.lastSeen)}`);
            }
            if (err.firstSeen) {
                parts.push(`first seen ${timeAgo(err.firstSeen)}`);
            }
            if (parts.length > 0) {
                md.appendMarkdown(`${parts.join(' · ')}\n\n`);
            }

            if (host && projectId) {
                const url = `${host}/project/${projectId}/error_tracking/${err.issueId}`;
                md.appendMarkdown(`[Open in PostHog](${url})\n`);
            }
        }

        return md;
    }

    private getRelativePath(uri: vscode.Uri): string | null {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder) { return null; }
        return vscode.workspace.asRelativePath(uri, false);
    }

    private escapeMarkdown(text: string): string {
        return text.replace(/[\\`*_{}[\]()#+\-.!|]/g, '\\$&');
    }
}
