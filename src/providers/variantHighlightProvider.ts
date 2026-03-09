import * as vscode from 'vscode';
import { FlagCacheService } from '../services/flagCacheService';
import { ExperimentCacheService } from '../services/experimentCacheService';
import { FeatureFlag, Experiment } from '../models/types';

const PALETTE = [
    { bg: 'rgba(29, 74, 255, 0.07)', border: '#1D4AFF', text: '#6B9BFF' },
    { bg: 'rgba(76, 187, 23, 0.07)', border: '#4CBB17', text: '#7DE852' },
    { bg: 'rgba(168, 85, 247, 0.07)', border: '#A855F7', text: '#C490FA' },
    { bg: 'rgba(249, 115, 22, 0.07)', border: '#F97316', text: '#FBA85B' },
    { bg: 'rgba(236, 72, 153, 0.07)', border: '#EC4899', text: '#F28ABF' },
    { bg: 'rgba(249, 189, 43, 0.07)', border: '#F9BD2B', text: '#FCD462' },
];

interface VariantBlock {
    flagKey: string;
    variantKey: string;
    conditionLine: number;
    startLine: number;
    endLine: number;
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class VariantHighlightProvider {
    private readonly blockDecorations: vscode.TextEditorDecorationType[];
    private readonly labelDecoration: vscode.TextEditorDecorationType;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private readonly flagCache: FlagCacheService,
        private readonly experimentCache: ExperimentCacheService,
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

    private update() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const doc = editor.document;
        if (!['javascript', 'typescript', 'javascriptreact', 'typescriptreact'].includes(doc.languageId)) {
            for (const dt of this.blockDecorations) { editor.setDecorations(dt, []); }
            editor.setDecorations(this.labelDecoration, []);
            return;
        }

        const blocks = this.detect(doc);
        this.apply(editor, doc, blocks);
    }

    // ── Detection ──

