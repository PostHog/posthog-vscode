/**
 * Regression test for: Multivariate flag truthiness check
 *
 * Bug:    `if (showNewOnboarding)` where `showNewOnboarding` is assigned
 *         from a multivariate flag (e.g. via getFeatureFlag) was being
 *         picked up as a boolean check, producing variant branches with
 *         resolved variants of `'true'`/`'false'`. Combined with later
 *         provider-side label rendering, this manifested as nonsense like
 *         "disabled disabled disabled".
 * Fix:    findIfChainsForVar marks truthiness checks with literal
 *         `'true'`/`'false'` variant keys so that variantHighlightProvider
 *         can skip them when the flag is multivariate. This test locks the
 *         tree-sitter level contract: a truthiness check on a flag-derived
 *         variable produces exactly two branches, one with variantKey
 *         `'true'` and one with variantKey `'false'` — never `'else'` and
 *         never duplicates.
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

suite('Regression: multivariate truthiness check', function () {
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

    test('truthiness check on flag-derived variable yields variantKey "true"/"false" (not "else")', async () => {
        const code = [
            `const showNewOnboarding = posthog.getFeatureFlag('new-onboarding');`, // 0
            `if (showNewOnboarding) {`,                                              // 1
            `    renderNew();`,                                                       // 2
            `} else {`,                                                               // 3
            `    renderOld();`,                                                       // 4
            `}`,                                                                      // 5
        ].join('\n');

        const branches = await ts.findVariantBranches(mockDoc(code, 'javascript'));

        const onboarding = branches.filter(b => b.flagKey === 'new-onboarding');
        assert.strictEqual(
            onboarding.length, 2,
            `Bug regressed (multivariate truthiness): expected exactly 2 branches for flag-derived truthiness check but got ${onboarding.length}: ${JSON.stringify(onboarding)}`,
        );

        const variants = onboarding.map(b => b.variantKey).sort();
        assert.deepStrictEqual(
            variants, ['false', 'true'],
            `Bug regressed (multivariate truthiness): expected variantKeys ['false','true'] so the provider can skip them for multivariate flags, got ${JSON.stringify(variants)}`,
        );
    });

    test('truthiness check produces no duplicate "else" branches', async () => {
        const code = [
            `const flag = posthog.getFeatureFlag('exp');`, // 0
            `if (flag) {`,                                  // 1
            `    a();`,                                     // 2
            `} else {`,                                     // 3
            `    b();`,                                     // 4
            `}`,                                            // 5
        ].join('\n');

        const branches = await ts.findVariantBranches(mockDoc(code, 'javascript'));
        const elses = branches.filter(b => b.flagKey === 'exp' && b.variantKey === 'else');

        assert.strictEqual(
            elses.length, 0,
            `Bug regressed (multivariate truthiness): truthiness checks must not emit "else" variant; got ${JSON.stringify(elses)}`,
        );
    });

    test('Python: truthiness check on flag variable yields true/false branches', async () => {
        const code = [
            `flag = posthog.get_feature_flag("new-onboarding", "u1")`, // 0
            `if flag:`,                                                 // 1
            `    render_new()`,                                         // 2
            `else:`,                                                    // 3
            `    render_old()`,                                         // 4
        ].join('\n');

        const branches = await ts.findVariantBranches(mockDoc(code, 'python'));
        const variants = branches
            .filter(b => b.flagKey === 'new-onboarding')
            .map(b => b.variantKey)
            .sort();

        assert.deepStrictEqual(
            variants, ['false', 'true'],
            `Bug regressed (multivariate truthiness, Python): expected ['false','true'], got ${JSON.stringify(variants)}`,
        );
    });
});
