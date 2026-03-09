import * as vscode from 'vscode';
import { EventCacheService } from '../services/eventCacheService';

const CAPTURE_PATTERN = /(?:posthog|client|ph)\.capture\s*\(\s*(['"`])([^'"`]+)\1/g;
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

export class EventDecorationProvider {
    private readonly decoration: vscode.TextEditorDecorationType;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(private readonly eventCache: EventCacheService) {
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

    private updateDecorations() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const doc = editor.document;
        if (!['javascript', 'typescript', 'javascriptreact', 'typescriptreact'].includes(doc.languageId)) {
            return;
        }

        const decorations: vscode.DecorationOptions[] = [];

        for (let i = 0; i < doc.lineCount; i++) {
            const line = doc.lineAt(i);
            CAPTURE_PATTERN.lastIndex = 0;
            let match;

            while ((match = CAPTURE_PATTERN.exec(line.text)) !== null) {
                const eventName = match[2];
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

                decorations.push({
                    range: new vscode.Range(i, line.text.length, i, line.text.length),
                    renderOptions: {
                        after: {
                            contentText: `    ${text}`,
                            color,
                            fontStyle: 'italic',
                        },
                    },
                });
            }
        }

        editor.setDecorations(this.decoration, decorations);
    }
}
