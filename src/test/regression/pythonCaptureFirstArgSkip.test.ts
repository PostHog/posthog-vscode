/**
 * Regression test for: Python capture duplicate detection
 *
 * Bug:    The generic `postHogCalls` query was matching the FIRST
 *         argument of Python `capture()` (which is `distinct_id`,
 *         not the event name), producing duplicate PostHogCall entries:
 *         one with key="user-1" and one with key="purchase_completed".
 * Fix:    findPostHogCalls now skips capture in the generic query when
 *         a `pythonCaptureCalls` query exists for the language. The
 *         dedicated python query only emits the actual event name.
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

suite('Regression: python capture first-arg duplicate skip', function () {
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

    test('positional capture: no duplicate with distinct_id as key', async () => {
        const code = `posthog.capture("user-1", "purchase_completed")`;
        const calls = await ts.findPostHogCalls(mockDoc(code, 'python'));

        const captureCalls = calls.filter(c => c.method === 'capture');

        assert.strictEqual(
            captureCalls.length, 1,
            `Bug regressed (python capture duplicate): expected exactly 1 capture call but got ${captureCalls.length}: ${JSON.stringify(captureCalls)}`,
        );

        assert.strictEqual(
            captureCalls[0].key, 'purchase_completed',
            `Bug regressed (python capture duplicate): the captured event must be 'purchase_completed' (the second arg), not '${captureCalls[0].key}' (the first arg / distinct_id).`,
        );

        const userOneCall = calls.find(c => c.key === 'user-1');
        assert.strictEqual(
            userOneCall, undefined,
            `Bug regressed (python capture duplicate): the distinct_id 'user-1' must NOT be detected as a PostHogCall key. Got: ${JSON.stringify(userOneCall)}`,
        );
    });

    test('positional capture: distinct_id literal must not produce a "user-1" call', async () => {
        // The classic shape of the bug — the regression is that the
        // generic postHogCalls query (which matches the FIRST string arg)
        // would also pick up the distinct_id literal "u1" as if it were
        // an event name, producing two PostHogCalls.
        const code = `posthog.capture("u1", "signup_completed")`;
        const calls = await ts.findPostHogCalls(mockDoc(code, 'python'));

        const keys = calls.filter(c => c.method === 'capture').map(c => c.key).sort();
        assert.deepStrictEqual(
            keys, ['signup_completed'],
            `Bug regressed (python capture duplicate): expected exactly ['signup_completed'] for capture method, got ${JSON.stringify(keys)}.`,
        );
    });
});
