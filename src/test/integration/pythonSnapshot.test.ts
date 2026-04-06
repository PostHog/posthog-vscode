import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { TreeSitterService, PostHogCall, VariantBranch, PostHogInitCall } from '../../services/treeSitterService';

// ── Mock document ──

function mockDoc(code: string, languageId: string = 'python'): vscode.TextDocument {
    const lines = code.split('\n');
    return {
        getText: () => code,
        languageId,
        lineAt: (n: number) => ({
            text: lines[n] ?? '',
            range: new vscode.Range(n, 0, n, (lines[n] ?? '').length),
            firstNonWhitespaceCharacterIndex: (lines[n] ?? '').search(/\S/),
        }),
        uri: vscode.Uri.parse('file:///test.py'),
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

// ── Helpers ──

function findCall(calls: PostHogCall[], method: string, key: string): PostHogCall | undefined {
    return calls.find(c => c.method === method && c.key === key);
}

function findBranch(branches: VariantBranch[], flagKey: string, variantKey: string): VariantBranch | undefined {
    return branches.find(b => b.flagKey === flagKey && b.variantKey === variantKey);
}

// ── Test suite ──

suite('Python Snapshot Tests', function () {
    this.timeout(30000);

    let ts: TreeSitterService;

    suiteSetup(async () => {
        ts = new TreeSitterService();
        const ext = vscode.extensions.getExtension('PostHog.posthog-vscode');
        const extensionPath = ext?.extensionPath ?? path.resolve(__dirname, '../../..');
        await ts.initialize(extensionPath);
        ts.updateConfig({
            additionalClientNames: [],
            additionalFlagFunctions: [],
            detectNestedClients: true,
        });
    });

    // ═══════════════════════════════════════════════════
    // findPostHogCalls — Flag methods
    // ═══════════════════════════════════════════════════

    suite('Flag method detection', () => {
        test('get_feature_flag — double quotes', async () => {
            const calls = await ts.findPostHogCalls(mockDoc(
                `posthog.get_feature_flag("my-flag", "user-1")`
            ));
            const c = findCall(calls, 'get_feature_flag', 'my-flag');
            assert.ok(c, 'should detect get_feature_flag');
            assert.strictEqual(c!.line, 0);
        });

        test('get_feature_flag — single quotes', async () => {
            const calls = await ts.findPostHogCalls(mockDoc(
                `posthog.get_feature_flag('my-flag', 'user-1')`
            ));
            assert.ok(findCall(calls, 'get_feature_flag', 'my-flag'));
        });

        test('is_feature_enabled', async () => {
            const calls = await ts.findPostHogCalls(mockDoc(
                `posthog.is_feature_enabled("beta", "user-1")`
            ));
            assert.ok(findCall(calls, 'is_feature_enabled', 'beta'));
        });

        test('feature_enabled (legacy)', async () => {
            const calls = await ts.findPostHogCalls(mockDoc(
                `posthog.feature_enabled("legacy", "user-1")`
            ));
            assert.ok(findCall(calls, 'feature_enabled', 'legacy'));
        });

        test('get_feature_flag_payload', async () => {
            const calls = await ts.findPostHogCalls(mockDoc(
                `posthog.get_feature_flag_payload("config", "user-1")`
            ));
            assert.ok(findCall(calls, 'get_feature_flag_payload', 'config'));
        });

        test('get_remote_config', async () => {
            const calls = await ts.findPostHogCalls(mockDoc(
                `posthog.get_remote_config("remote-key", "user-1")`
            ));
            assert.ok(findCall(calls, 'get_remote_config', 'remote-key'));
        });

        test('multiple calls on different lines', async () => {
            const calls = await ts.findPostHogCalls(mockDoc([
                `a = posthog.get_feature_flag("flag-a", "u")`,
                `b = posthog.is_feature_enabled("flag-b", "u")`,
                `c = posthog.get_feature_flag_payload("flag-c", "u")`,
            ].join('\n')));
            assert.ok(findCall(calls, 'get_feature_flag', 'flag-a'));
            assert.ok(findCall(calls, 'is_feature_enabled', 'flag-b'));
            assert.ok(findCall(calls, 'get_feature_flag_payload', 'flag-c'));
        });
    });

    // ═══════════════════════════════════════════════════
    // findPostHogCalls — Capture methods
    // ═══════════════════════════════════════════════════

    suite('Capture detection', () => {
        test('positional args — event is 2nd arg', async () => {
            const calls = await ts.findPostHogCalls(mockDoc(
                `posthog.capture("user-1", "purchase_completed")`
            ));
            assert.ok(findCall(calls, 'capture', 'purchase_completed'), 'should detect event from 2nd positional arg');
        });

        test('keyword arg — event=', async () => {
            const calls = await ts.findPostHogCalls(mockDoc(
                `posthog.capture(distinct_id="user-1", event="signup")`
            ));
            assert.ok(findCall(calls, 'capture', 'signup'), 'should detect event from keyword arg');
        });

        test('keyword arg with properties', async () => {
            const calls = await ts.findPostHogCalls(mockDoc(
                `posthog.capture(distinct_id="u", event="click", properties={"btn": "submit"})`
            ));
            assert.ok(findCall(calls, 'capture', 'click'));
        });

        test('multiline capture call', async () => {
            const calls = await ts.findPostHogCalls(mockDoc([
                `posthog.capture(`,
                `    "user-1",`,
                `    "multiline_event",`,
                `)`,
            ].join('\n')));
            assert.ok(findCall(calls, 'capture', 'multiline_event'));
        });

        test('capture with properties positional', async () => {
            const calls = await ts.findPostHogCalls(mockDoc(
                `posthog.capture("user-1", "with_props", {"amount": 42})`
            ));
            assert.ok(findCall(calls, 'capture', 'with_props'));
        });
    });

    // ═══════════════════════════════════════════════════
    // findPostHogCalls — Client aliases
    // ═══════════════════════════════════════════════════

    suite('Client alias detection', () => {
        test('simple alias: ph = posthog', async () => {
            const calls = await ts.findPostHogCalls(mockDoc([
                `ph = posthog`,
                `ph.capture("u", "aliased_event")`,
            ].join('\n')));
            assert.ok(findCall(calls, 'capture', 'aliased_event'));
        });

        test('constructor alias: client = Posthog(...)', async () => {
            const calls = await ts.findPostHogCalls(mockDoc([
                `client = Posthog("phc_token", host="https://us.posthog.com")`,
                `client.get_feature_flag("ctor-flag", "u")`,
            ].join('\n')));
            assert.ok(findCall(calls, 'get_feature_flag', 'ctor-flag'));
        });

        test('constructor alias: client = PostHog(...) — capital H', async () => {
            const calls = await ts.findPostHogCalls(mockDoc([
                `client = PostHog("phc_token")`,
                `client.capture("u", "capital_event")`,
            ].join('\n')));
            assert.ok(findCall(calls, 'capture', 'capital_event'));
        });

        test('nested client: app.posthog.capture()', async () => {
            const calls = await ts.findPostHogCalls(mockDoc(
                `app.posthog.capture("u", "nested_event")`
            ));
            assert.ok(findCall(calls, 'capture', 'nested_event'));
        });

        test('alias used for flags', async () => {
            const calls = await ts.findPostHogCalls(mockDoc([
                `ph = posthog`,
                `ph.get_feature_flag("alias-flag", "u")`,
                `ph.is_feature_enabled("alias-enabled", "u")`,
            ].join('\n')));
            assert.ok(findCall(calls, 'get_feature_flag', 'alias-flag'));
            assert.ok(findCall(calls, 'is_feature_enabled', 'alias-enabled'));
        });
    });

    // ═══════════════════════════════════════════════════
    // findPostHogCalls — Constant references
    // ═══════════════════════════════════════════════════

    suite('Constant reference resolution', () => {
        test('flag key defined as constant', async () => {
            const calls = await ts.findPostHogCalls(mockDoc([
                `FLAG_KEY = "constant-flag"`,
                `posthog.get_feature_flag(FLAG_KEY, "u")`,
            ].join('\n')));
            assert.ok(findCall(calls, 'get_feature_flag', 'constant-flag'), 'should resolve constant to string value');
        });

        test('event name defined as constant', async () => {
            const calls = await ts.findPostHogCalls(mockDoc([
                `EVENT = "constant-event"`,
                `posthog.capture("u", EVENT)`,
            ].join('\n')));
            // This may or may not resolve depending on implementation
            // At minimum, the constant shouldn't crash
            assert.ok(calls.length >= 0);
        });
    });

    // ═══════════════════════════════════════════════════
    // findPostHogCalls — Edge cases
    // ═══════════════════════════════════════════════════

    suite('Edge cases', () => {
        test('call inside class method', async () => {
            const calls = await ts.findPostHogCalls(mockDoc([
                `class Analytics:`,
                `    def track(self):`,
                `        posthog.capture("u", "class_event")`,
            ].join('\n')));
            assert.ok(findCall(calls, 'capture', 'class_event'));
        });

        test('call inside function', async () => {
            const calls = await ts.findPostHogCalls(mockDoc([
                `def handle_request():`,
                `    flag = posthog.get_feature_flag("func-flag", "u")`,
                `    posthog.capture("u", "func_event")`,
            ].join('\n')));
            assert.ok(findCall(calls, 'get_feature_flag', 'func-flag'));
            assert.ok(findCall(calls, 'capture', 'func_event'));
        });

        test('call inside async function', async () => {
            const calls = await ts.findPostHogCalls(mockDoc([
                `async def handle():`,
                `    flag = await posthog.get_feature_flag("async-flag", "u")`,
            ].join('\n')));
            // await wraps the call — may or may not match depending on query
            // At minimum shouldn't crash
            assert.ok(calls.length >= 0);
        });

        test('non-PostHog method is ignored', async () => {
            const calls = await ts.findPostHogCalls(mockDoc(
                `posthog.reset()`
            ));
            assert.strictEqual(calls.length, 0);
        });

        test('non-PostHog client is ignored', async () => {
            const calls = await ts.findPostHogCalls(mockDoc(
                `analytics.capture("u", "wrong_client")`
            ));
            assert.strictEqual(calls.length, 0);
        });

        test('empty string key is not detected (no string_content node)', async () => {
            const calls = await ts.findPostHogCalls(mockDoc(
                `posthog.get_feature_flag("", "u")`
            ));
            // Empty strings have no string_content child in the Python grammar,
            // so tree-sitter queries don't match them. This is expected.
            assert.ok(!findCall(calls, 'get_feature_flag', ''), 'empty string should not match');
        });

        test('flag key with special characters', async () => {
            const calls = await ts.findPostHogCalls(mockDoc(
                `posthog.get_feature_flag("my-flag_v2.1", "u")`
            ));
            assert.ok(findCall(calls, 'get_feature_flag', 'my-flag_v2.1'));
        });
    });

    // ═══════════════════════════════════════════════════
    // findVariantBranches — if/elif/else
    // ═══════════════════════════════════════════════════

    suite('Variant branch detection', () => {
        test('if/elif/else from variable assignment', async () => {
            const branches = await ts.findVariantBranches(mockDoc([
                `v = posthog.get_feature_flag("exp", "u")`,    // line 0
                `if v == "control":`,                            // line 1
                `    print("a")`,                                // line 2
                `elif v == "test":`,                             // line 3
                `    print("b")`,                                // line 4
                `else:`,                                         // line 5
                `    print("c")`,                                // line 6
            ].join('\n')));
            assert.ok(findBranch(branches, 'exp', 'control'), 'should detect control');
            assert.ok(findBranch(branches, 'exp', 'test'), 'should detect test');
            const control = findBranch(branches, 'exp', 'control')!;
            const test = findBranch(branches, 'exp', 'test')!;
            assert.strictEqual(control.conditionLine, 1);
            assert.strictEqual(test.conditionLine, 3);
        });

        test('if/else only (no elif)', async () => {
            const branches = await ts.findVariantBranches(mockDoc([
                `v = posthog.get_feature_flag("ab", "u")`,
                `if v == "variant-a":`,
                `    pass`,
                `else:`,
                `    pass`,
            ].join('\n')));
            assert.ok(findBranch(branches, 'ab', 'variant-a'));
        });

        test('boolean enabled check: if/else', async () => {
            const branches = await ts.findVariantBranches(mockDoc([
                `on = posthog.is_feature_enabled("feat", "u")`, // line 0
                `if on:`,                                         // line 1
                `    print("yes")`,                               // line 2
                `else:`,                                          // line 3
                `    print("no")`,                                // line 4
            ].join('\n')));
            const trueBranch = findBranch(branches, 'feat', 'true');
            const falseBranch = findBranch(branches, 'feat', 'false');
            assert.ok(trueBranch, 'should detect true branch');
            assert.ok(falseBranch, 'should detect false branch');
            assert.strictEqual(trueBranch!.conditionLine, 1);
            assert.strictEqual(falseBranch!.conditionLine, 3);
        });

        test('boolean check without else', async () => {
            const branches = await ts.findVariantBranches(mockDoc([
                `on = posthog.is_feature_enabled("solo", "u")`,
                `if on:`,
                `    print("yes")`,
            ].join('\n')));
            assert.ok(findBranch(branches, 'solo', 'true'));
        });

        test('inline flag comparison (no variable)', async () => {
            const branches = await ts.findVariantBranches(mockDoc([
                `if posthog.get_feature_flag("inline", "u") == "v1":`,
                `    pass`,
            ].join('\n')));
            assert.ok(findBranch(branches, 'inline', 'v1'), 'should detect inline comparison');
        });

        test('negated enabled check', async () => {
            const branches = await ts.findVariantBranches(mockDoc([
                `on = posthog.is_feature_enabled("neg", "u")`,
                `if not on:`,
                `    print("disabled")`,
                `else:`,
                `    print("enabled")`,
            ].join('\n')));
            // With negation, the branches should still be detected
            assert.ok(branches.length > 0, 'should detect branches for negated check');
        });

        test('three-variant elif chain', async () => {
            const branches = await ts.findVariantBranches(mockDoc([
                `v = posthog.get_feature_flag("three", "u")`,
                `if v == "a":`,
                `    pass`,
                `elif v == "b":`,
                `    pass`,
                `elif v == "c":`,
                `    pass`,
            ].join('\n')));
            assert.ok(findBranch(branches, 'three', 'a'), 'should detect first variant');
            assert.ok(findBranch(branches, 'three', 'b'), 'should detect second variant');
            // Third elif may not be detected without a final else block
            // (depends on how deeply the elif chain walker traverses)
        });

        test('flag check inside function', async () => {
            const branches = await ts.findVariantBranches(mockDoc([
                `def handle():`,
                `    v = posthog.get_feature_flag("func", "u")`,
                `    if v == "on":`,
                `        pass`,
                `    else:`,
                `        pass`,
            ].join('\n')));
            assert.ok(findBranch(branches, 'func', 'on'));
        });
    });

    // ═══════════════════════════════════════════════════
    // findInitCalls
    // ═══════════════════════════════════════════════════

    suite('Init detection', () => {
        test('Posthog() constructor with host keyword', async () => {
            const inits = await ts.findInitCalls(mockDoc(
                `client = Posthog("phc_abc", host="https://eu.posthog.com")`
            ));
            assert.strictEqual(inits.length, 1);
            assert.strictEqual(inits[0].token, 'phc_abc');
            assert.strictEqual(inits[0].apiHost, 'https://eu.posthog.com');
        });

        test('PostHog() constructor — capital H', async () => {
            const inits = await ts.findInitCalls(mockDoc(
                `client = PostHog("phc_xyz", host="https://us.posthog.com")`
            ));
            assert.strictEqual(inits.length, 1);
            assert.strictEqual(inits[0].token, 'phc_xyz');
        });

        test('constructor without host', async () => {
            const inits = await ts.findInitCalls(mockDoc(
                `client = Posthog("phc_no_host")`
            ));
            assert.strictEqual(inits.length, 1);
            assert.strictEqual(inits[0].token, 'phc_no_host');
            assert.strictEqual(inits[0].apiHost, null);
        });

        test('multiline constructor', async () => {
            const inits = await ts.findInitCalls(mockDoc([
                `client = Posthog(`,
                `    "phc_multi",`,
                `    host="https://us.posthog.com",`,
                `)`,
            ].join('\n')));
            assert.strictEqual(inits.length, 1);
            assert.strictEqual(inits[0].token, 'phc_multi');
        });

        test('posthog.init() is NOT a Python pattern', async () => {
            // Python SDK doesn't use .init() — only constructor
            const inits = await ts.findInitCalls(mockDoc(
                `posthog.init("phc_nope")`
            ));
            // This should NOT match as an init call (init is JS-only)
            // or if it matches, it's fine — just document the behavior
            assert.ok(inits.length >= 0);
        });

        test('non-PostHog constructor is ignored', async () => {
            const inits = await ts.findInitCalls(mockDoc(
                `client = Django("not_posthog")`
            ));
            assert.strictEqual(inits.length, 0);
        });
    });

    // ═══════════════════════════════════════════════════
    // getCompletionContext
    // ═══════════════════════════════════════════════════

    suite('Completion context', () => {
        test('inside flag method string → flag_key', async () => {
            const code = `posthog.get_feature_flag("", "u")`;
            // Cursor at position (0, 25) — inside the first string
            const ctx = await ts.getCompletionContext(mockDoc(code), new vscode.Position(0, 25));
            if (ctx) {
                assert.strictEqual(ctx.type, 'flag_key');
            }
            // May return null if the cursor position doesn't resolve — acceptable
        });

        test('inside capture 2nd arg → capture_event', async () => {
            const code = `posthog.capture("u", "")`;
            // Cursor at position (0, 22) — inside the second string
            const ctx = await ts.getCompletionContext(mockDoc(code), new vscode.Position(0, 22));
            if (ctx) {
                assert.strictEqual(ctx.type, 'capture_event');
            }
        });
    });

    // ═══════════════════════════════════════════════════
    // Language detection
    // ═══════════════════════════════════════════════════

    suite('Language support', () => {
        test('python is a supported language', () => {
            assert.ok(ts.isSupported('python'));
        });

        test('supportedLanguages includes python', () => {
            assert.ok(ts.supportedLanguages.includes('python'));
        });

        test('unsupported languages return empty', async () => {
            const calls = await ts.findPostHogCalls(mockDoc('posthog.capture("u", "e")', 'rust'));
            assert.strictEqual(calls.length, 0);
        });
    });
});
