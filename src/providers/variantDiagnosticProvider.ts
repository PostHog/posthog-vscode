import * as vscode from 'vscode';
import { FlagCacheService } from '../services/flagCacheService';
import { TreeSitterService } from '../services/treeSitterService';

/**
 * Produces diagnostics for variant comparisons:
 * - Warning when comparing a flag variable against a value not in the flag's variants
 * - Info when not all variant values are covered in an if/else chain
 */
export class VariantDiagnosticProvider {
    private readonly diagnostics: vscode.DiagnosticCollection;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private readonly flagCache: FlagCacheService,
        private readonly treeSitter: TreeSitterService,
    ) {
        this.diagnostics = vscode.languages.createDiagnosticCollection('posthog-variants');
    }

    register(): vscode.Disposable[] {
        const disposables: vscode.Disposable[] = [this.diagnostics];
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

    private triggerUpdate(): void {
        if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
        this.debounceTimer = setTimeout(() => this.update(), 300);
    }

    private async update(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const doc = editor.document;
        if (!this.treeSitter.isSupported(doc.languageId)) {
            this.diagnostics.set(doc.uri, []);
            return;
        }

        const branches = await this.treeSitter.findVariantBranches(doc);
        if (branches.length === 0) {
            this.diagnostics.set(doc.uri, []);
            return;
        }

        const diags: vscode.Diagnostic[] = [];

        // Group branches by flagKey
        const byFlag = new Map<string, typeof branches>();
        for (const b of branches) {
            const list = byFlag.get(b.flagKey) || [];
            list.push(b);
            byFlag.set(b.flagKey, list);
        }

        for (const [flagKey, flagBranches] of byFlag) {
            const flag = this.flagCache.getFlag(flagKey);
            if (!flag) { continue; }

            const variants = this.getVariantKeys(flag);
            if (variants.length === 0) { continue; } // boolean flag, no variant diagnostics

            // Check each branch for invalid variant values
            const checkedVariants = new Set<string>();
            for (const branch of flagBranches) {
                if (branch.variantKey === 'else' || branch.variantKey === 'default') { continue; }
                if (branch.variantKey === 'true' || branch.variantKey === 'false') { continue; }

                checkedVariants.add(branch.variantKey);

                if (!variants.includes(branch.variantKey)) {
                    const line = doc.lineAt(branch.conditionLine);
                    const col = line.text.indexOf(branch.variantKey);
                    if (col >= 0) {
                        const range = new vscode.Range(
                            branch.conditionLine, col,
                            branch.conditionLine, col + branch.variantKey.length,
                        );
                        const validList = variants.map(v => `'${v}'`).join(', ');
                        diags.push(new vscode.Diagnostic(
                            range,
                            `'${branch.variantKey}' is not a variant of '${flagKey}'. Valid variants: ${validList}`,
                            vscode.DiagnosticSeverity.Warning,
                        ));
                    }
                }
            }

            // An else/default block implicitly covers remaining variants
            const hasElse = flagBranches.some(b => b.variantKey === 'else' || b.variantKey === 'default');

            // Check coverage: are all variants covered?
            const uncovered = variants.filter(v => !checkedVariants.has(v));
            if (uncovered.length > 0 && checkedVariants.size > 0 && !hasElse) {
                // Show on the first branch's condition line
                const firstBranch = flagBranches[0];
                const line = doc.lineAt(firstBranch.conditionLine);
                const range = new vscode.Range(firstBranch.conditionLine, 0, firstBranch.conditionLine, line.text.length);
                const missing = uncovered.map(v => `'${v}'`).join(', ');
                diags.push(new vscode.Diagnostic(
                    range,
                    `Not all variants of '${flagKey}' are covered. Missing: ${missing}`,
                    vscode.DiagnosticSeverity.Information,
                ));
            }
        }

        this.diagnostics.set(doc.uri, diags);
    }

    private getVariantKeys(flag: { filters: Record<string, unknown> }): string[] {
        const filters = flag.filters;
        if (filters?.multivariate && typeof filters.multivariate === 'object') {
            const mv = filters.multivariate as { variants?: { key: string }[] };
            if (mv.variants?.length) {
                return mv.variants.map(v => v.key);
            }
        }
        return [];
    }
}
