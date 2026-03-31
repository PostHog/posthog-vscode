import * as vscode from 'vscode';
import { FlagCacheService } from '../services/flagCacheService';
import { TreeSitterService } from '../services/treeSitterService';
import { TelemetryService } from '../services/telemetryService';

export class FlagCompletionProvider implements vscode.CompletionItemProvider {
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
        if (!ctx || ctx.type !== 'flag_key') { return undefined; }

        const flags = this.flagCache.getFlags().filter(f => !f.deleted);
        const items = flags.map(flag => {
            const item = new vscode.CompletionItem(flag.key, vscode.CompletionItemKind.Value);
            item.detail = flag.active ? 'Active' : 'Inactive';
            item.documentation = new vscode.MarkdownString(
                `**${flag.key}**\n\n` +
                (flag.name ? `${flag.name}\n\n` : '') +
                `Status: ${flag.active ? 'Active' : 'Inactive'}\n\n` +
                `Rollout: ${flag.rollout_percentage !== null ? `${flag.rollout_percentage}%` : 'N/A'}`
            );
            item.sortText = flag.active ? `0-${flag.key}` : `1-${flag.key}`;
            return item;
        });

        if (items.length > 0) {
            this.telemetry.capture('completion_provided', { type: 'flag_key', count: items.length, language: document.languageId });
        }

        return items;
    }
}
