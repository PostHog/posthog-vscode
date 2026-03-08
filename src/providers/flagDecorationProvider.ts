import * as vscode from 'vscode';
import { FlagCacheService } from '../services/flagCacheService';
import { ExperimentCacheService } from '../services/experimentCacheService';
import { FeatureFlag } from '../models/types';

const POSTHOG_FLAG_METHODS = [
    'getFeatureFlag',
    'isFeatureEnabled',
    'getFeatureFlagPayload',
    'getFeatureFlagResult',
    'isFeatureFlagEnabled',
    'getRemoteConfig',
];

const FLAG_CALL_PATTERN = new RegExp(
    `(?:posthog|client|ph)\\.(?:${POSTHOG_FLAG_METHODS.join('|')})\\s*\\(\\s*(['"\`])([^'"\`]+)\\1`,
    'g',
);

export class FlagDecorationProvider {
    private readonly decoration: vscode.TextEditorDecorationType;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private readonly flagCache: FlagCacheService,
        private readonly experimentCache: ExperimentCacheService,
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

        this.flagCache.onChange(() => this.triggerUpdate());
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
        if (!editor) {
            return;
        }

        const doc = editor.document;
        if (!['javascript', 'typescript', 'javascriptreact', 'typescriptreact'].includes(doc.languageId)) {
            return;
        }

        const decorations: vscode.DecorationOptions[] = [];

        for (let i = 0; i < doc.lineCount; i++) {
            const line = doc.lineAt(i);
            FLAG_CALL_PATTERN.lastIndex = 0;
            let match;

            while ((match = FLAG_CALL_PATTERN.exec(line.text)) !== null) {
                const flagKey = match[2];
                const flag = this.flagCache.getFlag(flagKey);
                const experiment = this.experimentCache.getByFlagKey(flagKey);
                const { text, color } = this.buildLabel(flag, experiment);

                decorations.push({
                    range: new vscode.Range(i, line.text.length, i, line.text.length),
                    renderOptions: {
                        after: {
                            contentText: text,
                            color,
                            fontStyle: 'italic',
                            margin: '0 0 0 1.5em',
                        },
                    },
                });
            }
        }

        editor.setDecorations(this.decoration, decorations);
    }

    private buildLabel(flag: FeatureFlag | undefined, experiment?: ReturnType<ExperimentCacheService['getByFlagKey']>): { text: string; color: string } {
        if (!flag) {
            return { text: '⚠ not in PostHog', color: '#F9BD2B' };
        }

        if (!flag.active) {
            return { text: '○ inactive', color: new vscode.ThemeColor('editorGhostText.foreground') as unknown as string };
        }

        // Active flag — build a concise summary
        if (experiment) {
            let expStatus: string;
            if (experiment.end_date) { expStatus = 'complete'; }
            else if (experiment.start_date) { expStatus = 'running'; }
            else { expStatus = 'draft'; }
            return { text: `⚗ experiment ${expStatus}`, color: '#1D4AFF' };
        }

        const rollout = this.extractRollout(flag);
        const variants = this.extractVariantCount(flag);
        const conditions = this.extractConditionCount(flag);

        const parts: string[] = ['●'];

        if (variants > 0) {
            parts.push(`${variants} variants`);
        } else if (rollout !== null && rollout < 100) {
            parts.push(`${rollout}%`);
        } else {
            parts.push('enabled');
        }

        if (conditions > 0) {
            parts.push(`· ${conditions} ${conditions === 1 ? 'condition' : 'conditions'}`);
        }

        return { text: parts.join(' '), color: '#4CBB17' };
    }

    private extractRollout(flag: FeatureFlag): number | null {
        if (flag.rollout_percentage !== null && flag.rollout_percentage !== undefined) {
            return flag.rollout_percentage;
        }

        const filters = flag.filters as Record<string, unknown> | undefined;
        if (filters?.groups && Array.isArray(filters.groups)) {
            for (const group of filters.groups) {
                if (typeof group === 'object' && group !== null) {
                    const rp = (group as Record<string, unknown>).rollout_percentage;
                    if (typeof rp === 'number') {
                        return rp;
                    }
                }
            }
        }

        return null;
    }

    private extractVariantCount(flag: FeatureFlag): number {
        const filters = flag.filters as Record<string, unknown> | undefined;
        if (filters?.multivariate && typeof filters.multivariate === 'object') {
            const mv = filters.multivariate as { variants?: unknown[] };
            if (mv.variants && mv.variants.length > 0) {
                return mv.variants.length;
            }
        }
        return 0;
    }

    private extractConditionCount(flag: FeatureFlag): number {
        const filters = flag.filters as Record<string, unknown> | undefined;
        if (!filters?.groups || !Array.isArray(filters.groups)) {
            return 0;
        }
        return (filters.groups as Array<Record<string, unknown>>).filter(g =>
            g.properties && Array.isArray(g.properties) && (g.properties as unknown[]).length > 0,
        ).length;
    }
}
