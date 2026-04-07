import * as assert from 'assert';
import * as vscode from 'vscode';
import { FlagCodeActionProvider } from '../../providers/flagCodeActionProvider';
import { FlagCacheService } from '../../services/flagCacheService';
import { TreeSitterService, PostHogCall } from '../../services/treeSitterService';
import { FeatureFlag } from '../../models/types';
import { Commands } from '../../constants';

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
    calls?: PostHogCall[];
}): TreeSitterService {
    return {
        isSupported: () => opts.isSupported ?? true,
        findPostHogCalls: async () => opts.calls ?? [],
    } as unknown as TreeSitterService;
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

function call(method: string, key: string, line: number): PostHogCall {
    return {
        method,
        key,
        line,
        keyStartCol: 0,
        keyEndCol: key.length,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('FlagCodeActionProvider', () => {

    test('returns Create Flag action for unknown flag', async () => {
        const cache = fakeFlagCache([]);
        const ts = fakeTreeSitter({
            calls: [call('getFeatureFlag', 'new-flag', 0)],
        });
        const provider = new FlagCodeActionProvider(cache, ts);

        const actions = await provider.provideCodeActions(
            mockDoc("posthog.getFeatureFlag('new-flag')", 'typescript'),
            new vscode.Range(0, 0, 0, 0),
        );

        assert.ok(actions, 'should return actions');
        assert.strictEqual(actions!.length, 1, 'should return 1 action');
        assert.strictEqual(actions![0].title, 'Create feature flag "new-flag" in PostHog');
    });

    test('action has correct command and arguments', async () => {
        const cache = fakeFlagCache([]);
        const ts = fakeTreeSitter({
            calls: [call('getFeatureFlag', 'unknown', 0)],
        });
        const provider = new FlagCodeActionProvider(cache, ts);

        const actions = await provider.provideCodeActions(
            mockDoc("posthog.getFeatureFlag('unknown')", 'typescript'),
            new vscode.Range(0, 0, 0, 0),
        );

        const action = actions![0];
        assert.strictEqual(action.command?.command, Commands.CREATE_FLAG);
        assert.deepStrictEqual(action.command?.arguments, ['unknown']);
        assert.strictEqual(action.kind?.value, vscode.CodeActionKind.QuickFix.value);
        assert.strictEqual(action.isPreferred, true);
    });

    test('returns no action for known flag', async () => {
        const cache = fakeFlagCache([makeFlag({ key: 'known-flag' })]);
        const ts = fakeTreeSitter({
            calls: [call('getFeatureFlag', 'known-flag', 0)],
        });
        const provider = new FlagCodeActionProvider(cache, ts);

        const actions = await provider.provideCodeActions(
            mockDoc("posthog.getFeatureFlag('known-flag')", 'typescript'),
            new vscode.Range(0, 0, 0, 0),
        );

        assert.strictEqual(actions, undefined, 'should not offer creation for known flag');
    });

    test('returns no action when language not supported', async () => {
        const cache = fakeFlagCache([]);
        const ts = fakeTreeSitter({
            isSupported: false,
            calls: [call('getFeatureFlag', 'foo', 0)],
        });
        const provider = new FlagCodeActionProvider(cache, ts);

        const actions = await provider.provideCodeActions(
            mockDoc("foo", 'plaintext'),
            new vscode.Range(0, 0, 0, 0),
        );

        assert.strictEqual(actions, undefined);
    });

    test('returns no action when call is on a different line', async () => {
        const cache = fakeFlagCache([]);
        const ts = fakeTreeSitter({
            calls: [call('getFeatureFlag', 'foo', 5)],
        });
        const provider = new FlagCodeActionProvider(cache, ts);

        const actions = await provider.provideCodeActions(
            mockDoc("\n\n\nfoo\n\n\n", 'typescript'),
            new vscode.Range(0, 0, 0, 0),  // line 0, but call is on line 5
        );

        assert.strictEqual(actions, undefined);
    });

    test('returns no action for non-flag method (e.g., capture)', async () => {
        const cache = fakeFlagCache([]);
        const ts = fakeTreeSitter({
            calls: [call('capture', 'pageview', 0)],
        });
        const provider = new FlagCodeActionProvider(cache, ts);

        const actions = await provider.provideCodeActions(
            mockDoc("posthog.capture('pageview')", 'typescript'),
            new vscode.Range(0, 0, 0, 0),
        );

        assert.strictEqual(actions, undefined, 'capture is not a flag method');
    });

    test('works for python flag method get_feature_flag', async () => {
        const cache = fakeFlagCache([]);
        const ts = fakeTreeSitter({
            calls: [call('get_feature_flag', 'py-flag', 0)],
        });
        const provider = new FlagCodeActionProvider(cache, ts);

        const actions = await provider.provideCodeActions(
            mockDoc("posthog.get_feature_flag('py-flag')", 'python'),
            new vscode.Range(0, 0, 0, 0),
        );

        assert.ok(actions);
        assert.strictEqual(actions!.length, 1);
    });
});
