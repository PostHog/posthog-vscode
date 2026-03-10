import * as vscode from 'vscode';
import { FlagCacheService } from '../services/flagCacheService';
import { ExperimentCacheService } from '../services/experimentCacheService';
import { FeatureFlag, Experiment } from '../models/types';
import { TreeSitterService } from '../services/treeSitterService';

const PALETTE = [
    { bg: 'rgba(29, 74, 255, 0.07)', border: '#1D4AFF', text: '#6B9BFF' },
    { bg: 'rgba(76, 187, 23, 0.07)', border: '#4CBB17', text: '#7DE852' },
    { bg: 'rgba(168, 85, 247, 0.07)', border: '#A855F7', text: '#C490FA' },
    { bg: 'rgba(249, 115, 22, 0.07)', border: '#F97316', text: '#FBA85B' },
    { bg: 'rgba(236, 72, 153, 0.07)', border: '#EC4899', text: '#F28ABF' },
    { bg: 'rgba(249, 189, 43, 0.07)', border: '#F9BD2B', text: '#FCD462' },
];

export class VariantHighlightProvider {
    private readonly blockDecorations: vscode.TextEditorDecorationType[];
    private readonly labelDecoration: vscode.TextEditorDecorationType;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private readonly flagCache: FlagCacheService,
        private readonly experimentCache: ExperimentCacheService,
        private readonly treeSitter: TreeSitterService,
    ) {
        this.blockDecorations = PALETTE.map(c => vscode.window.createTextEditorDecorationType({
            backgroundColor: c.bg,
            borderWidth: '0 0 0 3px',
            borderStyle: 'solid',
            borderColor: c.border,
            isWholeLine: true,
            overviewRulerColor: c.border,
            overviewRulerLane: vscode.OverviewRulerLane.Left,
        }));
        this.labelDecoration = vscode.window.createTextEditorDecorationType({});
    }

    register(): vscode.Disposable[] {
        const disposables: vscode.Disposable[] = [...this.blockDecorations, this.labelDecoration];

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
        if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
        this.debounceTimer = setTimeout(() => this.update(), 300);
    }

    private async update() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const doc = editor.document;
        if (!this.treeSitter.isSupported(doc.languageId)) {
            for (const dt of this.blockDecorations) { editor.setDecorations(dt, []); }
            editor.setDecorations(this.labelDecoration, []);
            return;
        }

        const branches = await this.treeSitter.findVariantBranches(doc);
        this.apply(editor, doc, branches);
    }

    private apply(
        editor: vscode.TextEditor,
        doc: vscode.TextDocument,
        blocks: { flagKey: string; variantKey: string; conditionLine: number; startLine: number; endLine: number }[],
    ) {
        const byColor: Map<number, vscode.DecorationOptions[]> = new Map();
        const labels: vscode.DecorationOptions[] = [];

        for (const block of blocks) {
            const flag = this.flagCache.getFlag(block.flagKey);
            const experiment = this.experimentCache.getByFlagKey(block.flagKey);

            const allVariants = this.getAllVariantKeys(block.flagKey);

            // Infer variant for 'else'/'default' blocks if only one variant remains
            let resolvedVariantKey = block.variantKey;
            if (resolvedVariantKey === 'else' || resolvedVariantKey === 'default') {
                const seen = blocks
                    .filter(b => b.flagKey === block.flagKey && b.variantKey !== 'else' && b.variantKey !== 'default')
                    .map(b => b.variantKey);
                const remaining = allVariants.filter(v => !seen.includes(v));
                if (remaining.length === 1) {
                    resolvedVariantKey = remaining[0];
                }
            }

            let ci = allVariants.indexOf(resolvedVariantKey);
            if (ci < 0) { ci = allVariants.length; }
            ci = ci % PALETTE.length;

            if (!byColor.has(ci)) { byColor.set(ci, []); }
            for (let line = block.startLine; line <= block.endLine; line++) {
                byColor.get(ci)!.push({ range: new vscode.Range(line, 0, line, 0) });
            }

            const label = this.buildLabel(block.flagKey, resolvedVariantKey, flag, experiment);
            const condLine = doc.lineAt(block.conditionLine);
            labels.push({
                range: new vscode.Range(block.conditionLine, condLine.text.length, block.conditionLine, condLine.text.length),
                renderOptions: {
                    after: {
                        contentText: `  ${label}`,
                        color: PALETTE[ci].text,
                        fontStyle: 'italic',
                    },
                },
            });
        }

        for (let i = 0; i < this.blockDecorations.length; i++) {
            editor.setDecorations(this.blockDecorations[i], byColor.get(i) || []);
        }
        editor.setDecorations(this.labelDecoration, labels);
    }

    private buildLabel(flagKey: string, variantKey: string, flag: FeatureFlag | undefined, experiment: Experiment | undefined): string {
        const parts: string[] = [variantKey];

        if (flag) {
            const rollout = this.getVariantRollout(flag, variantKey);
            if (rollout !== null) { parts.push(`${rollout}%`); }
        }

        if (experiment) {
            const results = this.experimentCache.getResults(experiment.id);
            if (results?.primary?.results?.[0]?.data?.variant_results) {
                const vr = results.primary.results[0].data.variant_results.find(v => v.key === variantKey);
                if (vr) {
                    const pct = Math.round(vr.chance_to_win * 100);
                    parts.push(`${pct}% win`);
                    if (vr.significant) { parts.push('★'); }
                }
                if (variantKey === results.primary.results[0].data.baseline.key) {
                    const n = results.primary.results[0].data.baseline.number_of_samples;
                    parts.push(`n=${this.fmtNum(n)}`);
                }
            }
        }

        return parts.join(' · ');
    }

    private getAllVariantKeys(flagKey: string): string[] {
        const flag = this.flagCache.getFlag(flagKey);
        if (!flag) { return []; }

        const filters = flag.filters as Record<string, unknown> | undefined;
        if (filters?.multivariate && typeof filters.multivariate === 'object') {
            const mv = filters.multivariate as { variants?: { key: string }[] };
            if (mv.variants?.length) { return mv.variants.map(v => v.key); }
        }
        return ['true', 'false'];
    }

    private getVariantRollout(flag: FeatureFlag, variantKey: string): number | null {
        const filters = flag.filters as Record<string, unknown> | undefined;

        if (filters?.multivariate && typeof filters.multivariate === 'object') {
            const mv = filters.multivariate as { variants?: { key: string; rollout_percentage: number }[] };
            const v = mv.variants?.find(x => x.key === variantKey);
            if (v) { return v.rollout_percentage; }
        }

        if (variantKey === 'true' || variantKey === 'false') {
            const rollout = this.extractRollout(flag);
            if (rollout !== null) { return variantKey === 'true' ? rollout : 100 - rollout; }
        }

        return null;
    }

    private extractRollout(flag: FeatureFlag): number | null {
        if (flag.rollout_percentage != null) { return flag.rollout_percentage; }
        const filters = flag.filters as Record<string, unknown> | undefined;
        if (filters?.groups && Array.isArray(filters.groups)) {
            for (const g of filters.groups) {
                const rp = (g as Record<string, unknown>)?.rollout_percentage;
                if (typeof rp === 'number') { return rp; }
            }
        }
        return null;
    }

    private fmtNum(n: number): string {
        if (n >= 1e6) { return `${(n / 1e6).toFixed(1)}M`; }
        if (n >= 1e3) { return `${(n / 1e3).toFixed(1)}K`; }
        return String(n);
    }
}
