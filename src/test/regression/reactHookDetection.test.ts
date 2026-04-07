/**
 * Regression test for: React hooks not detected
 *
 * Bug:    `useFeatureFlag`, `useFeatureFlagPayload`, and
 *         `useFeatureFlagVariantKey` were missing from the FLAG_METHODS
 *         sets in providers and from bare-function detection in
 *         treeSitterService. As a result, hook calls like
 *         `const flag = useFeatureFlag('my-flag')` were not detected
 *         and produced no flag references / variant branches.
 * Fix:    Hooks were added to all relevant providers AND wired up in
 *         tree-sitter as bare flag function calls. This test asserts
 *         the public TreeSitterService API picks them up as PostHogCalls
 *         and that the assigned variable is also tracked for variant
 *         branches.
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

suite('Regression: React hook detection', function () {
    this.timeout(30000);

    let ts: TreeSitterService;

    suiteSetup(async () => {
        ts = new TreeSitterService();
        const ext = vscode.extensions.all.find(e => e.id.includes('codehog'));
        const extensionPath = ext?.extensionPath ?? path.resolve(__dirname, '../../..');
        await ts.initialize(extensionPath);
        ts.updateConfig({
            additionalClientNames: [],
            additionalFlagFunctions: ['useFeatureFlag', 'useFeatureFlagPayload', 'useFeatureFlagVariantKey'],
            detectNestedClients: true,
        });
    });

    test('useFeatureFlag is detected as a flag call', async () => {
        const code = `const flag = useFeatureFlag('my-flag');`;
        const calls = await ts.findPostHogCalls(mockDoc(code, 'javascript'));

        const hookCall = calls.find(c => c.method === 'useFeatureFlag' && c.key === 'my-flag');
        assert.ok(
            hookCall,
            `Bug regressed (React hooks): expected a useFeatureFlag('my-flag') call to be detected. Got: ${JSON.stringify(calls)}`,
        );
    });

    test('useFeatureFlagPayload is detected as a flag call', async () => {
        const code = `const payload = useFeatureFlagPayload('cfg');`;
        const calls = await ts.findPostHogCalls(mockDoc(code, 'javascript'));

        const hookCall = calls.find(c => c.method === 'useFeatureFlagPayload' && c.key === 'cfg');
        assert.ok(
            hookCall,
            `Bug regressed (React hooks): expected useFeatureFlagPayload('cfg') to be detected. Got: ${JSON.stringify(calls)}`,
        );
    });

    test('useFeatureFlagVariantKey-derived variable produces variant branches', async () => {
        const code = [
            `const variant = useFeatureFlagVariantKey('exp');`, // 0
            `if (variant === 'control') {`,                      // 1
            `    showA();`,                                      // 2
            `}`,                                                 // 3
        ].join('\n');

        const branches = await ts.findVariantBranches(mockDoc(code, 'javascript'));
        const exp = branches.filter(b => b.flagKey === 'exp');

        assert.ok(
            exp.find(b => b.variantKey === 'control'),
            `Bug regressed (React hooks): expected 'control' variant branch from useFeatureFlagVariantKey-derived variable. Got: ${JSON.stringify(branches)}`,
        );
    });
});
