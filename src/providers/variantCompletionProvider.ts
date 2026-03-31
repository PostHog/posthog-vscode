import * as vscode from 'vscode';
import { FlagCacheService } from '../services/flagCacheService';
import { TreeSitterService } from '../services/treeSitterService';
import { TelemetryService } from '../services/telemetryService';

const FLAG_METHODS = new Set(['getFeatureFlag', 'isFeatureEnabled', 'feature_enabled', 'get_feature_flag']);

export class VariantCompletionProvider implements vscode.CompletionItemProvider {
    constructor(
        private readonly flagCache: FlagCacheService,
        private readonly treeSitter: TreeSitterService,
        private readonly telemetry: TelemetryService,
    ) {}

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): Promise<vscode.CompletionItem[] | undefined> {
        if (!this.treeSitter.isSupported(document.languageId)) { return undefined; }

        const ctx = await this.treeSitter.getCompletionContext(document, position);
        // We need to be inside a string literal that is NOT a PostHog call argument
        // (those are handled by flagCompletionProvider / eventCompletionProvider).
        // If tree-sitter already classifies the context, skip.
        if (ctx) { return undefined; }

        // Scan surrounding lines for a getFeatureFlag / isFeatureEnabled call
        // Pattern: variable = posthog.getFeatureFlag('key') ... if (variable === '|')
        // or inline: if (posthog.getFeatureFlag('key') === '|')
        const flagKey = this.findNearbyFlagCall(document, position);
        if (!flagKey) { return undefined; }

        const flag = this.flagCache.getFlag(flagKey);
        if (!flag) { return undefined; }

        const variants = this.extractVariantKeys(flag);
        if (variants.length === 0) { return undefined; }

        const items = variants.map(variant => {
            const item = new vscode.CompletionItem(variant.key, vscode.CompletionItemKind.EnumMember);
            item.detail = `Variant (${variant.rollout}%)`;
            item.documentation = new vscode.MarkdownString(
                `**${variant.key}** — variant of \`${flagKey}\`\n\nRollout: ${variant.rollout}%`
            );
            item.sortText = `0-${variant.key}`;
            return item;
        });

        if (items.length > 0) {
            this.telemetry.capture('completion_provided', { type: 'variant_key', count: items.length, language: document.languageId });
        }

        return items;
    }

    /**
     * Look at surrounding lines for a getFeatureFlag('key') or isFeatureEnabled('key') call.
     * Returns the flag key if found, otherwise undefined.
     */
    private findNearbyFlagCall(document: vscode.TextDocument, position: vscode.Position): string | undefined {
        const lineText = document.lineAt(position.line).text;

        // First check if cursor is inside a string literal
        const before = lineText.substring(0, position.character);
        const quoteMatch = before.match(/['"`]([^'"`]*)$/);
        if (!quoteMatch) { return undefined; }

        // Check inline: posthog.getFeatureFlag('key') === '|cursor|'
        const inlinePattern = /(?:getFeatureFlag|isFeatureEnabled|feature_enabled|get_feature_flag)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/;
        const inlineMatch = lineText.match(inlinePattern);
        if (inlineMatch) { return inlineMatch[1]; }

        // Check variable assignment pattern: scan backwards for assignment
        const scanStart = Math.max(0, position.line - 15);
        const scanEnd = position.line;

        // Look for variable comparisons on current line: varName === '|'
        const comparisonMatch = lineText.match(/(\w+)\s*(?:===?|!==?)\s*['"`]/);
        if (comparisonMatch) {
            const varName = comparisonMatch[1];
            // Scan backwards for: const varName = posthog.getFeatureFlag('key')
            for (let i = scanEnd - 1; i >= scanStart; i--) {
                const text = document.lineAt(i).text;
                const assignPattern = new RegExp(
                    `(?:const|let|var|val)\\s+${this.escapeRegex(varName)}\\s*=.*?` +
                    `(?:getFeatureFlag|isFeatureEnabled|feature_enabled|get_feature_flag)\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`
                );
                const assignMatch = text.match(assignPattern);
                if (assignMatch) { return assignMatch[1]; }
            }
        }

        // Also check switch statement: switch (posthog.getFeatureFlag('key')) { case '|' }
        for (let i = scanEnd; i >= scanStart; i--) {
            const text = document.lineAt(i).text;
            const switchMatch = text.match(
                /switch\s*\(.*?(?:getFeatureFlag|isFeatureEnabled|feature_enabled|get_feature_flag)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/
            );
            if (switchMatch) { return switchMatch[1]; }
        }

        return undefined;
    }

    private extractVariantKeys(flag: { filters: Record<string, unknown> }): { key: string; rollout: number }[] {
        const filters = flag.filters;
        if (filters?.multivariate && typeof filters.multivariate === 'object') {
            const mv = filters.multivariate as { variants?: { key: string; rollout_percentage: number }[] };
            if (mv.variants?.length) {
                return mv.variants.map(v => ({ key: v.key, rollout: v.rollout_percentage }));
            }
        }
        return [];
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
