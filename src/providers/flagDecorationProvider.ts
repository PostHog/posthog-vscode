import * as vscode from 'vscode';
import { FlagCacheService } from '../services/flagCacheService';
import { ExperimentCacheService } from '../services/experimentCacheService';
import { FeatureFlag, Experiment, ExperimentResults, ExperimentVariantResult } from '../models/types';
import { TreeSitterService } from '../services/treeSitterService';
import { Commands } from '../constants';

const FLAG_METHODS = new Set([
    'getFeatureFlag', 'isFeatureEnabled', 'getFeatureFlagPayload',
    'getFeatureFlagResult', 'isFeatureFlagEnabled', 'getRemoteConfig',
    'get_feature_flag', 'is_feature_enabled', 'get_feature_flag_payload', 'get_remote_config',
    'GetFeatureFlag', 'IsFeatureEnabled', 'GetFeatureFlagPayload',
    // React hooks (bare function calls detected by tree-sitter)
    'useFeatureFlag', 'useFeatureFlagPayload', 'useFeatureFlagVariantKey', 'useActiveFeatureFlags',
]);

interface Variant {
    key: string;
    name?: string;
    rollout_percentage: number;
}

export class FlagDecorationProvider {
    private readonly decoration: vscode.TextEditorDecorationType;
    private readonly unknownFlagDecoration: vscode.TextEditorDecorationType;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;
    private cachedDecorations: vscode.DecorationOptions[] = [];
    private cachedUnknownDecorations: vscode.DecorationOptions[] = [];
    private lastCursorLine: number = -1;

    constructor(
        private readonly flagCache: FlagCacheService,
        private readonly experimentCache: ExperimentCacheService,
        private readonly treeSitter: TreeSitterService,
    ) {
        this.decoration = vscode.window.createTextEditorDecorationType({});
        this.unknownFlagDecoration = vscode.window.createTextEditorDecorationType({
            textDecoration: 'underline wavy #F9BD2B',
            backgroundColor: 'rgba(249, 189, 43, 0.08)',
        });
    }

    register(): vscode.Disposable[] {
        const disposables: vscode.Disposable[] = [this.decoration, this.unknownFlagDecoration];

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

        this.flagCache.onChange(() => this.triggerUpdate());
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
        const filteredUnknown = this.cachedUnknownDecorations.filter(d =>
            d.range.start.line === cursorLine
        );

        editor.setDecorations(this.decoration, filteredDecorations);
        editor.setDecorations(this.unknownFlagDecoration, filteredUnknown);
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
            editor.setDecorations(this.unknownFlagDecoration, []);
            this.cachedDecorations = [];
            this.cachedUnknownDecorations = [];
            return;
        }

        const doc = editor.document;
        if (!this.treeSitter.isSupported(doc.languageId)) { return; }

        const calls = await this.treeSitter.findPostHogCalls(doc);
        const decorations: vscode.DecorationOptions[] = [];
        const unknownDecorations: vscode.DecorationOptions[] = [];

        const additionalFns = new Set(vscode.workspace.getConfiguration('posthog').get<string[]>('additionalFlagFunctions', []));

        for (const call of calls) {
            if (!FLAG_METHODS.has(call.method) && !additionalFns.has(call.method)) { continue; }

            const flagKey = call.key;
            const flag = this.flagCache.getFlag(flagKey);
            const experiment = this.experimentCache.getByFlagKey(flagKey);
            const { text, color } = this.buildLabel(flag, experiment);
            const hover = this.buildHover(flagKey, flag, experiment);

            const line = doc.lineAt(call.line);
            decorations.push({
                range: new vscode.Range(call.line, line.text.length, call.line, line.text.length),
                hoverMessage: hover,
                renderOptions: {
                    after: {
                        contentText: text,
                        color,
                        fontStyle: 'italic',
                        margin: '0 0 0 1.5em',
                    },
                },
            });

            if (!flag) {
                unknownDecorations.push({
                    range: new vscode.Range(call.line, call.keyStartCol, call.line, call.keyEndCol),
                    hoverMessage: hover,
                });
            }
        }

