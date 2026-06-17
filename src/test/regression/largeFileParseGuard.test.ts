/**
 * Regression test for: Extension-host freeze on large / minified files
 *
 * Bug:    `treeSitterService.parse()` called `parser.parse(doc.getText())` on the
 *         entire buffer with no size cap. Synchronous tree-sitter parsing runs on
 *         the extension-host thread, and ~8 providers re-parse the active document
 *         on every edit (debounced 200ms). Opening a large or minified source file
 *         (e.g. a bundled vendor file on a single multi-MB line) could block the
 *         host for seconds and freeze VS Code hard enough to require a reboot.
 *         (Zendesk #60612.)
 * Fix:    A size/line guard in TreeSitterService short-circuits parsing of documents
 *         above byte / line / single-line-length thresholds, so the public query
 *         methods return empty instead of blocking the host.
 * Date:   2026-06-17
 *
 * This test should FAIL (time out / hang) if the guard is removed.
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
        uri: vscode.Uri.parse('file:///big.js'),
        lineCount: lines.length,
        positionAt: (offset: number) => new vscode.Position(0, offset),
        offsetAt: (pos: vscode.Position) => pos.character,
    } as unknown as vscode.TextDocument;
}

suite('Regression: large/minified file parse guard', function () {
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

    test('a multi-MB minified single line returns no calls without hanging', async () => {
        // ~3 MB on a single line — mimics a minified bundle. Real PostHog call text is
        // embedded so a non-guarded parser WOULD find it; the guard must skip it instead.
        const filler = 'var x=1;'.repeat(400_000); // ~3.2 MB, one line
        const code = `posthog.getFeatureFlag('real-flag');${filler}`;

        const calls = await ts.findPostHogCalls(mockDoc(code, 'javascript'));
        assert.strictEqual(
            calls.length, 0,
            'Bug regressed (parse guard): a multi-MB minified file must be skipped, not parsed on the host thread.',
        );
    });

    test('a huge many-line file returns no calls without hanging', async () => {
        const code = `posthog.getFeatureFlag('real-flag');\n` + 'const a = 1;\n'.repeat(80_000);

        const calls = await ts.findPostHogCalls(mockDoc(code, 'javascript'));
        assert.strictEqual(
            calls.length, 0,
            'Bug regressed (parse guard): a file exceeding the line cap must be skipped.',
        );
    });

    test('a normal-sized file is still parsed', async () => {
        const code = [
            `posthog.getFeatureFlag('real-flag');`,
            `posthog.capture('event');`,
        ].join('\n');

        const calls = await ts.findPostHogCalls(mockDoc(code, 'javascript'));
        const flag = calls.find(c => c.method === 'getFeatureFlag');
        assert.ok(
            flag && flag.key === 'real-flag',
            'Parse guard must not affect normal-sized files — expected the flag call to still be detected.',
        );
    });
});
