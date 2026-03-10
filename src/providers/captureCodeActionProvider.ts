import * as vscode from 'vscode';
import { TreeSitterService } from '../services/treeSitterService';
import type { FunctionInfo } from '../services/treeSitterService';

export { FunctionInfo };

/**
 * Provides a "Track with PostHog" code action when the cursor is on a function/method.
 * Uses tree-sitter to detect functions across all supported languages.
 */
export class CaptureCodeActionProvider implements vscode.CodeActionProvider {
    static readonly providedCodeActionKinds = [vscode.CodeActionKind.Refactor];

    constructor(private readonly treeSitter: TreeSitterService) {}

    async provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
    ): Promise<vscode.CodeAction[] | undefined> {
        if (!this.treeSitter.isSupported(document.languageId)) { return undefined; }

        const functions = await this.treeSitter.findFunctions(document);
        const line = range.start.line;

        // Find a function near the cursor (within 2 lines)
        const fn = functions.find(f =>
            Math.abs(f.bodyLine - line) <= 2 || f.bodyLine === line
        );
        if (!fn) { return undefined; }

        const eventName = toEventName(fn.name, fn.isComponent);
        const action = new vscode.CodeAction(
            `Track "${eventName}" with PostHog`,
            vscode.CodeActionKind.Refactor,
        );
        action.command = {
            command: 'posthog.insertCapture',
            title: 'Insert PostHog capture',
            arguments: [document.uri, fn, eventName],
        };

        return [action];
    }
}

/**
 * Convert function name to snake_case event name.
 * handleUserLogin -> user_login
 * onClick -> click
 * UserProfile (component) -> user_profile_viewed
 */
function toEventName(name: string, isComponent: boolean): string {
    let clean = name
        .replace(/^handle/, '')
        .replace(/^on/, '')
        .replace(/^get/, '')
        .replace(/^set/, '');

    if (!clean) { clean = name; }

    const snake = clean
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
        .toLowerCase();

    if (isComponent) {
        return snake + '_viewed';
    }

    return snake;
}

export function registerCaptureCommands(): vscode.Disposable[] {
    return [
        vscode.commands.registerCommand('posthog.insertCapture', async (
            uri: vscode.Uri,
            info: FunctionInfo,
            eventName: string,
        ) => {
            const doc = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(doc);

            let propsStr = '';
            if (info.params.length > 0) {
                const entries = info.params.map(p => `    ${p}`).join(',\n');
                propsStr = `, {\n${info.bodyIndent}${entries.replace(/\n/g, '\n' + info.bodyIndent)}\n${info.bodyIndent}}`;
            }

            let snippet: string;
            if (info.isComponent) {
                snippet = `${info.bodyIndent}useEffect(() => {\n${info.bodyIndent}    posthog.capture('${eventName}'${propsStr});\n${info.bodyIndent}}, []);\n`;
            } else {
                snippet = `${info.bodyIndent}posthog.capture('${eventName}'${propsStr});\n`;
            }

            const insertLine = info.bodyLine + 1;
            await editor.edit(editBuilder => {
                editBuilder.insert(new vscode.Position(insertLine, 0), snippet);
            });

            const eventNameLine = insertLine + (info.isComponent ? 1 : 0);
            const lineText = doc.lineAt(Math.min(eventNameLine, doc.lineCount - 1)).text;
            const nameStart = lineText.indexOf(`'${eventName}'`);
            if (nameStart >= 0) {
                const pos = new vscode.Position(eventNameLine, nameStart + 1);
                editor.selection = new vscode.Selection(pos, new vscode.Position(eventNameLine, nameStart + 1 + eventName.length));
            }
        }),
    ];
}
