import * as vscode from 'vscode';
import { FlagCacheService } from '../services/flagCacheService';

const POSTHOG_FLAG_METHODS = [
    'getFeatureFlag',
    'isFeatureEnabled',
    'getFeatureFlagPayload',
    'getFeatureFlagResult',
    'isFeatureFlagEnabled',
    'getRemoteConfig',
];

const METHOD_PATTERN = new RegExp(
    `(?:posthog|client|ph)\\.(?:${POSTHOG_FLAG_METHODS.join('|')})\\s*\\(\\s*(['"\`])`,
);

export class FlagCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private readonly flagCache: FlagCacheService) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] | undefined {
        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        const match = METHOD_PATTERN.exec(textBeforeCursor);
        if (!match) {
            return undefined;
        }

        const flags = this.flagCache.getFlags().filter(f => !f.deleted);
        return flags.map(flag => {
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
    }
}
