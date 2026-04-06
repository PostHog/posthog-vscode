import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { TreeSitterService, PostHogCall, VariantBranch, PostHogInitCall } from '../../services/treeSitterService';

// ── Mock document ──

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

// ── Helpers ──

function findCall(calls: PostHogCall[], method: string, key: string): PostHogCall | undefined {
    return calls.find(c => c.method === method && c.key === key);
}

function findBranch(branches: VariantBranch[], flagKey: string, variantKey: string): VariantBranch | undefined {
    return branches.find(b => b.flagKey === flagKey && b.variantKey === variantKey);
}

// ── Test suite ──

suite('Ruby Snapshot Tests', function () {
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

    // ═══════════════════════════════════════════════════
    // Language support
    // ═══════════════════════════════════════════════════

    test('ruby is a supported language', () => {
        assert.ok(ts.isSupported('ruby'));
    });

    // ═══════════════════════════════════════════════════
    // findPostHogCalls — flag methods
    // ═══════════════════════════════════════════════════

    suite('Flag method calls', () => {
        test('get_feature_flag with string arg', async () => {
            const code = `posthog.get_feature_flag('my-flag', 'user-1')`;
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'get_feature_flag', 'my-flag'), 'should detect get_feature_flag');
        });

        test('is_feature_enabled with string arg', async () => {
            const code = `posthog.is_feature_enabled('beta-feature', 'user-1')`;
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'is_feature_enabled', 'beta-feature'), 'should detect is_feature_enabled');
        });

        test('get_feature_flag_payload with string arg', async () => {
            const code = `posthog.get_feature_flag_payload('config-flag', 'user-1')`;
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'get_feature_flag_payload', 'config-flag'), 'should detect get_feature_flag_payload');
        });

        test('get_remote_config_payload', async () => {
            const code = `posthog.get_remote_config_payload('remote-key')`;
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'get_remote_config_payload', 'remote-key'), 'should detect get_remote_config_payload');
        });

        test('single-quoted and double-quoted strings', async () => {
            const code = [
                `posthog.get_feature_flag('single-quoted', 'user-1')`,
                `posthog.get_feature_flag("double-quoted", "user-1")`,
            ].join('\n');
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'get_feature_flag', 'single-quoted'), 'should detect single-quoted');
            assert.ok(findCall(calls, 'get_feature_flag', 'double-quoted'), 'should detect double-quoted');
        });
    });

    // ═══════════════════════════════════════════════════
    // findPostHogCalls — capture
    // ═══════════════════════════════════════════════════

    suite('Capture detection', () => {
        test('capture with event: keyword arg', async () => {
            const code = `posthog.capture(distinct_id: 'user-1', event: 'purchase_completed')`;
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'capture', 'purchase_completed'), 'should detect capture event');
        });

        test('capture with properties', async () => {
            const code = `posthog.capture(distinct_id: 'user-1', event: 'page_viewed', properties: { page: '/home' })`;
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'capture', 'page_viewed'), 'should detect capture with properties');
        });

        test('capture ignores distinct_id as key', async () => {
            const code = `posthog.capture(distinct_id: 'user-1', event: 'signup')`;
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(!findCall(calls, 'capture', 'user-1'), 'should NOT detect distinct_id as event name');
            assert.ok(findCall(calls, 'capture', 'signup'), 'should detect event name');
        });
    });

    // ═══════════════════════════════════════════════════
    // Constructor alias detection
    // ═══════════════════════════════════════════════════

    suite('Constructor alias', () => {
        test('PostHog::Client.new assigns a client alias', async () => {
            const code = [
                `my_client = PostHog::Client.new(api_key: 'phc_token', host: 'https://us.posthog.com')`,
                `my_client.get_feature_flag('test-flag', 'user-1')`,
            ].join('\n');
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'get_feature_flag', 'test-flag'), 'should detect call on constructor alias');
        });
    });

    // ═══════════════════════════════════════════════════
    // Client alias detection
    // ═══════════════════════════════════════════════════

    suite('Client alias', () => {
        test('ph = posthog alias', async () => {
            const code = [
                `ph = posthog`,
                `ph.get_feature_flag('alias-flag', 'user-1')`,
            ].join('\n');
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'get_feature_flag', 'alias-flag'), 'should detect call on alias');
        });
    });

    // ═══════════════════════════════════════════════════
    // Constant resolution
    // ═══════════════════════════════════════════════════

    suite('Constant resolution', () => {
        test('UPPER_CASE constant resolved for flag', async () => {
            const code = [
                `FLAG_KEY = 'my-flag'`,
                `posthog.get_feature_flag(FLAG_KEY, 'user-1')`,
            ].join('\n');
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'get_feature_flag', 'my-flag'), 'should resolve constant');
        });

        test('lowercase variable resolved for flag', async () => {
            const code = [
                `flag_key = 'another-flag'`,
                `posthog.is_feature_enabled(flag_key, 'user-1')`,
            ].join('\n');
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'is_feature_enabled', 'another-flag'), 'should resolve local variable');
        });
    });

    // ═══════════════════════════════════════════════════
    // findVariantBranches
    // ═══════════════════════════════════════════════════

    suite('Variant branches', () => {
        test('if/elsif/else with string comparison', async () => {
            const code = [
                `flag = posthog.get_feature_flag('experiment', 'user-1')`,
                `if flag == 'control'`,
                `  puts 'Control'`,
                `elsif flag == 'test'`,
                `  puts 'Test'`,
                `else`,
                `  puts 'Default'`,
                `end`,
            ].join('\n');
            const branches = await ts.findVariantBranches(mockDoc(code));
            assert.ok(findBranch(branches, 'experiment', 'control'), 'should detect control');
            assert.ok(findBranch(branches, 'experiment', 'test'), 'should detect test');
            assert.ok(findBranch(branches, 'experiment', 'else'), 'should detect else');
        });

        test('boolean flag: if enabled / else', async () => {
            const code = [
                `enabled = posthog.is_feature_enabled('beta', 'user-1')`,
                `if enabled`,
                `  puts 'ON'`,
                `else`,
                `  puts 'OFF'`,
                `end`,
            ].join('\n');
            const branches = await ts.findVariantBranches(mockDoc(code));
            assert.ok(findBranch(branches, 'beta', 'true'), 'should detect truthiness');
            assert.ok(findBranch(branches, 'beta', 'false'), 'should detect else as false');
        });

        test('negated boolean: if !enabled', async () => {
            const code = [
                `enabled = posthog.is_feature_enabled('beta', 'user-1')`,
                `if !enabled`,
                `  puts 'OFF'`,
                `else`,
                `  puts 'ON'`,
                `end`,
            ].join('\n');
            const branches = await ts.findVariantBranches(mockDoc(code));
            assert.ok(findBranch(branches, 'beta', 'false'), 'should detect negated as false');
            assert.ok(findBranch(branches, 'beta', 'true'), 'should detect else as true');
        });

        test('case/when statement', async () => {
            const code = [
                `flag = posthog.get_feature_flag('case-exp', 'user-1')`,
                `case flag`,
                `when 'a'`,
                `  puts 'A'`,
                `when 'b'`,
                `  puts 'B'`,
                `else`,
                `  puts 'Default'`,
                `end`,
            ].join('\n');
            const branches = await ts.findVariantBranches(mockDoc(code));
            assert.strictEqual(branches.length, 3, `expected 3 branches, got ${branches.length}: ${JSON.stringify(branches)}`);
            assert.ok(findBranch(branches, 'case-exp', 'a'), 'should detect when "a"');
            assert.ok(findBranch(branches, 'case-exp', 'b'), 'should detect when "b"');
            assert.ok(findBranch(branches, 'case-exp', 'default'), 'should detect else as default');
        });

        test('inline flag comparison in if', async () => {
            const code = [
                `if posthog.get_feature_flag('inline-flag', 'user-1') == 'variant-a'`,
                `  puts 'A'`,
                `else`,
                `  puts 'Else'`,
                `end`,
            ].join('\n');
            const branches = await ts.findVariantBranches(mockDoc(code));
            assert.ok(findBranch(branches, 'inline-flag', 'variant-a'), 'should detect inline variant');
            assert.ok(findBranch(branches, 'inline-flag', 'else'), 'should detect else');
        });

        test('inline is_feature_enabled in if', async () => {
            const code = [
                `if posthog.is_feature_enabled('inline-bool', 'user-1')`,
                `  puts 'Enabled'`,
                `else`,
                `  puts 'Disabled'`,
                `end`,
            ].join('\n');
            const branches = await ts.findVariantBranches(mockDoc(code));
            assert.ok(findBranch(branches, 'inline-bool', 'true'), 'should detect enabled');
            assert.ok(findBranch(branches, 'inline-bool', 'false'), 'should detect disabled');
        });

        test('constant resolved in flag assignment for variant branches', async () => {
            const code = [
                `FLAG = 'resolved-flag'`,
                `v = posthog.get_feature_flag(FLAG, 'user-1')`,
                `if v == 'a'`,
                `  puts 'A'`,
                `end`,
            ].join('\n');
            const branches = await ts.findVariantBranches(mockDoc(code));
            assert.ok(findBranch(branches, 'resolved-flag', 'a'), 'should resolve constant and detect variant');
        });
    });

    // ═══════════════════════════════════════════════════
    // findInitCalls
    // ═══════════════════════════════════════════════════

    suite('Init detection', () => {
        test('PostHog::Client.new with api_key keyword arg', async () => {
            const code = [
                `posthog = PostHog::Client.new(`,
                `  api_key: 'phc_abc',`,
                `  host: 'https://us.posthog.com'`,
                `)`,
            ].join('\n');
            const inits = await ts.findInitCalls(mockDoc(code));
            assert.strictEqual(inits.length, 1, 'should detect one init call');
            assert.strictEqual(inits[0].token, 'phc_abc');
            assert.strictEqual(inits[0].apiHost, 'https://us.posthog.com');
        });

        test('single-line PostHog::Client.new', async () => {
            const code = `posthog = PostHog::Client.new(api_key: 'phc_xyz', host: 'https://eu.posthog.com')`;
            const inits = await ts.findInitCalls(mockDoc(code));
            assert.strictEqual(inits.length, 1, 'should detect init call');
            assert.strictEqual(inits[0].token, 'phc_xyz');
            assert.strictEqual(inits[0].apiHost, 'https://eu.posthog.com');
        });

        test('multiple init calls detected', async () => {
            const code = [
                `a = PostHog::Client.new(api_key: 'phc_1', host: 'https://us.posthog.com')`,
                `b = PostHog::Client.new(api_key: 'phc_2', host: 'https://eu.posthog.com')`,
            ].join('\n');
            const inits = await ts.findInitCalls(mockDoc(code));
            assert.strictEqual(inits.length, 2, 'should detect two init calls');
        });
    });

    // ═══════════════════════════════════════════════════
    // Cross-language parity
    // ═══════════════════════════════════════════════════

    suite('Cross-language parity', () => {
        test('same flag key detected in Ruby and JS', async () => {
            const rbCode = `posthog.get_feature_flag('shared-flag', 'user-1')`;
            const jsCode = `posthog.getFeatureFlag('shared-flag')`;

            const rbCalls = await ts.findPostHogCalls(mockDoc(rbCode, 'ruby'));
            const jsCalls = await ts.findPostHogCalls(mockDoc(jsCode, 'javascript'));

            const rbFlag = findCall(rbCalls, 'get_feature_flag', 'shared-flag');
            const jsFlag = findCall(jsCalls, 'getFeatureFlag', 'shared-flag');

            assert.ok(rbFlag, 'Ruby should detect shared-flag');
            assert.ok(jsFlag, 'JS should detect shared-flag');
            assert.strictEqual(rbFlag!.key, jsFlag!.key, 'keys should match across languages');
        });
    });
});
