import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { TreeSitterService, PostHogCall, VariantBranch, PostHogInitCall } from '../../services/treeSitterService';

// ── Mock document ──

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

// ── Helpers ──

function findCall(calls: PostHogCall[], method: string, key: string): PostHogCall | undefined {
    return calls.find(c => c.method === method && c.key === key);
}

function findBranch(branches: VariantBranch[], flagKey: string, variantKey: string): VariantBranch | undefined {
    return branches.find(b => b.flagKey === flagKey && b.variantKey === variantKey);
}

// ── Test suite ──

suite('Go Snapshot Tests', function () {
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
    // Language support
    // ═══════════════════════════════════════════════════

    suite('Language support', () => {
        test('go is a supported language', () => {
            assert.ok(ts.isSupported('go'));
        });

        test('supportedLanguages includes go', () => {
            assert.ok(ts.supportedLanguages.includes('go'));
        });
    });

    // ═══════════════════════════════════════════════════
    // findPostHogCalls — Simple string arg
    // ═══════════════════════════════════════════════════

    suite('Simple string arg calls', () => {
        test('GetFeatureFlag with string arg', async () => {
            const code = [
                `package main`,
                `func main() {`,
                `    client := posthog.New("phc_token")`,
                `    flag, _ := client.GetFeatureFlag("my-flag")`,
                `}`,
            ].join('\n');
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'GetFeatureFlag', 'my-flag'), 'should detect GetFeatureFlag');
        });

        test('IsFeatureEnabled with string arg', async () => {
            const code = [
                `package main`,
                `func main() {`,
                `    client := posthog.New("phc_token")`,
                `    enabled, _ := client.IsFeatureEnabled("beta")`,
                `}`,
            ].join('\n');
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'IsFeatureEnabled', 'beta'), 'should detect IsFeatureEnabled');
        });

        test('GetFeatureFlagPayload with string arg', async () => {
            const code = [
                `package main`,
                `func main() {`,
                `    client := posthog.New("phc_token")`,
                `    payload, _ := client.GetFeatureFlagPayload("config")`,
                `}`,
            ].join('\n');
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'GetFeatureFlagPayload', 'config'), 'should detect GetFeatureFlagPayload');
        });

        test('multiple calls on different lines', async () => {
            const code = [
                `package main`,
                `func main() {`,
                `    client := posthog.New("phc_token")`,
                `    a, _ := client.GetFeatureFlag("flag-a")`,
                `    b, _ := client.IsFeatureEnabled("flag-b")`,
                `    c, _ := client.GetFeatureFlagPayload("flag-c")`,
                `}`,
            ].join('\n');
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'GetFeatureFlag', 'flag-a'));
            assert.ok(findCall(calls, 'IsFeatureEnabled', 'flag-b'));
            assert.ok(findCall(calls, 'GetFeatureFlagPayload', 'flag-c'));
        });
    });

    // ═══════════════════════════════════════════════════
    // findPostHogCalls — Struct-based calls
    // ═══════════════════════════════════════════════════

    suite('Struct-based calls', () => {
        test('Enqueue(posthog.Capture{Event: "purchase"})', async () => {
            const code = [
                `package main`,
                `func main() {`,
                `    client := posthog.New("phc_token")`,
                `    client.Enqueue(posthog.Capture{DistinctId: "u1", Event: "purchase"})`,
                `}`,
            ].join('\n');
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'capture', 'purchase'), 'should detect Enqueue as capture with Event field');
        });

        test('GetFeatureFlag(posthog.FeatureFlagPayload{Key: "struct-flag"})', async () => {
            const code = [
                `package main`,
                `func main() {`,
                `    client := posthog.New("phc_token")`,
                `    flag, _ := client.GetFeatureFlag(posthog.FeatureFlagPayload{Key: "struct-flag", DistinctId: "u1"})`,
                `}`,
            ].join('\n');
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'GetFeatureFlag', 'struct-flag'), 'should detect struct-based flag call');
        });

        test('IsFeatureEnabled with struct', async () => {
            const code = [
                `package main`,
                `func main() {`,
                `    client := posthog.New("phc_token")`,
                `    enabled, _ := client.IsFeatureEnabled(posthog.FeatureFlagPayload{Key: "struct-enabled", DistinctId: "u1"})`,
                `}`,
            ].join('\n');
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'IsFeatureEnabled', 'struct-enabled'));
        });

        test('multiline struct capture', async () => {
            const code = [
                `package main`,
                `func main() {`,
                `    client := posthog.New("phc_token")`,
                `    client.Enqueue(posthog.Capture{`,
                `        DistinctId: "user-1",`,
                `        Event:      "multiline_event",`,
                `    })`,
                `}`,
            ].join('\n');
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'capture', 'multiline_event'), 'should detect multiline struct capture');
        });
    });

    // ═══════════════════════════════════════════════════
    // findPostHogCalls — Constructor alias
    // ═══════════════════════════════════════════════════

    suite('Constructor alias detection', () => {
        test('posthog.New creates alias', async () => {
            const code = [
                `package main`,
                `func main() {`,
                `    myClient := posthog.New("phc_token")`,
                `    myClient.GetFeatureFlag("alias-flag")`,
                `}`,
            ].join('\n');
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'GetFeatureFlag', 'alias-flag'), 'should detect call on posthog.New alias');
        });

        test('posthog.NewWithConfig creates alias (with error)', async () => {
            const code = [
                `package main`,
                `func main() {`,
                `    c, _ := posthog.NewWithConfig("phc_token", posthog.Config{})`,
                `    c.GetFeatureFlag("config-alias-flag")`,
                `}`,
            ].join('\n');
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'GetFeatureFlag', 'config-alias-flag'), 'should detect call on NewWithConfig alias');
        });
    });

    // ═══════════════════════════════════════════════════
    // findPostHogCalls — Edge cases
    // ═══════════════════════════════════════════════════

    suite('Edge cases', () => {
        test('non-PostHog method is ignored', async () => {
            const code = [
                `package main`,
                `func main() {`,
                `    client := posthog.New("phc_token")`,
                `    client.Close()`,
                `}`,
            ].join('\n');
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.strictEqual(calls.length, 0);
        });

        test('non-PostHog client is ignored', async () => {
            const code = [
                `package main`,
                `func main() {`,
                `    analytics.GetFeatureFlag("wrong-client")`,
                `}`,
            ].join('\n');
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.strictEqual(calls.length, 0);
        });

        test('flag key with special characters', async () => {
            const code = [
                `package main`,
                `func main() {`,
                `    client := posthog.New("phc_token")`,
                `    client.GetFeatureFlag("my-flag_v2.1")`,
                `}`,
            ].join('\n');
            const calls = await ts.findPostHogCalls(mockDoc(code));
            assert.ok(findCall(calls, 'GetFeatureFlag', 'my-flag_v2.1'));
        });
    });

    // ═══════════════════════════════════════════════════
    // findVariantBranches
    // ═══════════════════════════════════════════════════

    suite('Variant branch detection', () => {
        test('if/else if/else chain from variable', async () => {
            const code = [
                `package main`,
                `func main() {`,
                `    client := posthog.New("phc_token")`,
                `    v, _ := client.GetFeatureFlag("experiment")`,
                `    if v == "control" {`,
                `        fmt.Println("a")`,
                `    } else if v == "test" {`,
                `        fmt.Println("b")`,
                `    } else {`,
                `        fmt.Println("c")`,
                `    }`,
                `}`,
            ].join('\n');
            const branches = await ts.findVariantBranches(mockDoc(code));
            assert.ok(findBranch(branches, 'experiment', 'control'), 'should detect control');
            assert.ok(findBranch(branches, 'experiment', 'test'), 'should detect test');
        });

        test('switch statement', async () => {
            const code = [
                `package main`,
                `func main() {`,
                `    client := posthog.New("phc_token")`,
                `    v, _ := client.GetFeatureFlag("switch-exp")`,
                `    switch v {`,
                `    case "a":`,
                `        fmt.Println("a")`,
                `    case "b":`,
                `        fmt.Println("b")`,
                `    default:`,
                `        fmt.Println("default")`,
                `    }`,
                `}`,
            ].join('\n');
            const branches = await ts.findVariantBranches(mockDoc(code));
            assert.strictEqual(branches.length, 3, `expected 3 branches, got ${branches.length}: ${JSON.stringify(branches)}`);
            assert.ok(findBranch(branches, 'switch-exp', 'a'), 'should detect case "a"');
            assert.ok(findBranch(branches, 'switch-exp', 'b'), 'should detect case "b"');
            assert.ok(findBranch(branches, 'switch-exp', 'default'), 'should detect default');
        });
    });

    // ═══════════════════════════════════════════════════
    // findInitCalls
    // ═══════════════════════════════════════════════════

    suite('Init detection', () => {
        test('posthog.New("token")', async () => {
            const code = [
                `package main`,
                `func main() {`,
                `    client := posthog.New("phc_abc")`,
                `}`,
            ].join('\n');
            const inits = await ts.findInitCalls(mockDoc(code));
            assert.strictEqual(inits.length, 1);
            assert.strictEqual(inits[0].token, 'phc_abc');
            assert.strictEqual(inits[0].apiHost, null);
        });

        test('posthog.NewWithConfig with Endpoint', async () => {
            const code = [
                `package main`,
                `func main() {`,
                `    client, _ := posthog.NewWithConfig("phc_xyz", posthog.Config{Endpoint: "https://eu.posthog.com"})`,
                `}`,
            ].join('\n');
            const inits = await ts.findInitCalls(mockDoc(code));
            assert.strictEqual(inits.length, 1);
            assert.strictEqual(inits[0].token, 'phc_xyz');
            assert.strictEqual(inits[0].apiHost, 'https://eu.posthog.com');
        });

        test('non-posthog constructor is ignored', async () => {
            const code = [
                `package main`,
                `func main() {`,
                `    client := analytics.New("not_posthog")`,
                `}`,
            ].join('\n');
            const inits = await ts.findInitCalls(mockDoc(code));
            assert.strictEqual(inits.length, 0);
        });
    });

    // ═══════════════════════════════════════════════════
    // Cross-language parity
    // ═══════════════════════════════════════════════════

    suite('Cross-language parity', () => {
        test('same flag key detected in Go and JS', async () => {
            const goCode = [
                `package main`,
                `func main() {`,
                `    client := posthog.New("phc_token")`,
                `    client.GetFeatureFlag("shared-flag")`,
                `}`,
            ].join('\n');
            const jsCode = `const flag = posthog.getFeatureFlag('shared-flag');`;

            const goCalls = await ts.findPostHogCalls(mockDoc(goCode, 'go'));
            const jsCalls = await ts.findPostHogCalls(mockDoc(jsCode, 'javascript'));

            const goFlag = goCalls.find(c => c.key === 'shared-flag');
            const jsFlag = jsCalls.find(c => c.key === 'shared-flag');
            assert.ok(goFlag, 'Go should detect shared-flag');
            assert.ok(jsFlag, 'JS should detect shared-flag');
        });
    });
});
