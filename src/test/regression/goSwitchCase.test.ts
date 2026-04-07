/**
 * Regression test for: Go switch/case node types
 *
 * Bug:    findSwitchForVar only checked the JavaScript `switch_statement`
 *         AST node and `switch_case` children, missing Go's
 *         `expression_switch_statement`, `expression_case`, and
 *         `default_case` node types — and Go's case values come from
 *         an `expression_list`. As a result, Go switch statements over
 *         a flag-derived variable produced zero variant branches.
 * Fix:    findSwitchForVar now handles all relevant Go AST node types
 *         in addition to the JS ones. This regression locks in the
 *         fix independently of the broader Go snapshot suite so it
 *         can fail loudly if anyone removes Go support from
 *         findSwitchForVar.
 * Date:   2026-04-07
 *
 * This test should FAIL if the bug regresses.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { TreeSitterService } from '../../services/treeSitterService';

function mockDoc(code: string, languageId: string = 'go'): vscode.TextDocument {
    const lines = code.split('\n');
    return {
        getText: () => code,
        languageId,
        lineAt: (n: number) => ({
            text: lines[n] ?? '',
            range: new vscode.Range(n, 0, n, (lines[n] ?? '').length),
            firstNonWhitespaceCharacterIndex: (lines[n] ?? '').search(/\S/),
        }),
        uri: vscode.Uri.parse('file:///test.go'),
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

suite('Regression: Go switch/case node types', function () {
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

    test('Go switch on flag-derived variable produces case branches', async () => {
        const code = [
            `package main`,                                                  // 0
            `func main() {`,                                                  // 1
            `    client := posthog.New("phc_token")`,                         // 2
            `    v, _ := client.GetFeatureFlag("switch-exp")`,                // 3
            `    switch v {`,                                                 // 4
            `    case "control":`,                                            // 5
            `        fmt.Println("a")`,                                       // 6
            `    case "test":`,                                               // 7
            `        fmt.Println("b")`,                                       // 8
            `    default:`,                                                   // 9
            `        fmt.Println("c")`,                                       // 10
            `    }`,                                                          // 11
            `}`,                                                              // 12
        ].join('\n');

        const branches = await ts.findVariantBranches(mockDoc(code));
        const exp = branches.filter(b => b.flagKey === 'switch-exp');

        const control = exp.find(b => b.variantKey === 'control');
        const test = exp.find(b => b.variantKey === 'test');
        const def = exp.find(b => b.variantKey === 'default');

        assert.ok(
            control,
            `Bug regressed (Go switch/case): expected 'control' case branch in Go switch. Got: ${JSON.stringify(branches)}`,
        );
        assert.ok(
            test,
            `Bug regressed (Go switch/case): expected 'test' case branch in Go switch. Got: ${JSON.stringify(branches)}`,
        );
        assert.ok(
            def,
            `Bug regressed (Go switch/case): expected 'default' case branch in Go switch. Got: ${JSON.stringify(branches)}`,
        );
    });

    test('Go switch with only default case still produces a default branch', async () => {
        const code = [
            `package main`,                                                  // 0
            `func main() {`,                                                  // 1
            `    client := posthog.New("phc_token")`,                         // 2
            `    v, _ := client.GetFeatureFlag("only-default")`,              // 3
            `    switch v {`,                                                 // 4
            `    default:`,                                                   // 5
            `        fmt.Println("d")`,                                       // 6
            `    }`,                                                          // 7
            `}`,                                                              // 8
        ].join('\n');

        const branches = await ts.findVariantBranches(mockDoc(code));
        const exp = branches.filter(b => b.flagKey === 'only-default');

        const def = exp.find(b => b.variantKey === 'default');
        assert.ok(
            def,
            `Bug regressed (Go switch/case): expected 'default' branch from default_case node. Got: ${JSON.stringify(branches)}`,
        );
    });
});
