/**
 * Regression test for: Else branch resolution for boolean flags
 *
 * Bug:    For `if (enabled) { } else { }` where `enabled` came from a
 *         boolean flag method like `isFeatureEnabled`, the else branch
 *         was being assigned variantKey `'else'` instead of `'false'`.
 *         That made it impossible for the provider to render the
 *         correct "disabled" inline label and contributed to the
 *         duplicate-label rendering bug.
 * Fix:    extractIfChainBranches now flips boolean variants:
 *         when the if-variant is `'true'` the else resolves to
 *         `'false'`, and vice versa. Only multivariate `===` comparisons
 *         get a generic `'else'`.
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

suite('Regression: boolean flag else branch resolution', function () {
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

    test('JS isFeatureEnabled if/else: else branch is variantKey "false" (not "else")', async () => {
        const code = [
            `const enabled = posthog.isFeatureEnabled('feat');`, // 0
            `if (enabled) {`,                                     // 1
            `    on();`,                                          // 2
            `} else {`,                                           // 3
            `    off();`,                                         // 4
            `}`,                                                  // 5
        ].join('\n');

        const branches = await ts.findVariantBranches(mockDoc(code, 'javascript'));
        const feat = branches.filter(b => b.flagKey === 'feat');
        const variants = feat.map(b => b.variantKey).sort();

        assert.deepStrictEqual(
            variants, ['false', 'true'],
            `Bug regressed (boolean else branch): expected ['false','true'], got ${JSON.stringify(variants)}. The else branch must resolve to 'false', not 'else'.`,
        );

        const elseBranch = feat.find(b => b.variantKey === 'else');
        assert.strictEqual(
            elseBranch, undefined,
            `Bug regressed (boolean else branch): boolean flag if/else must NOT produce a generic 'else' variant.`,
        );
    });

    test('JS negated truthiness: if (!flag) { } else { } resolves correctly', async () => {
        const code = [
            `const enabled = posthog.isFeatureEnabled('feat');`, // 0
            `if (!enabled) {`,                                    // 1
            `    off();`,                                         // 2
            `} else {`,                                           // 3
            `    on();`,                                          // 4
            `}`,                                                  // 5
        ].join('\n');

        const branches = await ts.findVariantBranches(mockDoc(code, 'javascript'));
        const feat = branches.filter(b => b.flagKey === 'feat');
        const variants = feat.map(b => b.variantKey).sort();

        assert.deepStrictEqual(
            variants, ['false', 'true'],
            `Bug regressed (boolean else branch): expected ['false','true'] for negated check, got ${JSON.stringify(variants)}.`,
        );
    });

    test('Python boolean if/else also resolves to true/false', async () => {
        const code = [
            `enabled = posthog.is_feature_enabled("feat", "u1")`, // 0
            `if enabled:`,                                         // 1
            `    on()`,                                            // 2
            `else:`,                                               // 3
            `    off()`,                                           // 4
        ].join('\n');

        const branches = await ts.findVariantBranches(mockDoc(code, 'python'));
        const feat = branches.filter(b => b.flagKey === 'feat');
        const variants = feat.map(b => b.variantKey).sort();

        assert.deepStrictEqual(
            variants, ['false', 'true'],
            `Bug regressed (boolean else branch, Python): expected ['false','true'], got ${JSON.stringify(variants)}.`,
        );
    });
});
