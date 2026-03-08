import * as vscode from 'vscode';
import { EventCacheService } from '../services/eventCacheService';

const CAPTURE_METHODS = [
    'capture',
];

const METHOD_PATTERN = new RegExp(
    `(?:posthog|client|ph)\\.(?:${CAPTURE_METHODS.join('|')})\\s*\\(\\s*(['"\`])`,
);

export class EventCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private readonly eventCache: EventCacheService) {}

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

        const events = this.eventCache.getEvents().filter(e => !e.hidden);
        return events.map(event => {
            const isCustom = !event.name.startsWith('$');
            const item = new vscode.CompletionItem(event.name, vscode.CompletionItemKind.Event);
            item.detail = event.verified ? 'Verified' : (isCustom ? 'Custom event' : 'PostHog event');
            item.documentation = new vscode.MarkdownString(
                `**${event.name}**\n\n` +
                (event.description ? `${event.description}\n\n` : '') +
                (event.tags.length > 0 ? `Tags: ${event.tags.join(', ')}\n\n` : '') +
                (event.last_seen_at ? `Last seen: ${new Date(event.last_seen_at).toLocaleDateString()}` : '')
            );
            // Sort: verified first, then custom events, then PostHog internal events
            item.sortText = (event.verified ? '0' : '1') + (isCustom ? '0' : '1') + '-' + event.name;
            return item;
        });
    }
}
