import * as assert from 'assert';
import * as vscode from 'vscode';
import { EventCompletionProvider } from '../../providers/eventCompletionProvider';
import { EventCacheService } from '../../services/eventCacheService';
import { TreeSitterService, CompletionContext } from '../../services/treeSitterService';
import { TelemetryService } from '../../services/telemetryService';
import { EventDefinition } from '../../models/types';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<EventDefinition> = {}): EventDefinition {
    return {
        id: '1',
        name: 'test_event',
        description: null,
        tags: [],
        last_seen_at: null,
        verified: false,
        hidden: false,
        ...overrides,
    };
}

function fakeEventCache(events: EventDefinition[]): EventCacheService {
    const cache = new EventCacheService();
    cache.update(events);
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

suite('EventCompletionProvider', () => {

    test('returns event items when context is capture_event', async () => {
        const cache = fakeEventCache([
            makeEvent({ name: 'click', id: '1' }),
            makeEvent({ name: 'pageview', id: '2' }),
        ]);
        const ts = fakeTreeSitter({ context: { type: 'capture_event' } });
        const provider = new EventCompletionProvider(cache, ts, fakeTelemetry());

        const items = await provider.provideCompletionItems(
            mockDoc("posthog.capture('')", 'typescript'),
            new vscode.Position(0, 17),
        );

        assert.ok(items, 'should return items');
        assert.strictEqual(items!.length, 2, 'should return 2 events');
        const labels = items!.map(i => i.label);
        assert.ok(labels.includes('click'));
        assert.ok(labels.includes('pageview'));
    });

    test('returns undefined when language is not supported', async () => {
        const cache = fakeEventCache([makeEvent({ name: 'click' })]);
        const ts = fakeTreeSitter({ isSupported: false, context: { type: 'capture_event' } });
        const provider = new EventCompletionProvider(cache, ts, fakeTelemetry());

        const items = await provider.provideCompletionItems(
            mockDoc('foo', 'plaintext'),
            new vscode.Position(0, 0),
        );

        assert.strictEqual(items, undefined);
    });

    test('returns undefined when not in a capture context', async () => {
        const cache = fakeEventCache([makeEvent({ name: 'click' })]);
        const ts = fakeTreeSitter({ context: { type: 'flag_key' } });
        const provider = new EventCompletionProvider(cache, ts, fakeTelemetry());

        const items = await provider.provideCompletionItems(
            mockDoc("posthog.getFeatureFlag('')", 'typescript'),
            new vscode.Position(0, 23),
        );

        assert.strictEqual(items, undefined, 'should return undefined when context is flag_key');
    });

    test('returns undefined when context is null', async () => {
        const cache = fakeEventCache([makeEvent({ name: 'click' })]);
        const ts = fakeTreeSitter({ context: null });
        const provider = new EventCompletionProvider(cache, ts, fakeTelemetry());

        const items = await provider.provideCompletionItems(
            mockDoc('foo', 'typescript'),
            new vscode.Position(0, 0),
        );

        assert.strictEqual(items, undefined);
    });

    test('hidden events are filtered out', async () => {
        const cache = fakeEventCache([
            makeEvent({ name: 'visible', id: '1', hidden: false }),
            makeEvent({ name: '$hidden', id: '2', hidden: true }),
        ]);
        const ts = fakeTreeSitter({ context: { type: 'capture_event' } });
        const provider = new EventCompletionProvider(cache, ts, fakeTelemetry());

        const items = await provider.provideCompletionItems(
            mockDoc("posthog.capture('')", 'typescript'),
            new vscode.Position(0, 17),
        );

        assert.ok(items);
        assert.strictEqual(items!.length, 1, 'should filter out hidden event');
        assert.strictEqual(items![0].label, 'visible');
    });

    test('$ prefixed events are labeled as PostHog event when not custom', async () => {
        const cache = fakeEventCache([
            makeEvent({ name: '$pageview', id: '1', verified: false }),
            makeEvent({ name: 'custom_thing', id: '2', verified: false }),
        ]);
        const ts = fakeTreeSitter({ context: { type: 'capture_event' } });
        const provider = new EventCompletionProvider(cache, ts, fakeTelemetry());

        const items = await provider.provideCompletionItems(
            mockDoc("posthog.capture('')", 'typescript'),
            new vscode.Position(0, 17),
        );

        const sysItem = items!.find(i => i.label === '$pageview');
        const customItem = items!.find(i => i.label === 'custom_thing');
        assert.strictEqual(sysItem?.detail, 'PostHog event');
        assert.strictEqual(customItem?.detail, 'Custom event');
    });

    test('verified events are labeled Verified', async () => {
        const cache = fakeEventCache([
            makeEvent({ name: 'reviewed', id: '1', verified: true }),
        ]);
        const ts = fakeTreeSitter({ context: { type: 'capture_event' } });
        const provider = new EventCompletionProvider(cache, ts, fakeTelemetry());

        const items = await provider.provideCompletionItems(
            mockDoc("posthog.capture('')", 'typescript'),
            new vscode.Position(0, 17),
        );

        assert.strictEqual(items![0].detail, 'Verified');
    });

    test('returns empty array when cache is empty', async () => {
        const cache = fakeEventCache([]);
        const ts = fakeTreeSitter({ context: { type: 'capture_event' } });
        const provider = new EventCompletionProvider(cache, ts, fakeTelemetry());

        const items = await provider.provideCompletionItems(
            mockDoc("posthog.capture('')", 'typescript'),
            new vscode.Position(0, 17),
        );

        assert.ok(items);
        assert.strictEqual(items!.length, 0);
    });
});
