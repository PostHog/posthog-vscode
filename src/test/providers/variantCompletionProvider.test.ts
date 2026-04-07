import * as assert from 'assert';
import * as vscode from 'vscode';
import { VariantCompletionProvider } from '../../providers/variantCompletionProvider';
import { FlagCacheService } from '../../services/flagCacheService';
import { TreeSitterService, CompletionContext } from '../../services/treeSitterService';
import { TelemetryService } from '../../services/telemetryService';
import { FeatureFlag } from '../../models/types';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeMultivariateFlag(key: string, variantKeys: string[]): FeatureFlag {
    return {
        id: 1,
        key,
        name: key,
        active: true,
        filters: {
            multivariate: {
                variants: variantKeys.map(k => ({ key: k, rollout_percentage: Math.floor(100 / variantKeys.length) })),
            },
        },
        rollout_percentage: null,
        created_at: '2024-01-01',
        created_by: null,
        deleted: false,
    };
}

function makeBooleanFlag(key: string): FeatureFlag {
    return {
        id: 1,
        key,
        name: key,
        active: true,
        filters: {},
        rollout_percentage: 100,
        created_at: '2024-01-01',
        created_by: null,
        deleted: false,
    };
}

function fakeFlagCache(flags: FeatureFlag[]): FlagCacheService {
    const cache = new FlagCacheService();
    cache.update(flags);
    return cache;
}

function fakeTreeSitter(opts: {
    isSupported?: boolean;
    context?: CompletionContext | null;
} = {}): TreeSitterService {
    return {
        isSupported: () => opts.isSupported ?? true,
        getCompletionContext: async () => opts.context ?? null,
    } as unknown as TreeSitterService;
}

