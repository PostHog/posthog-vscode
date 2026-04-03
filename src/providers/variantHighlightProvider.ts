import * as vscode from 'vscode';
import { FlagCacheService } from '../services/flagCacheService';
import { ExperimentCacheService } from '../services/experimentCacheService';
import { FeatureFlag, Experiment } from '../models/types';
import { TreeSitterService } from '../services/treeSitterService';
import { FlagType, classifyFlagType, extractVariants } from '../utils/flagClassification';
import { formatNumber } from '../utils/formatting';

const PALETTE = [
    { bg: 'rgba(29, 74, 255, 0.07)', border: '#1D4AFF', text: '#6B9BFF' },
    { bg: 'rgba(76, 187, 23, 0.07)', border: '#4CBB17', text: '#7DE852' },
    { bg: 'rgba(168, 85, 247, 0.07)', border: '#A855F7', text: '#C490FA' },
    { bg: 'rgba(249, 115, 22, 0.07)', border: '#F97316', text: '#FBA85B' },
    { bg: 'rgba(236, 72, 153, 0.07)', border: '#EC4899', text: '#F28ABF' },
    { bg: 'rgba(249, 189, 43, 0.07)', border: '#F9BD2B', text: '#FCD462' },
];

/** Green for boolean "enabled" branch */
const BOOLEAN_ENABLED = { bg: 'rgba(76, 187, 23, 0.07)', border: '#4CBB17', text: '#7DE852' };
/** Muted gray for boolean "disabled" branch */
const BOOLEAN_DISABLED = { bg: 'rgba(128, 128, 128, 0.05)', border: '#808080', text: '#999999' };
/** Neutral style for remote config truthiness checks */
const REMOTE_CONFIG_NEUTRAL = { bg: 'rgba(29, 74, 255, 0.04)', border: '#1D4AFF40', text: '#6B9BFF80' };

export class VariantHighlightProvider {
    private readonly blockDecorations: vscode.TextEditorDecorationType[];
    private readonly labelDecoration: vscode.TextEditorDecorationType;
    private dynamicDecorations: vscode.TextEditorDecorationType[] = [];
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
        const disposables: vscode.Disposable[] = [
            ...this.blockDecorations,
            this.labelDecoration,
            { dispose: () => { for (const dt of this.dynamicDecorations) { dt.dispose(); } } },
        ];

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

    refresh(): void {
        this.triggerUpdate();
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

        // TODO: findVariantBranches only detects `if_statement` / `switch_statement` AST nodes.
        // JSX short-circuit patterns like `{isEnabled && <Component />}` (binary_expression)
        // and ternary patterns like `variant === 'test' ? <NewFlow /> : <OldFlow />` (ternary_expression)
        // are NOT detected because they don't produce `if_statement` nodes in the AST.
        // Supporting these requires tree-sitter query changes in treeSitterService.findVariantBranches().
        const branches = await this.treeSitter.findVariantBranches(doc);
        this.apply(editor, doc, branches);
    }

    private classifyFlag(flagKey: string): FlagType {
        return classifyFlagType(this.flagCache.getFlag(flagKey));
    }

