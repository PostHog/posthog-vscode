/**
 * Regression test for: Python `Posthog(api_key=...)` keyword arg constructor
 *
 * Bug:    findInitCalls only matched the positional first-arg form
 *         (`Posthog("phc_...")`). Codebases that pass the token via the
 *         keyword `api_key=` (or `project_api_key=`) were missed,
 *         leaving them without inline init validation.
 * Fix:    Pattern 3b in findInitCalls now matches the keyword form,
 *         capturing the `api_key`/`project_api_key` value as the token.
 * Date:   2026-04-07
 *
 * This test should FAIL if the bug regresses.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { TreeSitterService } from '../../services/treeSitterService';

function mockDoc(code: string, languageId: string): vscode.TextDocument {
    const lines = code.split('\n');
    return {
        getText: () => code,
        languageId,
        lineAt: (n: number) => ({
            text: lines[n] ?? '',
            range: new vscode.Range(n, 0, n, (lines[n] ?? '').length),
            firstNonWhitespaceCharacterIndex: (lines[n] ?? '').search(/\S/),
        }),
        uri: vscode.Uri.parse('file:///test.' + (languageId === 'python' ? 'py' : 'ts')),
        lineCount: lines.length,
        positionAt: (offset: number) => {
            let line = 0;
            let col = offset;
            for (let i = 0; i < lines.length; i++) {
                if (col <= lines[i].length) { return new vscode.Position(line, col); }
                col -= lines[i].length + 1;
                line++;
            }
            return new vscode.Position(line, col);
        },
        offsetAt: (pos: vscode.Position) => {
            let offset = 0;
            for (let i = 0; i < pos.line; i++) { offset += (lines[i]?.length ?? 0) + 1; }
            return offset + pos.character;
        },
    } as unknown as vscode.TextDocument;
}

suite('Regression: python keyword-arg constructor (api_key=)', function () {
    this.timeout(30000);

    let ts: TreeSitterService;

    suiteSetup(async () => {
        ts = new TreeSitterService();
        const ext = vscode.extensions.all.find(e => e.id.includes('codehog'));
        const extensionPath = ext?.extensionPath ?? path.resolve(__dirname, '../../..');
        await ts.initialize(extensionPath);
        ts.updateConfig({
            additionalClientNames: [],
            additionalFlagFunctions: [],
            detectNestedClients: true,
        });
    });

    test('Posthog(api_key="phc_x", host=...) detected as init call', async () => {
        const code = `client = Posthog(api_key="phc_x", host="https://us.posthog.com")`;
        const inits = await ts.findInitCalls(mockDoc(code, 'python'));

        assert.strictEqual(
            inits.length, 1,
            `Bug regressed (python kwarg constructor): expected 1 init call, got ${inits.length}: ${JSON.stringify(inits)}`,
        );
        assert.strictEqual(
            inits[0].token, 'phc_x',
            `Bug regressed (python kwarg constructor): expected token 'phc_x' from api_key=, got '${inits[0].token}'`,
        );
        assert.strictEqual(inits[0].apiHost, 'https://us.posthog.com');
    });

    test('Posthog(project_api_key="phc_y") detected as init call', async () => {
        const code = `client = Posthog(project_api_key="phc_y")`;
        const inits = await ts.findInitCalls(mockDoc(code, 'python'));

        assert.strictEqual(
            inits.length, 1,
            `Bug regressed (python kwarg constructor): expected 1 init call from project_api_key=, got ${inits.length}: ${JSON.stringify(inits)}`,
        );
        assert.strictEqual(
            inits[0].token, 'phc_y',
            `Bug regressed (python kwarg constructor): expected token 'phc_y' from project_api_key=, got '${inits[0].token}'`,
        );
    });

    test('PostHog(api_key=...) (capital H) also detected', async () => {
        const code = `client = PostHog(api_key="phc_z", host="https://eu.posthog.com")`;
        const inits = await ts.findInitCalls(mockDoc(code, 'python'));

        assert.strictEqual(
            inits.length, 1,
            `Bug regressed (python kwarg constructor): expected 1 init call from PostHog(api_key=...), got ${inits.length}: ${JSON.stringify(inits)}`,
        );
        assert.strictEqual(inits[0].token, 'phc_z');
        assert.strictEqual(inits[0].apiHost, 'https://eu.posthog.com');
    });
});
