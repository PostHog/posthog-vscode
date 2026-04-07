/**
 * Regression test for: Ruby `case`/`when`/`else` support
 *
 * Bug:    Same shape as the Go switch bug — findSwitchForVar did not
 *         understand Ruby's `case` AST. Ruby uses `case` (not
 *         `switch_statement`) with `when` (containing `pattern`) and
 *         `else` children. Without explicit handling, Ruby `case`
 *         statements over a flag-derived variable produced no
 *         variant branches.
 * Fix:    Added Ruby-specific AST handling to findSwitchForVar:
 *         the `case` node, its `when` children with their `pattern`
 *         children, and the trailing `else`. This regression locks
 *         the fix in independently of the broader Ruby snapshot suite.
 * Date:   2026-04-07
 *
 * This test should FAIL if the bug regresses.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { TreeSitterService } from '../../services/treeSitterService';

function mockDoc(code: string, languageId: string = 'ruby'): vscode.TextDocument {
    const lines = code.split('\n');
    return {
        getText: () => code,
        languageId,
        lineAt: (n: number) => ({
            text: lines[n] ?? '',
            range: new vscode.Range(n, 0, n, (lines[n] ?? '').length),
            firstNonWhitespaceCharacterIndex: (lines[n] ?? '').search(/\S/),
        }),
        uri: vscode.Uri.parse('file:///test.rb'),
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

suite('Regression: Ruby case/when/else', function () {
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

    test('Ruby case/when on flag-derived variable produces variant branches', async () => {
        const code = [
            `posthog = PostHog::Client.new(api_key: "phc_token")`, // 0
            `v = posthog.get_feature_flag("rb-exp", "user-1")`,    // 1
            `case v`,                                               // 2
            `when "control"`,                                       // 3
            `  puts "a"`,                                           // 4
            `when "test"`,                                          // 5
            `  puts "b"`,                                           // 6
            `else`,                                                 // 7
            `  puts "c"`,                                           // 8
            `end`,                                                  // 9
        ].join('\n');

        const branches = await ts.findVariantBranches(mockDoc(code));
        const exp = branches.filter(b => b.flagKey === 'rb-exp');

        const control = exp.find(b => b.variantKey === 'control');
        const test = exp.find(b => b.variantKey === 'test');

        assert.ok(
            control,
            `Bug regressed (Ruby case/when): expected 'control' branch in Ruby case. Got: ${JSON.stringify(branches)}`,
        );
        assert.ok(
            test,
            `Bug regressed (Ruby case/when): expected 'test' branch in Ruby case. Got: ${JSON.stringify(branches)}`,
        );
    });

    test('Ruby case with only when (no else) still produces branches', async () => {
        const code = [
            `posthog = PostHog::Client.new(api_key: "phc_token")`, // 0
            `v = posthog.get_feature_flag("rb-no-else", "user-1")`, // 1
            `case v`,                                                // 2
            `when "alpha"`,                                          // 3
            `  puts "a"`,                                            // 4
            `end`,                                                   // 5
        ].join('\n');

        const branches = await ts.findVariantBranches(mockDoc(code));
        const alpha = branches.find(b => b.flagKey === 'rb-no-else' && b.variantKey === 'alpha');

        assert.ok(
            alpha,
            `Bug regressed (Ruby case/when): expected 'alpha' branch from a when-only case. Got: ${JSON.stringify(branches)}`,
        );
    });
});
