import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fc from 'fast-check';
import { TreeSitterService } from '../../services/treeSitterService';

// ── Mock document ──

function mockDoc(code: string, languageId: string): vscode.TextDocument {
    const lines = code.split('\n');
    const ext =
        languageId === 'python' ? 'py' :
            languageId === 'go' ? 'go' :
                languageId === 'ruby' ? 'rb' :
                    languageId === 'typescript' ? 'ts' :
                        'js';
    return {
        getText: () => code,
        languageId,
        lineAt: (n: number) => ({
            text: lines[n] ?? '',
            range: new vscode.Range(n, 0, n, (lines[n] ?? '').length),
            firstNonWhitespaceCharacterIndex: (lines[n] ?? '').search(/\S/),
        }),
        uri: vscode.Uri.parse(`file:///test.${ext}`),
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

// ── Test suite ──

suite('Tree-sitter Fuzz Tests', function () {
    this.timeout(60000);

    let ts: TreeSitterService;

    suiteSetup(async () => {
        ts = new TreeSitterService();
        const ext = vscode.extensions.all.find(e => e.id.toLowerCase().includes('posthog'));
        const extensionPath = ext?.extensionPath ?? path.resolve(__dirname, '../../..');
        await ts.initialize(extensionPath);
        ts.updateConfig({
            additionalClientNames: [],
            additionalFlagFunctions: [],
            detectNestedClients: true,
        });
    });

    // ═══════════════════════════════════════════════════
    // Random unicode garbage
    // ═══════════════════════════════════════════════════

    test('parser does not crash on random unicode', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.string({ unit: 'binary', maxLength: 200 }),
                fc.constantFrom('javascript', 'python', 'go', 'ruby') as fc.Arbitrary<'javascript' | 'python' | 'go' | 'ruby'>,
                async (junk, lang) => {
                    try {
                        await ts.findPostHogCalls(mockDoc(junk, lang));
                        await ts.findVariantBranches(mockDoc(junk, lang));
                        await ts.findInitCalls(mockDoc(junk, lang));
                        return true;
                    } catch (err) {
                        // Fail loudly so the failing input is reported by fast-check
                        console.error(`Crashed on input (${lang}): ${JSON.stringify(junk)}`);
                        console.error(err);
                        return false;
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    // ═══════════════════════════════════════════════════
    // Random ASCII garbage that mixes PostHog-like tokens
    // ═══════════════════════════════════════════════════

    test('parser does not crash on random ASCII with PostHog-like tokens', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(
                    fc.constantFrom(
                        'posthog', '.', '(', ')', '{', '}', '[', ']', "'", '"', ',', ';', ' ', '\n',
                        'getFeatureFlag', 'capture', 'isFeatureEnabled', 'init', 'new', 'PostHog',
                        'flag', 'event', 'phc_token', '===', 'if', 'else', 'else if'
                    ),
                    { minLength: 1, maxLength: 50 }
                ),
                fc.constantFrom('javascript', 'python', 'go', 'ruby') as fc.Arbitrary<'javascript' | 'python' | 'go' | 'ruby'>,
                async (parts, lang) => {
                    const junk = parts.join('');
                    try {
                        await ts.findPostHogCalls(mockDoc(junk, lang));
                        await ts.findVariantBranches(mockDoc(junk, lang));
                        await ts.findInitCalls(mockDoc(junk, lang));
                        return true;
                    } catch (err) {
                        console.error(`Crashed on token-soup input (${lang}): ${JSON.stringify(junk)}`);
                        console.error(err);
                        return false;
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    // ═══════════════════════════════════════════════════
    // Truncated PostHog calls — incrementally cut-off snippets
    // ═══════════════════════════════════════════════════

    test('parser does not crash on truncated PostHog calls', async () => {
        const truncations = [
            `posthog.`,
            `posthog.get`,
            `posthog.getFeatureFlag`,
            `posthog.getFeatureFlag(`,
            `posthog.getFeatureFlag('`,
            `posthog.getFeatureFlag('flag`,
            `posthog.getFeatureFlag('flag'`,
            `posthog.getFeatureFlag('flag')`,
            `if (posthog.getFeatureFlag('flag') ===`,
            `if (posthog.getFeatureFlag('flag') === '`,
            `if (posthog.getFeatureFlag('flag') === 'control'`,
            `if (posthog.getFeatureFlag('flag') === 'control') {`,
            `case 'control`,
            `switch (`,
            `posthog.capture(`,
            `posthog.capture('`,
            `posthog.capture('event`,
            `posthog.init(`,
            `posthog.init('phc_`,
            `posthog.init('phc_token', { api_host:`,
            `new PostHog(`,
            `const client = new PostHog('phc_`,
        ];
        for (const code of truncations) {
            try {
                await ts.findPostHogCalls(mockDoc(code, 'javascript'));
                await ts.findVariantBranches(mockDoc(code, 'javascript'));
                await ts.findInitCalls(mockDoc(code, 'javascript'));
            } catch (err) {
                assert.fail(`Crashed on truncation: ${JSON.stringify(code)}: ${err}`);
            }
        }
    });

    // ═══════════════════════════════════════════════════
    // Truncated Python calls
    // ═══════════════════════════════════════════════════

    test('parser does not crash on truncated Python PostHog calls', async () => {
        const truncations = [
            `posthog.`,
            `posthog.get_feature_flag`,
            `posthog.get_feature_flag(`,
            `posthog.get_feature_flag("`,
            `posthog.get_feature_flag("flag"`,
            `posthog.get_feature_flag("flag", "user`,
            `posthog.capture(distinct_id=`,
            `posthog.capture(distinct_id="u1", event=`,
            `client = Posthog(`,
            `client = Posthog("phc_`,
            `if posthog.get_feature_flag("flag", "u1") ==`,
            `if posthog.get_feature_flag("flag", "u1") == "control":`,
        ];
        for (const code of truncations) {
            try {
                await ts.findPostHogCalls(mockDoc(code, 'python'));
                await ts.findVariantBranches(mockDoc(code, 'python'));
                await ts.findInitCalls(mockDoc(code, 'python'));
            } catch (err) {
                assert.fail(`Crashed on Python truncation: ${JSON.stringify(code)}: ${err}`);
            }
        }
    });

    // ═══════════════════════════════════════════════════
    // Empty documents
    // ═══════════════════════════════════════════════════

    test('parser handles empty documents', async () => {
        for (const lang of ['javascript', 'python', 'go', 'ruby']) {
            const calls = await ts.findPostHogCalls(mockDoc('', lang));
            const branches = await ts.findVariantBranches(mockDoc('', lang));
            const inits = await ts.findInitCalls(mockDoc('', lang));
            assert.strictEqual(calls.length, 0, `${lang}: empty doc should yield 0 calls`);
            assert.strictEqual(branches.length, 0, `${lang}: empty doc should yield 0 branches`);
            assert.strictEqual(inits.length, 0, `${lang}: empty doc should yield 0 inits`);
        }
    });

    // ═══════════════════════════════════════════════════
    // Single suspicious characters
    // ═══════════════════════════════════════════════════

    test('parser handles single character documents', async () => {
        for (const lang of ['javascript', 'python', 'go', 'ruby']) {
            for (const c of ['a', '(', '"', '\\', '\n', "'", '{', '}', '.', ',', ';', ' ', '\t', '0']) {
                const calls = await ts.findPostHogCalls(mockDoc(c, lang));
                assert.strictEqual(calls.length, 0, `${lang}: char ${JSON.stringify(c)} should yield 0 calls`);
            }
        }
    });

    // ═══════════════════════════════════════════════════
    // Deeply nested calls — make sure parser doesn't blow up
    // ═══════════════════════════════════════════════════

    test('parser handles deeply nested wrapped calls', async () => {
        let code = `posthog.getFeatureFlag('inner')`;
        for (let i = 0; i < 50; i++) { code = `(${code})`; }
        // Should not crash; we don't assert on detection here
        await ts.findPostHogCalls(mockDoc(code, 'javascript'));
        await ts.findVariantBranches(mockDoc(code, 'javascript'));
    });

    // ═══════════════════════════════════════════════════
    // Very long lines
    // ═══════════════════════════════════════════════════

    test('parser handles very long lines', async () => {
        const longKey = 'x'.repeat(5000);
        const code = `posthog.getFeatureFlag('${longKey}')`;
        const calls = await ts.findPostHogCalls(mockDoc(code, 'javascript'));
        // Whether it's detected or not, must not crash
        assert.ok(Array.isArray(calls));
    });

    // ═══════════════════════════════════════════════════
    // Many lines (stress test)
    // ═══════════════════════════════════════════════════

    test('parser handles many short lines', async () => {
        const lines: string[] = [];
        for (let i = 0; i < 1000; i++) { lines.push(`posthog.capture('event_${i}');`); }
        const code = lines.join('\n');
        const calls = await ts.findPostHogCalls(mockDoc(code, 'javascript'));
        assert.ok(Array.isArray(calls));
        // Sanity: should detect a meaningful number of events
        assert.ok(calls.length > 0, 'should detect at least one event in 1000-line file');
    });

    // ═══════════════════════════════════════════════════
    // Unbalanced braces / brackets / parens
    // ═══════════════════════════════════════════════════

    test('parser does not crash on unbalanced delimiters', async () => {
        const inputs = [
            '({[',
            '}])',
            '(((((',
            ')))))',
            `posthog.getFeatureFlag('unclosed`,
            `posthog.getFeatureFlag("unclosed`,
            `posthog.getFeatureFlag(`,
            `posthog.getFeatureFlag()`,
            `posthog..getFeatureFlag('x')`,
            `posthog.getFeatureFlag('x'))))))`,
        ];
        for (const code of inputs) {
            for (const lang of ['javascript', 'python', 'go', 'ruby']) {
                try {
                    await ts.findPostHogCalls(mockDoc(code, lang));
                    await ts.findVariantBranches(mockDoc(code, lang));
                    await ts.findInitCalls(mockDoc(code, lang));
                } catch (err) {
                    assert.fail(`Crashed on unbalanced (${lang}): ${JSON.stringify(code)}: ${err}`);
                }
            }
        }
    });

    // ═══════════════════════════════════════════════════
    // Null bytes and control characters
    // ═══════════════════════════════════════════════════

    test('parser does not crash on null bytes and control characters', async () => {
        const inputs = [
            '\0',
            'posthog.getFeatureFlag(\0)',
            `posthog.getFeatureFlag('\0')`,
            '\u0001\u0002\u0003',
            `posthog.getFeatureFlag('flag\u0007key')`,
        ];
        for (const code of inputs) {
            for (const lang of ['javascript', 'python', 'go', 'ruby']) {
                try {
                    await ts.findPostHogCalls(mockDoc(code, lang));
                    await ts.findVariantBranches(mockDoc(code, lang));
                    await ts.findInitCalls(mockDoc(code, lang));
                } catch (err) {
                    assert.fail(`Crashed on control-chars (${lang}): ${JSON.stringify(code)}: ${err}`);
                }
            }
        }
    });
});
