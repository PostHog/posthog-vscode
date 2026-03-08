import * as vscode from 'vscode';
import { EventCacheService } from '../services/eventCacheService';
import { PostHogService } from '../services/postHogService';
import { AuthService } from '../services/authService';

// Matches: posthog.capture('event_name'  — captures the event name
const CAPTURE_CALL = /(?:posthog|client|ph)\.capture\s*\(\s*(['"`])([^'"`]+)\1/;

type CompletionContext = {
    eventName: string;
    mode: 'key' | 'value';
    propertyName?: string;
};

export class EventPropertyCompletionProvider implements vscode.CompletionItemProvider {
    constructor(
        private readonly eventCache: EventCacheService,
        private readonly postHogService: PostHogService,
        private readonly authService: AuthService,
    ) {}

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): Promise<vscode.CompletionItem[] | undefined> {
        const ctx = this.detectContext(document, position);
        if (!ctx) { return undefined; }

        const projectId = this.authService.getProjectId();
        if (!projectId) { return undefined; }

        if (ctx.mode === 'key') {
            return this.completePropertyKeys(projectId, ctx.eventName);
        }
        if (ctx.mode === 'value' && ctx.propertyName) {
            return this.completePropertyValues(projectId, ctx.eventName, ctx.propertyName);
        }
        return undefined;
    }

    // ── Context detection ──

    private detectContext(document: vscode.TextDocument, position: vscode.Position): CompletionContext | null {
        // Scan backward from cursor to find capture('eventName', { ... })
        // and determine if we're in key or value position
        const textUpToCursor = this.getTextUpToCursor(document, position, 30);
        if (!textUpToCursor) { return null; }

        // Find the capture call and extract event name
        const captureMatch = CAPTURE_CALL.exec(textUpToCursor);
        if (!captureMatch) { return null; }

        // Check we're inside the second argument (properties object)
        const afterCapture = textUpToCursor.substring(captureMatch.index + captureMatch[0].length);
        // Must have a comma then opening brace: , {
        if (!/,\s*\{/.test(afterCapture)) { return null; }

        const eventName = captureMatch[2];

        // Get just the current line text before cursor for key/value detection
        const lineText = document.lineAt(position).text.substring(0, position.character);
        const trimmed = lineText.trimStart();

        // Value position: `key: '|` or `key: "|` or `key: `|`
        const valueMatch = trimmed.match(/(\w+)\s*:\s*(['"`])$/);
        if (valueMatch) {
            return { eventName, mode: 'value', propertyName: valueMatch[1] };
        }

        // Key position: after `{` or `,` with optional whitespace, possibly partial key typed
        // Check if we're NOT in the middle of a value assignment
        if (!/:/.test(trimmed) || /,\s*$/.test(trimmed) || /,\s*\w*$/.test(trimmed) || /^\w*$/.test(trimmed)) {
            return { eventName, mode: 'key' };
        }

        return null;
    }

    private getTextUpToCursor(document: vscode.TextDocument, position: vscode.Position, maxLines: number): string | null {
        const startLine = Math.max(0, position.line - maxLines);
        const range = new vscode.Range(startLine, 0, position.line, position.character);
        return document.getText(range);
    }

    // ── Property key completion ──

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
                // Insert key with colon and space, ready for value
                item.insertText = new vscode.SnippetString(`${prop.name}: `);
                item.sortText = String(i).padStart(3, '0');
                return item;
            });
    }

    // ── Property value completion ──

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
