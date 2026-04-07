/**
 * Regression test for: Python `feature_enabled` legacy method missing
 *
 * Bug:    The legacy Python SDK method `feature_enabled` (without the
 *         `is_` prefix) was not present in PY_FLAG_METHODS or in any
 *         provider's flag method set, so call sites and decorations
 *         were silently ignored for codebases still on the legacy API.
 * Fix:    `feature_enabled` was added to PY_FLAG_METHODS in
 *         treeSitterService and to all provider FLAG_METHODS sets.
 *         This test exercises the public TreeSitterService API.
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

suite('Regression: python feature_enabled legacy method', function () {
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

    test('posthog.feature_enabled(...) is detected', async () => {
        const code = `result = posthog.feature_enabled("legacy-flag", "user-1")`;
        const calls = await ts.findPostHogCalls(mockDoc(code, 'python'));

        const flagCall = calls.find(c => c.method === 'feature_enabled' && c.key === 'legacy-flag');
        assert.ok(
            flagCall,
            `Bug regressed (python feature_enabled): expected feature_enabled('legacy-flag') to be detected as a flag call. Got: ${JSON.stringify(calls)}`,
        );
        assert.strictEqual(flagCall!.line, 0);
    });

    test('feature_enabled in if statement produces a variant branch', async () => {
        const code = [
            `enabled = posthog.feature_enabled("legacy", "u1")`, // 0
            `if enabled:`,                                        // 1
            `    do_thing()`,                                     // 2
            `else:`,                                              // 3
            `    other()`,                                        // 4
        ].join('\n');

        const branches = await ts.findVariantBranches(mockDoc(code, 'python'));
        const legacy = branches.filter(b => b.flagKey === 'legacy');

        assert.ok(
            legacy.length >= 1,
            `Bug regressed (python feature_enabled): expected at least one variant branch from a feature_enabled-derived variable. Got: ${JSON.stringify(branches)}`,
        );
    });
});