        // Cache decorations for currentLine mode
        this.cachedDecorations = decorations;
        this.cachedUnknownDecorations = unknownDecorations;

        // Apply decorations based on mode
        const mode = config.get<string>('inlineHintsMode', 'always');
        if (mode === 'currentLine') {
            this.lastCursorLine = -1; // Force refresh
            this.onCursorMove(editor);
        } else {
            editor.setDecorations(this.decoration, decorations);
            editor.setDecorations(this.unknownFlagDecoration, unknownDecorations);
        }
    }

    // ── Inline label ──

    private buildLabel(flag: FeatureFlag | undefined, experiment?: Experiment): { text: string; color: string } {
        if (!flag) {
            return { text: '⚠ not in PostHog', color: '#F9BD2B' };
        }

        if (!flag.active) {
            return { text: '○ inactive', color: new vscode.ThemeColor('editorGhostText.foreground') as unknown as string };
        }

        if (experiment) {
            const results = this.experimentCache.getResults(experiment.id);
            if (results?.primary?.results?.[0]?.data?.variant_results?.length) {
                const variants = results.primary.results[0].data.variant_results;
                const leader = variants.reduce((best, v) => v.chance_to_win > best.chance_to_win ? v : best);
                const winPct = Math.round(leader.chance_to_win * 100);

                if (experiment.end_date) {
                    if (experiment.conclusion === 'won') {
                        return { text: `⚗ won · ${leader.key} ${winPct}%`, color: '#4CBB17' };
                    }
                    return { text: `⚗ complete · ${leader.key} ${winPct}%`, color: '#1D4AFF' };
                } else if (experiment.start_date) {
                    return { text: `⚗ ${leader.key} leading ${winPct}%`, color: '#1D4AFF' };
                }
            }

            let expStatus: string;
            if (experiment.end_date) { expStatus = 'complete'; }
            else if (experiment.start_date) { expStatus = 'running'; }
            else { expStatus = 'draft'; }
            return { text: `⚗ experiment ${expStatus}`, color: '#1D4AFF' };
        }

        const rollout = this.extractRollout(flag);
        const variants = this.extractVariants(flag);
        const conditions = this.extractConditionCount(flag);

        const parts: string[] = ['●'];

        if (variants.length > 0) {
            parts.push(`${variants.length} variants`);
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

    // ── Hover tooltip ──

    private buildHover(flagKey: string, flag: FeatureFlag | undefined, experiment?: Experiment): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;

        if (!flag) {
            const args = encodeURIComponent(JSON.stringify([flagKey]));
            md.appendMarkdown(`#### ⚠️ \`${flagKey}\`\n\n`);
            md.appendMarkdown('This feature flag does not exist in PostHog.\n\n');
            md.appendMarkdown(`[➕ Create Flag](command:${Commands.CREATE_FLAG}?${args} "Create this flag in PostHog")\n`);
            return md;
        }

        const statusIcon = flag.active ? '🟢' : '⚪';
        const statusText = flag.active ? 'Active' : 'Inactive';
        md.appendMarkdown(`#### ${statusIcon} \`${flagKey}\` · ${statusText}\n\n`);

        if (experiment) {
            this.appendExperimentSection(md, experiment);
        }

        if (!experiment) {
            const variants = this.extractVariants(flag);
            if (variants.length > 0) {
                md.appendMarkdown('---\n\n');
                md.appendCodeblock(this.buildVariantChart(variants), 'text');
            } else {
                const rollout = this.extractRollout(flag);
                if (rollout !== null) {
                    md.appendMarkdown('---\n\n');
                    md.appendCodeblock(this.buildBooleanChart(rollout), 'text');
                }
            }
        }

        const conditions = this.extractConditionCount(flag);
        if (conditions > 0) {
            md.appendMarkdown(`\n🎯 ${conditions} release ${conditions === 1 ? 'condition' : 'conditions'}\n`);
        }

        if (flag.created_by) {
            const who = flag.created_by.first_name || flag.created_by.email;
            const when = flag.created_at ? new Date(flag.created_at).toLocaleDateString() : '';
            md.appendMarkdown(`\n👤 ${who}${when ? ` · ${when}` : ''}\n`);
        }

        return md;
    }

    // ── Experiment section ──

    private appendExperimentSection(md: vscode.MarkdownString, experiment: Experiment): void {
        let expIcon: string;
        let expStatus: string;
        if (experiment.end_date) { expIcon = '✅'; expStatus = 'Complete'; }
        else if (experiment.start_date) { expIcon = '🧪'; expStatus = 'Running'; }
        else { expIcon = '📝'; expStatus = 'Draft'; }

        md.appendMarkdown(`${expIcon} **${experiment.name}** · *${expStatus}*\n\n`);

        if (experiment.start_date) {
            const start = new Date(experiment.start_date);
            const end = experiment.end_date ? new Date(experiment.end_date) : new Date();
            const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
            md.appendMarkdown(`⏱ ${days} day${days !== 1 ? 's' : ''}${experiment.end_date ? '' : ' so far'}\n\n`);
        }

        // Sample size progress
        const recommendedSampleSize = experiment.parameters?.recommended_sample_size;
        if (experiment.start_date && recommendedSampleSize && recommendedSampleSize > 0) {
            const results = this.experimentCache.getResults(experiment.id);
            if (results?.primary?.results?.[0]?.data) {
                const data = results.primary.results[0].data;
                let totalSamples = data.baseline.number_of_samples;
                for (const v of (data.variant_results || [])) {
                    totalSamples += v.number_of_samples;
                }
                const pct = Math.min(Math.round((totalSamples / recommendedSampleSize) * 100), 100);
                md.appendMarkdown(`**Progress**: ${this.formatNum(totalSamples)} / ${this.formatNum(recommendedSampleSize)} samples (${pct}%)\n\n`);
            }
        }

        if (experiment.conclusion) {
            const cIcon = experiment.conclusion === 'won' ? '🏆' : '❌';
            const cText = experiment.conclusion === 'won' ? 'Winner declared' : 'No winner';
            md.appendMarkdown(`${cIcon} **${cText}**\n\n`);
            if (experiment.conclusion_comment) {
                md.appendMarkdown(`> ${experiment.conclusion_comment.split('\n')[0]}\n\n`);
            }
        }

        const results = this.experimentCache.getResults(experiment.id);
        if (results) {
            this.appendResultsSection(md, experiment, results);
        } else {
            const variants = experiment.parameters?.feature_flag_variants;
            if (variants && variants.length > 0) {
                md.appendMarkdown('---\n\n');
                md.appendMarkdown('**Variant allocation**\n\n');
                md.appendCodeblock(this.buildVariantChart(variants), 'text');
            }

            if (experiment.metrics && experiment.metrics.length > 0) {
                md.appendMarkdown('\n📊 **Metrics**\n\n');
                for (const m of experiment.metrics) {
                    const typeIcon = this.metricTypeIcon(m.metric_type);
                    const goal = m.goal === 'increase' ? '↑' : '↓';
                    md.appendMarkdown(`${typeIcon} ${m.name || 'Unnamed'} ${goal}\n\n`);
                }
            }
        }
    }

    private appendResultsSection(md: vscode.MarkdownString, experiment: Experiment, results: ExperimentResults): void {
        const allMetrics = [
            ...(experiment.metrics || []).map((m, i) => ({ metric: m, result: results.primary.results[i], primary: true })),
            ...(experiment.metrics_secondary || []).map((m, i) => ({ metric: m, result: results.secondary.results[i], primary: false })),
        ];

        for (const { metric, result, primary } of allMetrics) {
            if (!result?.data?.variant_results) { continue; }

            md.appendMarkdown('---\n\n');

            const typeIcon = this.metricTypeIcon(metric.metric_type);
            const label = primary ? '' : ' *(secondary)*';
            md.appendMarkdown(`${typeIcon} **${metric.name || 'Unnamed'}**${label}\n\n`);

            md.appendCodeblock(this.buildResultsChart(result.data.baseline, result.data.variant_results), 'text');
        }
    }

    private buildResultsChart(
        baseline: { key: string; number_of_samples: number },
        variantResults: ExperimentVariantResult[],
    ): string {
        const BAR_WIDTH = 16;
        const all = [baseline, ...variantResults];
        const maxKeyLen = Math.max(...all.map(v => v.key.length));

        const winner = variantResults.length > 0
            ? variantResults.reduce((best, v) => v.chance_to_win > best.chance_to_win ? v : best)
            : null;

        const lines: string[] = [];

        lines.push(`  ${baseline.key.padEnd(maxKeyLen)}  n=${this.formatNum(baseline.number_of_samples)}`);

        for (let i = 0; i < variantResults.length; i++) {
            const v = variantResults[i];
            const isLast = i === variantResults.length - 1;
            const connector = isLast ? '└' : '├';
            const winPct = Math.round(v.chance_to_win * 100);
            const bar = this.buildBar(winPct, BAR_WIDTH);
            const badge = v.significant ? (v === winner ? ' ★' : '') : '';

            const ci = v.credible_interval
                ? `[${this.formatPct(v.credible_interval[0])}, ${this.formatPct(v.credible_interval[1])}]`
                : '';

            lines.push(`  ${connector}─ ${v.key.padEnd(maxKeyLen)}  ${bar}  ${String(winPct).padStart(3)}% win${badge}`);
            if (ci) {
                const pad = isLast ? ' ' : '│';
                lines.push(`  ${pad}  ${''.padEnd(maxKeyLen)}  CI: ${ci}`);
            }
        }

        return lines.join('\n');
    }

    private metricTypeIcon(type: string): string {
        switch (type) {
            case 'funnel': return '🔻';
            case 'mean': return '📈';
            case 'ratio': return '⚖️';
            case 'retention': return '🔄';
            default: return '📊';
        }
    }

    private formatNum(n: number): string {
        if (n >= 1_000_000) { return `${(n / 1_000_000).toFixed(1)}M`; }
        if (n >= 1_000) { return `${(n / 1_000).toFixed(1)}K`; }
        return String(n);
    }

    private formatPct(n: number): string {
        return `${(n * 100).toFixed(1)}%`;
    }

    private buildBar(pct: number, width: number): string {
        const filled = Math.round((pct / 100) * width);
        return '█'.repeat(filled) + '░'.repeat(width - filled);
    }

    private buildVariantChart(variants: Variant[]): string {
        const BAR_WIDTH = 20;
        const maxKeyLen = Math.max(...variants.map(v => v.key.length));
        const lines: string[] = [];

        for (let i = 0; i < variants.length; i++) {
            const v = variants[i];
            const isLast = i === variants.length - 1;
            const connector = isLast ? '└' : '├';
            const bar = this.buildBar(v.rollout_percentage, BAR_WIDTH);
            const pct = `${v.rollout_percentage}%`.padStart(4);
            const label = v.key.padEnd(maxKeyLen);

            lines.push(`  ${connector}─ ${label}  ${bar}  ${pct}`);
        }

        return lines.join('\n');
    }

    private buildBooleanChart(rollout: number): string {
        const BAR_WIDTH = 20;
        const onBar = this.buildBar(rollout, BAR_WIDTH);
        const offBar = this.buildBar(100 - rollout, BAR_WIDTH);
        const onPct = `${rollout}%`.padStart(4);
        const offPct = `${100 - rollout}%`.padStart(4);

        return [
            `  ├─ true   ${onBar}  ${onPct}`,
            `  └─ false  ${offBar}  ${offPct}`,
        ].join('\n');
    }

    // ── Flag data extraction ──

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

    private extractVariants(flag: FeatureFlag): Variant[] {
        const filters = flag.filters as Record<string, unknown> | undefined;
        if (filters?.multivariate && typeof filters.multivariate === 'object') {
            const mv = filters.multivariate as { variants?: Variant[] };
            if (mv.variants && mv.variants.length > 0) {
                return mv.variants;
            }
        }
        return [];
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