    private detect(doc: vscode.TextDocument): VariantBlock[] {
        const blocks: VariantBlock[] = [];
        const lines: string[] = [];
        for (let i = 0; i < doc.lineCount; i++) { lines.push(doc.lineAt(i).text); }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // const x = posthog.getFeatureFlag('key')
            const assign = /(?:const|let|var)\s+(\w+)\s*=\s*(?:posthog|client|ph)\.getFeatureFlag\s*\(\s*(['"`])([^'"`]+)\2/.exec(line);
            if (assign) {
                blocks.push(...this.findVarIfChain(lines, i + 1, assign[1], assign[3]));
                blocks.push(...this.findVarSwitch(lines, i + 1, assign[1], assign[3]));
            }

            // if (posthog.getFeatureFlag('key') === 'variant')
            const inline = /if\s*\(\s*(?:posthog|client|ph)\.getFeatureFlag\s*\(\s*(['"`])([^'"`]+)\1\s*\)\s*===?\s*(['"`])([^'"`]+)\3/.exec(line);
            if (inline) {
                const flagKey = inline[2];
                const end = this.findBlockEnd(lines, i);
                blocks.push({ flagKey, variantKey: inline[4], conditionLine: i, startLine: i, endLine: end });
                blocks.push(...this.findElseChain(lines, end, flagKey, null, [inline[4]]));
            }

            // if (posthog.isFeatureEnabled('key'))
            const enabled = /if\s*\(\s*(?:posthog|client|ph)\.isFeatureEnabled\s*\(\s*(['"`])([^'"`]+)\1\s*\)\s*\)/.exec(line);
            if (enabled) {
                const flagKey = enabled[2];
                const end = this.findBlockEnd(lines, i);
                blocks.push({ flagKey, variantKey: 'true', conditionLine: i, startLine: i, endLine: end });
                const elseBlocks = this.findElseChain(lines, end, flagKey, null, ['true']);
                for (const b of elseBlocks) { if (b.variantKey === 'else') { b.variantKey = 'false'; } }
                blocks.push(...elseBlocks);
            }
        }

        return blocks;
    }

    private findVarIfChain(lines: string[], from: number, varName: string, flagKey: string): VariantBlock[] {
        const blocks: VariantBlock[] = [];
        const re = new RegExp(`(?:if|else\\s+if)\\s*\\(\\s*${escapeRegex(varName)}\\s*===?\\s*(['"\`])([^'"\`]+)\\1\\s*\\)`);

        for (let i = from; i < Math.min(from + 30, lines.length); i++) {
            const m = re.exec(lines[i]);
            if (m) {
                const end = this.findBlockEnd(lines, i);
                const seen = [m[2]];
                blocks.push({ flagKey, variantKey: m[2], conditionLine: i, startLine: i, endLine: end });
                const more = this.findElseChain(lines, end, flagKey, varName, seen);
                blocks.push(...more);
                const last = more.length > 0 ? more[more.length - 1] : blocks[blocks.length - 1];
                i = last.endLine;
            }
        }
        return blocks;
    }

    private findElseChain(lines: string[], afterEnd: number, flagKey: string, varName: string | null, seen: string[]): VariantBlock[] {
        const blocks: VariantBlock[] = [];

        for (let check = afterEnd; check <= Math.min(afterEnd + 1, lines.length - 1); check++) {
            const text = lines[check];

            // else if (varName === 'value')
            if (varName) {
                const re = new RegExp(`else\\s+if\\s*\\(\\s*${escapeRegex(varName)}\\s*===?\\s*(['"\`])([^'"\`]+)\\1\\s*\\)`);
                const m = re.exec(text);
                if (m) {
                    const end = this.findBlockEnd(lines, check);
                    seen.push(m[2]);
                    blocks.push({ flagKey, variantKey: m[2], conditionLine: check, startLine: check, endLine: end });
                    blocks.push(...this.findElseChain(lines, end, flagKey, varName, seen));
                    return blocks;
                }
            }

            // plain else
            if (/\belse\s*\{/.test(text)) {
                const end = this.findBlockEnd(lines, check);
                // Infer variant if only one remains
                const all = this.getAllVariantKeys(flagKey);
                const remaining = all.filter(v => !seen.includes(v));
                const key = remaining.length === 1 ? remaining[0] : 'else';
                blocks.push({ flagKey, variantKey: key, conditionLine: check, startLine: check, endLine: end });
                return blocks;
            }
        }

        return blocks;
    }

    private findVarSwitch(lines: string[], from: number, varName: string, flagKey: string): VariantBlock[] {
        const blocks: VariantBlock[] = [];
        const re = new RegExp(`switch\\s*\\(\\s*${escapeRegex(varName)}\\s*\\)`);

        for (let i = from; i < Math.min(from + 15, lines.length); i++) {
            if (!re.test(lines[i])) { continue; }

            const switchEnd = this.findBlockEnd(lines, i);
            let caseStart = -1;
            let caseVariant = '';

            for (let j = i + 1; j < switchEnd; j++) {
                const cm = /case\s+(['"`])([^'"`]+)\1\s*:/.exec(lines[j]);
                const dm = /default\s*:/.test(lines[j]);

                if (cm || dm) {
                    if (caseStart >= 0) {
                        blocks.push({ flagKey, variantKey: caseVariant, conditionLine: caseStart, startLine: caseStart, endLine: j - 1 });
                    }
                    caseStart = j;
                    caseVariant = cm ? cm[2] : 'default';
                }
            }
            if (caseStart >= 0) {
                blocks.push({ flagKey, variantKey: caseVariant, conditionLine: caseStart, startLine: caseStart, endLine: switchEnd - 1 });
            }
            break;
        }
        return blocks;
    }

    private findBlockEnd(lines: string[], startLine: number): number {
        let depth = 0;
        let opened = false;
        for (let i = startLine; i < lines.length; i++) {
            for (const ch of lines[i]) {
                if (ch === '{') { depth++; opened = true; }
                else if (ch === '}' && opened) {
                    depth--;
                    if (depth === 0) { return i; }
                }
            }
        }
        return startLine;
    }

    // ── Rendering ──

    private apply(editor: vscode.TextEditor, doc: vscode.TextDocument, blocks: VariantBlock[]) {
        const byColor: Map<number, vscode.DecorationOptions[]> = new Map();
        const labels: vscode.DecorationOptions[] = [];

        for (const block of blocks) {
            const flag = this.flagCache.getFlag(block.flagKey);
            const experiment = this.experimentCache.getByFlagKey(block.flagKey);

            const allVariants = this.getAllVariantKeys(block.flagKey);
            let ci = allVariants.indexOf(block.variantKey);
            if (ci < 0) { ci = allVariants.length; }
            ci = ci % PALETTE.length;

            if (!byColor.has(ci)) { byColor.set(ci, []); }
            for (let line = block.startLine; line <= block.endLine; line++) {
                byColor.get(ci)!.push({ range: new vscode.Range(line, 0, line, 0) });
            }

            const label = this.buildLabel(block, flag, experiment);
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

    private buildLabel(block: VariantBlock, flag: FeatureFlag | undefined, experiment: Experiment | undefined): string {
        const parts: string[] = [block.variantKey];

        if (flag) {
            const rollout = this.getVariantRollout(flag, block.variantKey);
            if (rollout !== null) { parts.push(`${rollout}%`); }
        }

        if (experiment) {
            const results = this.experimentCache.getResults(experiment.id);
            if (results?.primary?.results?.[0]?.data?.variant_results) {
                const vr = results.primary.results[0].data.variant_results.find(v => v.key === block.variantKey);
                if (vr) {
                    const pct = Math.round(vr.chance_to_win * 100);
                    parts.push(`${pct}% win`);
                    if (vr.significant) { parts.push('★'); }
                }
                // For control/baseline, show sample count
                if (block.variantKey === results.primary.results[0].data.baseline.key) {
                    const n = results.primary.results[0].data.baseline.number_of_samples;
                    parts.push(`n=${this.fmtNum(n)}`);
                }
            }
        }

        return parts.join(' · ');
    }

    // ── Helpers ──

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
