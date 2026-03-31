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

    constructor(
        private readonly eventCache: EventCacheService,
        private readonly treeSitter: TreeSitterService,
    ) {
        this.decoration = vscode.window.createTextEditorDecorationType({});
    }

    register(): vscode.Disposable[] {
        const disposables: vscode.Disposable[] = [this.decoration];

        disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => this.triggerUpdate()),
            vscode.workspace.onDidChangeTextDocument(e => {
                if (vscode.window.activeTextEditor?.document === e.document) {
                    this.triggerUpdate();
                }
            }),
        );

        this.eventCache.onChange(() => this.triggerUpdate());
        this.triggerUpdate();

        return disposables;
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
            return;
        }

        const doc = editor.document;
        if (!this.treeSitter.isSupported(doc.languageId)) { return; }

        const calls = await this.treeSitter.findPostHogCalls(doc);
        const decorations: vscode.DecorationOptions[] = [];

        for (const call of calls) {
            if (!CAPTURE_METHODS.has(call.method)) { continue; }

            const eventName = call.key;
            const volume = this.eventCache.getVolume(eventName);
            const event = this.eventCache.getEvent(eventName);

            let text: string;
            let color: string;

            if (volume && volume.count > 0) {
                const sparkline = this.eventCache.getSparkline(eventName);
                const spark = sparkline ? `${buildSparkline(sparkline)} ` : '';
                text = `${spark}${formatCount(volume.count)} in ${volume.days}d`;
                color = '#4CBB17';
            } else if (event) {
                const lastSeen = event.last_seen_at;
                if (lastSeen) {
                    const daysAgo = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 86400000);
                    text = daysAgo === 0 ? 'last seen today' : `last seen ${daysAgo}d ago`;
                    color = daysAgo <= 7 ? '#4CBB17' : new vscode.ThemeColor('editorGhostText.foreground') as unknown as string;
                } else {
                    text = 'no events yet';
                    color = '#F9BD2B';
                }
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

        editor.setDecorations(this.decoration, decorations);
    }
}