function fakeTelemetry(): TelemetryService {
    return {
        capture: () => { /* noop */ },
    } as unknown as TelemetryService;
}

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
        uri: vscode.Uri.parse('file:///test.ts'),
        lineCount: lines.length,
    } as unknown as vscode.TextDocument;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('VariantCompletionProvider', () => {

    test('returns variants when assigned to var then compared', async () => {
        const cache = fakeFlagCache([makeMultivariateFlag('multivariate-flag', ['control', 'test', 'red'])]);
        const provider = new VariantCompletionProvider(cache, fakeTreeSitter(), fakeTelemetry());

        // const flag = posthog.getFeatureFlag('multivariate-flag');
        // if (flag === '|') { ... }
        const code = [
            "const flag = posthog.getFeatureFlag('multivariate-flag');",
            "if (flag === '') {",
            "}",
        ].join('\n');
        // Cursor inside the empty string on line 1 → after the opening quote
        const cursorPos = new vscode.Position(1, 14);
        const items = await provider.provideCompletionItems(mockDoc(code, 'typescript'), cursorPos);

        assert.ok(items, 'should return items');
        assert.strictEqual(items!.length, 3, 'should return 3 variants');
        const keys = items!.map(i => i.label);
        assert.ok(keys.includes('control'));
        assert.ok(keys.includes('test'));
        assert.ok(keys.includes('red'));
    });

    test('returns variants for inline call comparison', async () => {
        const cache = fakeFlagCache([makeMultivariateFlag('inline-flag', ['a', 'b'])]);
        const provider = new VariantCompletionProvider(cache, fakeTreeSitter(), fakeTelemetry());

        // if (posthog.getFeatureFlag('inline-flag') === '|') { ... }
        const code = "if (posthog.getFeatureFlag('inline-flag') === '') {";
        // Cursor inside the empty string after the ===
        const cursorPos = new vscode.Position(0, 48);
        const items = await provider.provideCompletionItems(mockDoc(code, 'typescript'), cursorPos);

        assert.ok(items, 'should return items');
        assert.strictEqual(items!.length, 2, 'should return 2 variants for inline call');
        const keys = items!.map(i => i.label);
        assert.ok(keys.includes('a'));
        assert.ok(keys.includes('b'));
    });

    test('returns variants for switch case', async () => {
        const cache = fakeFlagCache([makeMultivariateFlag('switch-flag', ['x', 'y', 'z'])]);
        const provider = new VariantCompletionProvider(cache, fakeTreeSitter(), fakeTelemetry());

        // switch (posthog.getFeatureFlag('switch-flag')) { case '|': ... }
        const code = [
            "switch (posthog.getFeatureFlag('switch-flag')) {",
            "  case '':",
            "    break;",
            "}",
        ].join('\n');
        // Cursor inside the empty string on line 1
        const cursorPos = new vscode.Position(1, 9);
        const items = await provider.provideCompletionItems(mockDoc(code, 'typescript'), cursorPos);

        assert.ok(items, 'should return items');
        assert.strictEqual(items!.length, 3, 'should return 3 variants in switch case');
    });

    test('returns undefined for boolean flag (no variants)', async () => {
        const cache = fakeFlagCache([makeBooleanFlag('boolean-flag')]);
        const provider = new VariantCompletionProvider(cache, fakeTreeSitter(), fakeTelemetry());

        const code = [
            "const flag = posthog.getFeatureFlag('boolean-flag');",
            "if (flag === '') {",
            "}",
        ].join('\n');
        const cursorPos = new vscode.Position(1, 14);
        const items = await provider.provideCompletionItems(mockDoc(code, 'typescript'), cursorPos);

        assert.strictEqual(items, undefined, 'should return undefined for boolean flag');
    });

    test('returns undefined when flag does not exist in cache', async () => {
        const cache = fakeFlagCache([]);
        const provider = new VariantCompletionProvider(cache, fakeTreeSitter(), fakeTelemetry());

        const code = [
            "const flag = posthog.getFeatureFlag('unknown-flag');",
            "if (flag === '') {",
            "}",
        ].join('\n');
        const cursorPos = new vscode.Position(1, 14);
        const items = await provider.provideCompletionItems(mockDoc(code, 'typescript'), cursorPos);

        assert.strictEqual(items, undefined, 'should return undefined when flag missing');
    });

    test('returns undefined when tree-sitter returns a context (already handled)', async () => {
        const cache = fakeFlagCache([makeMultivariateFlag('flag', ['a', 'b'])]);
        const provider = new VariantCompletionProvider(
            cache,
            fakeTreeSitter({ context: { type: 'flag_key' } }),
            fakeTelemetry(),
        );

        const code = [
            "const flag = posthog.getFeatureFlag('flag');",
            "if (flag === '') {",
            "}",
        ].join('\n');
        const cursorPos = new vscode.Position(1, 14);
        const items = await provider.provideCompletionItems(mockDoc(code, 'typescript'), cursorPos);

        assert.strictEqual(items, undefined, 'should defer to other completion provider');
    });

    test('returns undefined when language not supported', async () => {
        const cache = fakeFlagCache([makeMultivariateFlag('flag', ['a', 'b'])]);
        const provider = new VariantCompletionProvider(
            cache,
            fakeTreeSitter({ isSupported: false }),
            fakeTelemetry(),
        );

        const code = "if (flag === '') {}";
        const items = await provider.provideCompletionItems(
            mockDoc(code, 'plaintext'),
            new vscode.Position(0, 14),
        );

        assert.strictEqual(items, undefined);
    });

    test('returns undefined when cursor is not inside a string', async () => {
        const cache = fakeFlagCache([makeMultivariateFlag('flag', ['a', 'b'])]);
        const provider = new VariantCompletionProvider(cache, fakeTreeSitter(), fakeTelemetry());

        const code = [
            "const flag = posthog.getFeatureFlag('flag');",
            "if (flag === 'a') {",
            "}",
        ].join('\n');
        // Cursor on `if` keyword (not in string)
        const cursorPos = new vscode.Position(1, 2);
        const items = await provider.provideCompletionItems(mockDoc(code, 'typescript'), cursorPos);

        assert.strictEqual(items, undefined, 'should not provide variants outside of string');
    });

    test('Python: variant detection works', async () => {
        const cache = fakeFlagCache([makeMultivariateFlag('py-flag', ['control', 'test'])]);
        const provider = new VariantCompletionProvider(cache, fakeTreeSitter(), fakeTelemetry());

        // flag = posthog.get_feature_flag('py-flag', distinct_id)
        // if flag == '|':
        const code = [
            "flag = posthog.get_feature_flag('py-flag', 'user-id')",
            "if flag == '':",
            "    pass",
        ].join('\n');
        const cursorPos = new vscode.Position(1, 13);
        const items = await provider.provideCompletionItems(mockDoc(code, 'python'), cursorPos);

        assert.ok(items, 'should return items in python');
        assert.strictEqual(items!.length, 2, 'python should detect variants');
    });

    test('Go: variant detection works with := assignment', async () => {
        const cache = fakeFlagCache([makeMultivariateFlag('go-flag', ['v1', 'v2'])]);
        const provider = new VariantCompletionProvider(cache, fakeTreeSitter(), fakeTelemetry());

        // flag, _ := client.GetFeatureFlag("go-flag", ...)
        // if flag == "|" {}
        const code = [
            'flag, _ := client.GetFeatureFlag("go-flag", "user-id", nil, nil, nil, nil)',
            'if flag == "" {',
            '}',
        ].join('\n');
        const cursorPos = new vscode.Position(1, 12);
        const items = await provider.provideCompletionItems(mockDoc(code, 'go'), cursorPos);

        assert.ok(items, 'should return items in go');
        assert.strictEqual(items!.length, 2, 'go should detect variants');
    });

    test('Ruby: variant detection works', async () => {
        const cache = fakeFlagCache([makeMultivariateFlag('rb-flag', ['alpha', 'beta'])]);
        const provider = new VariantCompletionProvider(cache, fakeTreeSitter(), fakeTelemetry());

        // flag = posthog.get_feature_flag('rb-flag', distinct_id)
        // if flag == '|'
        const code = [
            "flag = posthog.get_feature_flag('rb-flag', 'user-id')",
            "if flag == ''",
            "end",
        ].join('\n');
        const cursorPos = new vscode.Position(1, 13);
        const items = await provider.provideCompletionItems(mockDoc(code, 'ruby'), cursorPos);

        assert.ok(items, 'should return items in ruby');
        assert.strictEqual(items!.length, 2, 'ruby should detect variants');
    });

    test('item details show variant rollout percentage', async () => {
        const cache = fakeFlagCache([makeMultivariateFlag('rollout-flag', ['a', 'b', 'c', 'd'])]);
        const provider = new VariantCompletionProvider(cache, fakeTreeSitter(), fakeTelemetry());

        const code = [
            "const flag = posthog.getFeatureFlag('rollout-flag');",
            "if (flag === '') {",
            "}",
        ].join('\n');
        const cursorPos = new vscode.Position(1, 14);
        const items = await provider.provideCompletionItems(mockDoc(code, 'typescript'), cursorPos);

        assert.ok(items);
        assert.strictEqual(items!.length, 4);
        // Each rollout is 25 (100/4)
        assert.ok(items!.every(i => typeof i.detail === 'string' && i.detail.includes('25%')));
    });
});
