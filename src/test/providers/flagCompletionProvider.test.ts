import * as assert from 'assert';
import * as vscode from 'vscode';
import { FlagCompletionProvider } from '../../providers/flagCompletionProvider';
import { FlagCacheService } from '../../services/flagCacheService';
import { TreeSitterService, CompletionContext } from '../../services/treeSitterService';
import { TelemetryService } from '../../services/telemetryService';
import { FeatureFlag } from '../../models/types';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeFlag(overrides: Partial<FeatureFlag> = {}): FeatureFlag {
    return {
        id: 1,
        key: 'test-flag',
        name: 'Test',
        active: true,
        filters: {},
        rollout_percentage: null,
        created_at: '2024-01-01',
        created_by: null,
        deleted: false,
        ...overrides,
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
}): TreeSitterService {
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

suite('FlagCompletionProvider', () => {

    test('returns flag items when context is flag_key', async () => {
        const cache = fakeFlagCache([
            makeFlag({ key: 'feature-a', active: true }),
            makeFlag({ key: 'feature-b', active: false, id: 2 }),
        ]);
        const ts = fakeTreeSitter({ context: { type: 'flag_key' } });
        const provider = new FlagCompletionProvider(cache, ts, fakeTelemetry());

        const items = await provider.provideCompletionItems(
            mockDoc("posthog.getFeatureFlag('')", 'typescript'),
            new vscode.Position(0, 23),
        );

        assert.ok(items, 'should return items');
        assert.strictEqual(items!.length, 2, 'should return 2 flags');
        const labels = items!.map(i => i.label);
        assert.ok(labels.includes('feature-a'), 'should include feature-a');
        assert.ok(labels.includes('feature-b'), 'should include feature-b');
    });

    test('returns undefined when language is not supported', async () => {
        const cache = fakeFlagCache([makeFlag({ key: 'feature-a' })]);
        const ts = fakeTreeSitter({ isSupported: false, context: { type: 'flag_key' } });
        const provider = new FlagCompletionProvider(cache, ts, fakeTelemetry());

        const items = await provider.provideCompletionItems(
            mockDoc('something', 'plaintext'),
            new vscode.Position(0, 0),
        );

        assert.strictEqual(items, undefined, 'should return undefined for unsupported lang');
    });

    test('returns undefined when not in a flag context', async () => {
        const cache = fakeFlagCache([makeFlag({ key: 'feature-a' })]);
        const ts = fakeTreeSitter({ context: { type: 'capture_event' } });
        const provider = new FlagCompletionProvider(cache, ts, fakeTelemetry());

        const items = await provider.provideCompletionItems(
            mockDoc("posthog.capture('')", 'typescript'),
            new vscode.Position(0, 17),
        );

        assert.strictEqual(items, undefined, 'should return undefined when context is capture_event');
    });

    test('returns undefined when context is null', async () => {
        const cache = fakeFlagCache([makeFlag({ key: 'feature-a' })]);
        const ts = fakeTreeSitter({ context: null });
        const provider = new FlagCompletionProvider(cache, ts, fakeTelemetry());

        const items = await provider.provideCompletionItems(
            mockDoc('foo', 'typescript'),
            new vscode.Position(0, 0),
        );

        assert.strictEqual(items, undefined, 'should return undefined when context is null');
    });

    test('returns empty array when cache is empty but context matches', async () => {
        const cache = fakeFlagCache([]);
        const ts = fakeTreeSitter({ context: { type: 'flag_key' } });
        const provider = new FlagCompletionProvider(cache, ts, fakeTelemetry());

        const items = await provider.provideCompletionItems(
            mockDoc("posthog.getFeatureFlag('')", 'typescript'),
            new vscode.Position(0, 23),
        );

        assert.ok(items, 'should return an array');
        assert.strictEqual(items!.length, 0, 'should be empty when no flags');
    });

    test('filters out deleted flags', async () => {
        const cache = fakeFlagCache([
            makeFlag({ key: 'alive', id: 1 }),
            makeFlag({ key: 'dead', id: 2, deleted: true }),
            makeFlag({ key: 'also-alive', id: 3 }),
        ]);
        const ts = fakeTreeSitter({ context: { type: 'flag_key' } });
        const provider = new FlagCompletionProvider(cache, ts, fakeTelemetry());

        const items = await provider.provideCompletionItems(
            mockDoc("posthog.getFeatureFlag('')", 'typescript'),
            new vscode.Position(0, 23),
        );

        assert.ok(items, 'should return items');
        assert.strictEqual(items!.length, 2, 'should skip deleted flag');
        const labels = items!.map(i => i.label);
        assert.ok(!labels.includes('dead'), 'should not include deleted flag');
    });

    test('sorts active flags before inactive flags', async () => {
        const cache = fakeFlagCache([
            makeFlag({ key: 'inactive-flag', active: false, id: 1 }),
            makeFlag({ key: 'active-flag', active: true, id: 2 }),
        ]);
        const ts = fakeTreeSitter({ context: { type: 'flag_key' } });
        const provider = new FlagCompletionProvider(cache, ts, fakeTelemetry());

        const items = await provider.provideCompletionItems(
            mockDoc("posthog.getFeatureFlag('')", 'typescript'),
            new vscode.Position(0, 23),
        );

        assert.ok(items, 'should return items');
        const sortTexts = items!.map(i => i.sortText ?? '');
        const activeIdx = items!.findIndex(i => i.label === 'active-flag');
        const inactiveIdx = items!.findIndex(i => i.label === 'inactive-flag');
        assert.ok(sortTexts[activeIdx].startsWith('0-'), 'active flag should sort with 0- prefix');
        assert.ok(sortTexts[inactiveIdx].startsWith('1-'), 'inactive flag should sort with 1- prefix');
    });

    test('item detail says Active for active flags and Inactive for inactive', async () => {
        const cache = fakeFlagCache([
            makeFlag({ key: 'on', active: true, id: 1 }),
            makeFlag({ key: 'off', active: false, id: 2 }),
        ]);
        const ts = fakeTreeSitter({ context: { type: 'flag_key' } });
        const provider = new FlagCompletionProvider(cache, ts, fakeTelemetry());

        const items = await provider.provideCompletionItems(
            mockDoc("posthog.getFeatureFlag('')", 'typescript'),
            new vscode.Position(0, 23),
        );

        const onItem = items!.find(i => i.label === 'on');
        const offItem = items!.find(i => i.label === 'off');
        assert.strictEqual(onItem?.detail, 'Active');
        assert.strictEqual(offItem?.detail, 'Inactive');
    });
});
