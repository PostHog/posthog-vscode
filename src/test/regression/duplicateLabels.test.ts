/**
 * Regression test for: "disabled disabled disabled" label repetition
 *
 * Bug:    Multiple branches sharing the same conditionLine were getting
 *         separate labels rendered, producing repetitions like "disabled
 *         disabled disabled" inline. The root cause at the tree-sitter
 *         level was an `else` branch on a boolean check being emitted
 *         with a generic 'else' variant key (instead of 'false'),
 *         interacting with the provider's labelling.
 * Fix:    For boolean flags, the else branch resolves to the opposite of
 *         the if's variant ('true' -> 'false'), and the provider
 *         deduplicates by conditionLine. This test enforces the
 *         tree-sitter side: an if/else on a boolean flag returns exactly
 *         two branches with distinct conditionLines.
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

suite('Regression: duplicate label repetition', function () {
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

    test('boolean isFeatureEnabled if/else produces exactly 2 branches with distinct conditionLines', async () => {
        const code = [
            `const enabled = posthog.isFeatureEnabled('beta');`, // 0
            `if (enabled) {`,                                     // 1
            `    show();`,                                        // 2
            `} else {`,                                           // 3
            `    hide();`,                                        // 4
            `}`,                                                  // 5
        ].join('\n');

        const branches = await ts.findVariantBranches(mockDoc(code, 'javascript'));
        const beta = branches.filter(b => b.flagKey === 'beta');

        assert.strictEqual(
            beta.length, 2,
            `Bug regressed (duplicate labels): expected exactly 2 branches, got ${beta.length}: ${JSON.stringify(beta)}`,
        );

        const conditionLines = beta.map(b => b.conditionLine);
        const unique = new Set(conditionLines);
        assert.strictEqual(
            unique.size, conditionLines.length,
            `Bug regressed (duplicate labels): conditionLines must be distinct, got ${JSON.stringify(conditionLines)}`,
        );
    });

    test('boolean if/else branches do not duplicate keys', async () => {
        const code = [
            `const enabled = posthog.isFeatureEnabled('feat');`, // 0
            `if (enabled) {`,                                     // 1
            `    a();`,                                           // 2
            `} else {`,                                           // 3
            `    b();`,                                           // 4
            `}`,                                                  // 5
        ].join('\n');

        const branches = await ts.findVariantBranches(mockDoc(code, 'javascript'));
        const feat = branches.filter(b => b.flagKey === 'feat');
        const variants = feat.map(b => b.variantKey).sort();

        assert.deepStrictEqual(
            variants, ['false', 'true'],
            `Bug regressed (duplicate labels): expected exactly one 'true' and one 'false' branch, got ${JSON.stringify(variants)}`,
        );
    });
});
