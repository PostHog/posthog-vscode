import * as vscode from 'vscode';
import { EventCacheService } from '../services/eventCacheService';
import { TreeSitterService } from '../services/treeSitterService';

const SPARK_CHARS = '▁▂▃▄▅▆▇█';

function formatCount(n: number): string {
    if (n >= 1_000_000) { return `${(n / 1_000_000).toFixed(1)}M`; }
    if (n >= 1_000) { return `${(n / 1_000).toFixed(1)}K`; }
    return String(n);
}

function buildSparkline(counts: number[]): string {
    const max = Math.max(...counts);
    if (max === 0) { return SPARK_CHARS[0].repeat(counts.length); }
    return counts.map(v => SPARK_CHARS[Math.min(7, Math.floor((v / max) * 7.99))]).join('');
}

const CAPTURE_METHODS = new Set(['capture', 'Capture']);

export class EventDecorationProvider {
    private readonly decoration: vscode.TextEditorDecorationType;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;
    private cachedDecorations: vscode.DecorationOptions[] = [];
    private lastCursorLine: number = -1;

    constructor(
        private readonly eventCache: EventCacheService,
        private readonly treeSitter: TreeSitterService,
    ) {
        this.decoration = vscode.window.createTextEditorDecorationType({});
    }

    register(): vscode.Disposable[] {
        const disposables: vscode.Disposable[] = [this.decoration];

        disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.lastCursorLine = -1;
                this.triggerUpdate();
            }),
            vscode.workspace.onDidChangeTextDocument(e => {
                if (vscode.window.activeTextEditor?.document === e.document) {
                    this.triggerUpdate();
                }
            }),
            vscode.window.onDidChangeTextEditorSelection(e => {
                if (e.textEditor === vscode.window.activeTextEditor) {
                    this.onCursorMove(e.textEditor);
                }
            }),
        );

        this.eventCache.onChange(() => this.triggerUpdate());
        this.triggerUpdate();

        return disposables;
    }

    private onCursorMove(editor: vscode.TextEditor) {
        const config = vscode.workspace.getConfiguration('posthog');
        const mode = config.get<string>('inlineHintsMode', 'always');

        if (mode !== 'currentLine') { return; }

        // Only update if cursor moved to a different line
        const cursorLine = editor.selection.active.line;
        if (cursorLine === this.lastCursorLine) { return; }
        this.lastCursorLine = cursorLine;

        // Filter decorations to only the cursor line
        const filteredDecorations = this.cachedDecorations.filter(d =>
            d.range.start.line === cursorLine
        );

        editor.setDecorations(this.decoration, filteredDecorations);
    }

    refresh(): void {
        this.triggerUpdate();
    }

    private triggerUpdate() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => this.updateDecorations(), 200);
    }

    private async updateDecorations() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const config = vscode.workspace.getConfiguration('posthog');
        if (!config.get<boolean>('showInlineDecorations', true)) {
            editor.setDecorations(this.decoration, []);
            this.cachedDecorations = [];
            return;
        }

        const doc = editor.document;
        if (!this.treeSitter.isSupported(doc.languageId)) { return; }

        const calls = await this.treeSitter.findPostHogCalls(doc);
        const decorations: vscode.DecorationOptions[] = [];

        for (const call of calls) {
            if (!CAPTURE_METHODS.has(call.method)) { continue; }

            if (call.dynamic) {
                const line = doc.lineAt(call.line);
                decorations.push({
                    range: new vscode.Range(call.line, line.text.length, call.line, line.text.length),
                    renderOptions: {
                        after: {
                            contentText: '    ⚠ dynamic event name',
                            color: new vscode.ThemeColor('editorGhostText.foreground') as unknown as string,
                            fontStyle: 'italic',
                        },
                    },
                });
                continue;
            }

            const eventName = call.key;
            const volume = this.eventCache.getVolume(eventName);
            const event = this.eventCache.getEvent(eventName);

            let text: string;
            let color: string;

            const sparkline = this.eventCache.getSparkline(eventName);

            if (volume && volume.count > 0) {
                const spark = sparkline ? `${buildSparkline(sparkline)} ` : '';
                text = `${spark}${formatCount(volume.count)} in ${volume.days}d`;
                color = '#4CBB17';
                console.log(eventName, spark, sparkline, text, color);
            } else if (sparkline) {
                // Has sparkline data but volume query returned 0 (possible timing mismatch)
                text = `${buildSparkline(sparkline)} 0 in 7d`;
                color = new vscode.ThemeColor('editorGhostText.foreground') as unknown as string;
            } else if (event) {
                const lastSeen = event.last_seen_at;
                if (lastSeen) {
                    const daysAgo = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 86400000);
                    text = daysAgo === 0 ? 'last seen today' : `last seen ${daysAgo}d ago`;
                    color = new vscode.ThemeColor('editorGhostText.foreground') as unknown as string;
                } else {
                    text = 'no events yet';
                    color = '#F9BD2B';
                }
            } else if (!this.eventCache.lastRefreshed) {
                // Cache hasn't loaded yet — skip decoration instead of showing "unknown"
                continue;
            } else {
                text = 'unknown event';
                color = '#F9BD2B';
            }

            const line = doc.lineAt(call.line);
            decorations.push({
                range: new vscode.Range(call.line, line.text.length, call.line, line.text.length),
                renderOptions: {
                    after: {
                        contentText: `    ${text}`,
                        color,
                        fontStyle: 'italic',
                    },
                },
            });
        }

        // Cache decorations for currentLine mode
        this.cachedDecorations = decorations;

        // Apply decorations based on mode
        const mode = config.get<string>('inlineHintsMode', 'always');
        if (mode === 'currentLine') {
            this.lastCursorLine = -1; // Force refresh
            this.onCursorMove(editor);
        } else {
            editor.setDecorations(this.decoration, decorations);
        }
    }
}
