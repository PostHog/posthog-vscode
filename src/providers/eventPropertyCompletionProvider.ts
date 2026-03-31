import * as vscode from 'vscode';
import { EventCacheService } from '../services/eventCacheService';
import { PostHogService } from '../services/postHogService';
import { AuthService } from '../services/authService';
import { TreeSitterService } from '../services/treeSitterService';
import { TelemetryService } from '../services/telemetryService';

export class EventPropertyCompletionProvider implements vscode.CompletionItemProvider {
    constructor(
        private readonly eventCache: EventCacheService,
        private readonly postHogService: PostHogService,
        private readonly authService: AuthService,
        private readonly treeSitter: TreeSitterService,
        private readonly telemetry: TelemetryService,
    ) {}

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): Promise<vscode.CompletionItem[] | undefined> {
        if (!this.treeSitter.isSupported(document.languageId)) { return undefined; }

        const ctx = await this.treeSitter.getCompletionContext(document, position);
        if (!ctx) { return undefined; }

        const projectId = this.authService.getProjectId();
        if (!projectId) { return undefined; }

        let items: vscode.CompletionItem[] | undefined;

        if (ctx.type === 'property_key' && ctx.eventName) {
            items = await this.completePropertyKeys(projectId, ctx.eventName);
        } else if (ctx.type === 'property_value' && ctx.eventName && ctx.propertyName) {
            items = await this.completePropertyValues(projectId, ctx.eventName, ctx.propertyName);
        }

        if (items && items.length > 0) {
            this.telemetry.capture('completion_provided', { type: ctx.type === 'property_key' ? 'property_key' : 'property_value', count: items.length, language: document.languageId });
        }

        return items;
    }

    private async completePropertyKeys(projectId: number, eventName: string): Promise<vscode.CompletionItem[]> {
        let props = this.eventCache.getProperties(eventName);
        if (!props) {
            props = await this.postHogService.getEventProperties(projectId, eventName);
            this.eventCache.setProperties(eventName, props);
        }

        return props
            .filter(p => !p.name.startsWith('$'))
            .map((prop, i) => {
                const item = new vscode.CompletionItem(prop.name, vscode.CompletionItemKind.Property);
                item.detail = prop.property_type || 'Unknown type';
                item.documentation = new vscode.MarkdownString(
                    `**${prop.name}**\n\nType: \`${prop.property_type || 'unknown'}\`\n\nEvent: \`${eventName}\``
                );
                item.insertText = new vscode.SnippetString(`${prop.name}: `);
                item.sortText = String(i).padStart(3, '0');
                return item;
            });
    }

    private async completePropertyValues(projectId: number, eventName: string, propertyName: string): Promise<vscode.CompletionItem[]> {
        let values = this.eventCache.getPropertyValues(eventName, propertyName);
        if (!values) {
            values = await this.postHogService.getPropertyValues(projectId, eventName, propertyName);
            this.eventCache.setPropertyValues(eventName, propertyName, values);
        }

        if (values.length === 0) { return []; }

        const maxCount = Math.max(...values.map(v => v.count));

        return values.map((v, i) => {
            const item = new vscode.CompletionItem(v.value, vscode.CompletionItemKind.Value);
            const pct = maxCount > 0 ? Math.round((v.count / maxCount) * 100) : 0;
            const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
            item.detail = `${v.count} occurrences`;
            item.documentation = new vscode.MarkdownString(
                `**${v.value}**\n\n\`${bar}\` ${v.count} events\n\nProperty: \`${propertyName}\` on \`${eventName}\``
            );
            item.sortText = String(i).padStart(3, '0');
            return item;
        });
    }
}
