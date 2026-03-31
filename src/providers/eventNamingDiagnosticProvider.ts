import * as vscode from 'vscode';
import { EventCacheService } from '../services/eventCacheService';
import { TreeSitterService } from '../services/treeSitterService';
import { TelemetryService } from '../services/telemetryService';

const CAPTURE_METHODS = new Set([
    'capture', 'Capture',
]);

function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);
    for (let i = 0; i <= m; i++) { dp[i][0] = i; }
    for (let j = 0; j <= n; j++) { dp[0][j] = j; }
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

export class EventNamingDiagnosticProvider {
    private readonly diagnosticCollection: vscode.DiagnosticCollection;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private readonly eventCache: EventCacheService,
        private readonly treeSitter: TreeSitterService,
        private readonly telemetry: TelemetryService,
    ) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('posthog-events');
    }

    register(): vscode.Disposable[] {
        const disposables: vscode.Disposable[] = [this.diagnosticCollection];

        disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => this.triggerUpdate()),
            vscode.workspace.onDidChangeTextDocument(e => {
                if (vscode.window.activeTextEditor?.document === e.document) {
                    this.triggerUpdate();
                }
            }),
            vscode.workspace.onDidCloseTextDocument(doc => {
                this.diagnosticCollection.delete(doc.uri);
            }),
        );

        this.eventCache.onChange(() => this.triggerUpdate());
        this.triggerUpdate();

        return disposables;
    }

    private triggerUpdate() {
        if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
        this.debounceTimer = setTimeout(() => this.updateDiagnostics(), 500);
    }

    private async updateDiagnostics() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const doc = editor.document;
        if (!this.treeSitter.isSupported(doc.languageId)) {
            this.diagnosticCollection.delete(doc.uri);
            return;
        }

        const calls = await this.treeSitter.findPostHogCalls(doc);
        const knownNames = this.eventCache.getEventNames();
        if (knownNames.length === 0) {
            this.diagnosticCollection.delete(doc.uri);
            return;
        }

        const diagnostics: vscode.Diagnostic[] = [];

        for (const call of calls) {
            if (!CAPTURE_METHODS.has(call.method)) { continue; }

            const eventName = call.key;
            // Skip if the event is already known
            if (this.eventCache.getEvent(eventName)) { continue; }
            // Skip internal events
            if (eventName.startsWith('$')) { continue; }

            // Find the closest match by Levenshtein distance
            let closestMatch: string | undefined;
            let closestDistance = Infinity;

            for (const known of knownNames) {
                const dist = levenshtein(eventName, known);
                if (dist < closestDistance) {
                    closestDistance = dist;
                    closestMatch = known;
                }
            }

            if (closestMatch && closestDistance > 0 && closestDistance <= 2) {
                const range = new vscode.Range(
                    call.line, call.keyStartCol,
                    call.line, call.keyEndCol,
                );
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Did you mean '${closestMatch}'? Unknown event '${eventName}'.`,
                    vscode.DiagnosticSeverity.Warning,
                );
                diagnostic.source = 'PostHog';
                diagnostics.push(diagnostic);
            }
        }

        if (diagnostics.length > 0) {
            this.telemetry.capture('event_naming_warning_shown', { count: diagnostics.length, language: doc.languageId });
        }

        this.diagnosticCollection.set(doc.uri, diagnostics);
    }
}
