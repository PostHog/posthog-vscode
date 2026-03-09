import * as vscode from 'vscode';

/**
 * Provides a "Track with PostHog" code action when the cursor is on a function/method.
 * Generates a posthog.capture() call with a sensible event name and properties from params.
 */
export class CaptureCodeActionProvider implements vscode.CodeActionProvider {
    static readonly providedCodeActionKinds = [vscode.CodeActionKind.Refactor];

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
    ): vscode.CodeAction[] | undefined {
        const parsed = this.parseFunctionAtLine(document, range.start.line);
        if (!parsed) { return undefined; }

        const eventName = this.toEventName(parsed.name, parsed.isComponent);
        const action = new vscode.CodeAction(
            `Track "${eventName}" with PostHog`,
            vscode.CodeActionKind.Refactor,
        );
        action.command = {
            command: 'posthog.insertCapture',
            title: 'Insert PostHog capture',
            arguments: [document.uri, parsed, eventName],
        };

        return [action];
    }

    private parseFunctionAtLine(
        doc: vscode.TextDocument,
        line: number,
    ): FunctionInfo | undefined {
        // Look at the current line and a few lines around it
        const searchStart = Math.max(0, line - 2);
        const searchEnd = Math.min(doc.lineCount - 1, line + 2);

        for (let i = searchStart; i <= searchEnd; i++) {
            const text = doc.lineAt(i).text;
            const result = this.matchFunction(text, i, doc);
            if (result) { return result; }
        }
        return undefined;
    }

    private matchFunction(text: string, line: number, doc: vscode.TextDocument): FunctionInfo | undefined {
        // Pattern 1: function declaration — function name(params) {
        let match = text.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/);
        if (match) {
            return this.buildInfo(match[1], match[2], line, doc);
        }

        // Pattern 2: method definition — name(params) {  (inside class)
        match = text.match(/^\s*(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*\w[^{]*)?\s*\{/);
        if (match && !['if', 'for', 'while', 'switch', 'catch', 'else'].includes(match[1])) {
            return this.buildInfo(match[1], match[2], line, doc);
        }

        // Pattern 3: arrow function — const name = (params) => {
        match = text.match(/^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*[^=]+)?\s*=>/);
        if (match) {
            return this.buildInfo(match[1], match[2], line, doc);
        }

        // Pattern 4: arrow function with single param — const name = param =>
        match = text.match(/^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(\w+)\s*=>/);
        if (match) {
            return this.buildInfo(match[1], match[2], line, doc);
        }

        return undefined;
    }

    private buildInfo(name: string, paramsStr: string, declarationLine: number, doc: vscode.TextDocument): FunctionInfo {
        const params = this.parseParams(paramsStr);
        const isComponent = /^[A-Z]/.test(name);

        // Find the opening brace to know where to insert
        let bodyLine = declarationLine;
        for (let i = declarationLine; i < Math.min(declarationLine + 5, doc.lineCount); i++) {
            if (doc.lineAt(i).text.includes('{')) {
                bodyLine = i;
                break;
            }
        }

        // Determine indentation of the function body
        const nextLine = bodyLine + 1 < doc.lineCount ? doc.lineAt(bodyLine + 1).text : '';
        const bodyIndent = nextLine.match(/^(\s*)/)?.[1] || '    ';

        return {
            name,
            params,
            isComponent,
            bodyLine,
            bodyIndent,
        };
    }

    private parseParams(paramsStr: string): string[] {
        if (!paramsStr.trim()) { return []; }

        // Filter out noise params
        const SKIP_PARAMS = new Set(['e', 'ev', 'event', 'evt', 'ctx', 'context', 'req', 'res', 'next', 'err', 'error', '_', '__']);

        return paramsStr
            .split(',')
            .map(p => {
                // Handle destructured: { a, b } => skip
                if (p.includes('{') || p.includes('}')) { return ''; }
                // Handle typed params: name: Type => name
                const name = p.split(':')[0].split('=')[0].replace(/[?.]/g, '').trim();
                return name;
            })
            .filter(p => p && !SKIP_PARAMS.has(p) && !p.startsWith('...'));
    }

    /**
     * Convert function name to snake_case event name.
     * handleUserLogin -> user_login
     * onClick -> click
     * UserProfile (component) -> user_profile_viewed
     */
    private toEventName(name: string, isComponent: boolean): string {
        // Strip common prefixes
        let clean = name
            .replace(/^handle/, '')
            .replace(/^on/, '')
            .replace(/^get/, '')
            .replace(/^set/, '');

        if (!clean) { clean = name; }

        // camelCase / PascalCase to snake_case
        const snake = clean
            .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
            .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
            .toLowerCase();

        if (isComponent) {
            return snake + '_viewed';
        }

        return snake;
    }
}

export interface FunctionInfo {
    name: string;
    params: string[];
    isComponent: boolean;
    bodyLine: number;
    bodyIndent: string;
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

            // Build properties object
            let propsStr = '';
            if (info.params.length > 0) {
                const entries = info.params.map(p => `    ${p}`).join(',\n');
                propsStr = `, {\n${info.bodyIndent}${entries.replace(/\n/g, '\n' + info.bodyIndent)}\n${info.bodyIndent}}`;
            }

            // For components, wrap in useEffect
            let snippet: string;
            if (info.isComponent) {
                snippet = `${info.bodyIndent}useEffect(() => {\n${info.bodyIndent}    posthog.capture('${eventName}'${propsStr});\n${info.bodyIndent}}, []);\n`;
            } else {
                snippet = `${info.bodyIndent}posthog.capture('${eventName}'${propsStr});\n`;
            }

            // Insert after the opening brace
            const insertLine = info.bodyLine + 1;
            await editor.edit(editBuilder => {
                editBuilder.insert(new vscode.Position(insertLine, 0), snippet);
            });

            // Place cursor at the event name for easy editing
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
