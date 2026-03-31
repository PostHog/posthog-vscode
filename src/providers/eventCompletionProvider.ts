import * as vscode from 'vscode';
import { EventCacheService } from '../services/eventCacheService';
import { TreeSitterService } from '../services/treeSitterService';
import { TelemetryService } from '../services/telemetryService';

export class EventCompletionProvider implements vscode.CompletionItemProvider {
    constructor(
        private readonly eventCache: EventCacheService,
        private readonly treeSitter: TreeSitterService,
        private readonly telemetry: TelemetryService,
    ) {}

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): Promise<vscode.CompletionItem[] | undefined> {
        if (!this.treeSitter.isSupported(document.languageId)) { return undefined; }

        const ctx = await this.treeSitter.getCompletionContext(document, position);
        if (!ctx || ctx.type !== 'capture_event') { return undefined; }

        const events = this.eventCache.getEvents().filter(e => !e.hidden);
        const items = events.map(event => {
            const isCustom = !event.name.startsWith('$');
            const item = new vscode.CompletionItem(event.name, vscode.CompletionItemKind.Event);
            item.detail = event.verified ? 'Verified' : (isCustom ? 'Custom event' : 'PostHog event');
            item.documentation = new vscode.MarkdownString(
                `**${event.name}**\n\n` +
                (event.description ? `${event.description}\n\n` : '') +
                (event.tags.length > 0 ? `Tags: ${event.tags.join(', ')}\n\n` : '') +
                (event.last_seen_at ? `Last seen: ${new Date(event.last_seen_at).toLocaleDateString()}` : '')
            );
            item.sortText = (event.verified ? '0' : '1') + (isCustom ? '0' : '1') + '-' + event.name;
            return item;
        });

        if (items.length > 0) {
            this.telemetry.capture('completion_provided', { type: 'event_name', count: items.length, language: document.languageId });
        }

        return items;
    }
}