    private apply(
        editor: vscode.TextEditor,
        doc: vscode.TextDocument,
        blocks: { flagKey: string; variantKey: string; conditionLine: number; startLine: number; endLine: number }[],
    ) {
        const byColor: Map<number, vscode.DecorationOptions[]> = new Map();
        const labels: vscode.DecorationOptions[] = [];
        const labelledConditionLines = new Set<string>();

        for (const block of blocks) {
            const flag = this.flagCache.getFlag(block.flagKey);

            // Don't highlight branches for flags that don't exist in PostHog
            if (!flag) { continue; }

            const experiment = this.experimentCache.getByFlagKey(block.flagKey);
            const flagType = this.classifyFlag(block.flagKey);

            const allVariants = this.getAllVariantKeys(block.flagKey);

            // Infer variant for 'else'/'default' blocks
            let resolvedVariantKey = block.variantKey;
            if (resolvedVariantKey === 'else' || resolvedVariantKey === 'default') {
                if (flagType === 'boolean' || flagType === 'remote_config') {
                    resolvedVariantKey = 'false';
                } else {
                    // Multivariate: infer from remaining unchecked variants
                    const seen = blocks
                        .filter(b => b.flagKey === block.flagKey && b.variantKey !== 'else' && b.variantKey !== 'default')
                        .map(b => b.variantKey);
                    // If any sibling branch checks an invalid variant, don't highlight the else
                    const hasInvalidSibling = seen.some(v => !allVariants.includes(v));
                    if (hasInvalidSibling) { continue; }
                    const remaining = allVariants.filter(v => !seen.includes(v));
                    if (remaining.length === 1) {
                        resolvedVariantKey = remaining[0];
                    }
                }
            }

            // For multivariate flags, only highlight blocks that check actual variant values
            if (flagType === 'multivariate') {
                if (resolvedVariantKey === 'true' || resolvedVariantKey === 'false') {
                    // Truthiness check on a multivariate flag — not a proper variant comparison, skip
                    continue;
                }
                if (resolvedVariantKey !== 'else' && resolvedVariantKey !== 'default' && !allVariants.includes(resolvedVariantKey)) {
                    // Comparing against a value that's not a valid variant, skip
                    continue;
                }
            }

            // Select styling based on flag type
            let style: { bg: string; border: string; text: string };
            let ci: number;

            if (flagType === 'boolean') {
                // Boolean: green for enabled, muted gray for disabled
                const isEnabled = resolvedVariantKey === 'true';
                style = isEnabled ? BOOLEAN_ENABLED : BOOLEAN_DISABLED;
                // Use palette index -1 and -2 as sentinel for boolean styles
                // We'll use unique color indices beyond the palette range
                ci = isEnabled ? PALETTE.length : PALETTE.length + 1;
            } else if (flagType === 'remote_config') {
                // Remote config: if used in a truthiness check, show neutral highlight
                // For `if(config)` treat like boolean-lite
                const isTrue = resolvedVariantKey === 'true';
                style = isTrue ? REMOTE_CONFIG_NEUTRAL : BOOLEAN_DISABLED;
                ci = isTrue ? PALETTE.length + 2 : PALETTE.length + 1;
            } else {
                // Multivariate: colorful palette per variant
                ci = allVariants.indexOf(resolvedVariantKey);
                if (ci < 0) { ci = allVariants.length; }
                ci = ci % PALETTE.length;
                style = PALETTE[ci];
            }

            if (!byColor.has(ci)) { byColor.set(ci, []); }
            for (let line = block.startLine; line <= block.endLine; line++) {
                byColor.get(ci)!.push({ range: new vscode.Range(line, 0, line, 0) });
            }

            // Only one label per condition line per flag (avoid "disabled disabled disabled")
            const labelKey = `${block.flagKey}:${block.conditionLine}`;
            if (!labelledConditionLines.has(labelKey)) {
                labelledConditionLines.add(labelKey);
                const label = this.buildLabel(block.flagKey, resolvedVariantKey, flag, experiment, flagType);
                const condLine = doc.lineAt(block.conditionLine);
                labels.push({
                    range: new vscode.Range(block.conditionLine, condLine.text.length, block.conditionLine, condLine.text.length),
                    renderOptions: {
                        after: {
                            contentText: `  ${label}`,
                            color: style.text,
                            fontStyle: 'italic',
                        },
                    },
                });
            }
        }

        for (let i = 0; i < this.blockDecorations.length; i++) {
            editor.setDecorations(this.blockDecorations[i], byColor.get(i) || []);
        }

        // Apply boolean/remote_config styles using dynamic decoration types
        this.applyDynamicDecorations(editor, byColor);

        editor.setDecorations(this.labelDecoration, labels);
    }

    /** Apply decorations for indices beyond the PALETTE range using inline styles */
    private applyDynamicDecorations(
        editor: vscode.TextEditor,
        byColor: Map<number, vscode.DecorationOptions[]>,
    ): void {
        const dynamicStyles: Array<{ index: number; style: { bg: string; border: string } }> = [
            { index: PALETTE.length, style: BOOLEAN_ENABLED },
            { index: PALETTE.length + 1, style: BOOLEAN_DISABLED },
            { index: PALETTE.length + 2, style: REMOTE_CONFIG_NEUTRAL },
        ];

        // Dispose previous dynamic decorations
        for (const dt of this.dynamicDecorations) { dt.dispose(); }
        this.dynamicDecorations = [];

        for (const { index, style } of dynamicStyles) {
            const ranges = byColor.get(index);
            if (!ranges || ranges.length === 0) { continue; }

            const dt = vscode.window.createTextEditorDecorationType({
                backgroundColor: style.bg,
                borderWidth: '0 0 0 3px',
                borderStyle: 'solid',
                borderColor: style.border,
                isWholeLine: true,
                overviewRulerColor: style.border,
                overviewRulerLane: vscode.OverviewRulerLane.Left,
            });
            editor.setDecorations(dt, ranges);
            this.dynamicDecorations.push(dt);
        }
    }

    private buildLabel(
        flagKey: string,
        variantKey: string,
        flag: FeatureFlag | undefined,
        experiment: Experiment | undefined,
        flagType: FlagType,
    ): string {
        // Boolean flags: simple enabled/disabled labels
        if (flagType === 'boolean') {
            const isEnabled = variantKey === 'true';
            if (flag) {
                const rollout = this.getVariantRollout(flag, variantKey);
                if (isEnabled) {
                    return rollout !== null ? `enabled \u00b7 ${rollout}%` : 'enabled';
                } else {
                    return rollout !== null ? `disabled \u00b7 ${rollout}%` : 'disabled';
                }
            }
            return isEnabled ? 'enabled' : 'disabled';
        }

        // Remote config: lightweight labels
        if (flagType === 'remote_config') {
            if (variantKey === 'true') { return 'has config'; }
            if (variantKey === 'false') { return 'no config'; }
            return variantKey;
        }

        // Multivariate: per-variant labels with experiment results
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
                    if (vr.significant) { parts.push('\u2605'); }
                }
                if (variantKey === results.primary.results[0].data.baseline.key) {
                    const n = results.primary.results[0].data.baseline.number_of_samples;
                    parts.push(`n=${this.fmtNum(n)}`);
                }
            }
        }

        return parts.join(' \u00b7 ');
    }

    private getAllVariantKeys(flagKey: string): string[] {
        const flag = this.flagCache.getFlag(flagKey);
        if (!flag) { return []; }

        const variants = extractVariants(flag);
        if (variants.length > 0) { return variants.map(v => v.key); }
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
        return formatNumber(n);
    }
}
