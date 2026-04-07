import * as assert from 'assert';
import * as vscode from 'vscode';
import { FlagCodeLensProvider } from '../../providers/flagCodeLensProvider';
import { FlagCacheService } from '../../services/flagCacheService';
import { ExperimentCacheService } from '../../services/experimentCacheService';
import { TreeSitterService, PostHogCall } from '../../services/treeSitterService';
import { TelemetryService } from '../../services/telemetryService';
import { FeatureFlag, Experiment, ExperimentResults } from '../../models/types';
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

function makeMultivariateFlag(key: string, variantKeys: string[]): FeatureFlag {
    return makeFlag({
        key,
        filters: {
            multivariate: {
                variants: variantKeys.map(k => ({ key: k, rollout_percentage: 50 })),
            },
        },
    });
}

function makeExperiment(overrides: Partial<Experiment> = {}): Experiment {
    return {
        id: 1,
        name: 'Test Experiment',
        description: null,
        start_date: null,
        end_date: null,
        feature_flag_key: 'test-flag',
        created_at: '2024-01-01',
        created_by: null,
        ...overrides,
    };
}

function fakeFlagCache(flags: FeatureFlag[]): FlagCacheService {
    const cache = new FlagCacheService();
    cache.update(flags);
    return cache;
}

function fakeExperimentCache(
    experiments: Experiment[],
    results: Map<number, ExperimentResults> = new Map(),
): ExperimentCacheService {
    const cache = new ExperimentCacheService();
    cache.update(experiments);
    for (const [id, r] of results) {
        cache.updateResults(id, r);
    }
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

suite('FlagCodeLensProvider', () => {

    test('returns CodeLens for known boolean flag with rollout %', async () => {
        const cache = fakeFlagCache([makeFlag({ key: 'rollout-flag', active: true, rollout_percentage: 50 })]);
        const expCache = fakeExperimentCache([]);
        const ts = fakeTreeSitter({ calls: [call('getFeatureFlag', 'rollout-flag', 0)] });
        const provider = new FlagCodeLensProvider(cache, expCache, ts, fakeTelemetry());

        const lenses = await provider.provideCodeLenses(
            mockDoc("posthog.getFeatureFlag('rollout-flag')", 'typescript'),
        );

        assert.strictEqual(lenses.length, 1, 'should return 1 code lens');
        assert.ok(lenses[0].command);
        assert.ok(lenses[0].command!.title.includes('rollout-flag'), 'title should include flag key');
        assert.ok(lenses[0].command!.title.includes('50%'), 'title should include rollout %');
        assert.ok(lenses[0].command!.title.includes('enabled'), 'should say enabled');
        assert.strictEqual(lenses[0].command!.command, Commands.SHOW_FLAG_DETAIL);
    });

    test('returns CodeLens for disabled boolean flag', async () => {
        const cache = fakeFlagCache([makeFlag({ key: 'off', active: false })]);
        const expCache = fakeExperimentCache([]);
        const ts = fakeTreeSitter({ calls: [call('getFeatureFlag', 'off', 0)] });
        const provider = new FlagCodeLensProvider(cache, expCache, ts, fakeTelemetry());

        const lenses = await provider.provideCodeLenses(
            mockDoc("posthog.getFeatureFlag('off')", 'typescript'),
        );

        assert.strictEqual(lenses.length, 1);
        assert.ok(lenses[0].command!.title.includes('disabled'), 'should say disabled');
    });

    test('returns CodeLens for multivariate flag with variant count', async () => {
        const cache = fakeFlagCache([makeMultivariateFlag('multi', ['a', 'b', 'c'])]);
        const expCache = fakeExperimentCache([]);
        const ts = fakeTreeSitter({ calls: [call('getFeatureFlag', 'multi', 0)] });
        const provider = new FlagCodeLensProvider(cache, expCache, ts, fakeTelemetry());

        const lenses = await provider.provideCodeLenses(
            mockDoc("posthog.getFeatureFlag('multi')", 'typescript'),
        );

        assert.strictEqual(lenses.length, 1);
        assert.ok(lenses[0].command!.title.includes('Multivariate'), 'should say Multivariate');
        assert.ok(lenses[0].command!.title.includes('3 variants'), 'should show 3 variants');
    });

    test('returns CodeLens for experiment-linked flag with status', async () => {
        const cache = fakeFlagCache([makeMultivariateFlag('exp-flag', ['control', 'test'])]);
        const expCache = fakeExperimentCache([
            makeExperiment({
                id: 42,
                name: 'My Experiment',
                feature_flag_key: 'exp-flag',
                start_date: '2024-01-01',
            }),
        ]);
        const ts = fakeTreeSitter({ calls: [call('getFeatureFlag', 'exp-flag', 0)] });
        const provider = new FlagCodeLensProvider(cache, expCache, ts, fakeTelemetry());

        const lenses = await provider.provideCodeLenses(
            mockDoc("posthog.getFeatureFlag('exp-flag')", 'typescript'),
        );

        assert.strictEqual(lenses.length, 1);
        assert.ok(lenses[0].command!.title.includes('Experiment'));
        assert.ok(lenses[0].command!.title.includes('My Experiment'));
        assert.ok(lenses[0].command!.title.includes('running'), 'should say running');
        assert.strictEqual(lenses[0].command!.command, Commands.SHOW_EXPERIMENT_DETAIL);
    });

    test('experiment status shows draft when no start_date', async () => {
        const cache = fakeFlagCache([makeMultivariateFlag('draft-flag', ['a', 'b'])]);
        const expCache = fakeExperimentCache([
            makeExperiment({ id: 1, feature_flag_key: 'draft-flag', start_date: null }),
        ]);
        const ts = fakeTreeSitter({ calls: [call('getFeatureFlag', 'draft-flag', 0)] });
        const provider = new FlagCodeLensProvider(cache, expCache, ts, fakeTelemetry());

        const lenses = await provider.provideCodeLenses(
            mockDoc("posthog.getFeatureFlag('draft-flag')", 'typescript'),
        );

        assert.strictEqual(lenses.length, 1);
        assert.ok(lenses[0].command!.title.includes('draft'));
    });

    test('experiment status shows complete when end_date', async () => {
        const cache = fakeFlagCache([makeMultivariateFlag('done-flag', ['a', 'b'])]);
        const expCache = fakeExperimentCache([
            makeExperiment({
                id: 1,
                feature_flag_key: 'done-flag',
                start_date: '2024-01-01',
                end_date: '2024-02-01',
            }),
        ]);
        const ts = fakeTreeSitter({ calls: [call('getFeatureFlag', 'done-flag', 0)] });
        const provider = new FlagCodeLensProvider(cache, expCache, ts, fakeTelemetry());

        const lenses = await provider.provideCodeLenses(
            mockDoc("posthog.getFeatureFlag('done-flag')", 'typescript'),
        );

        assert.strictEqual(lenses.length, 1);
        assert.ok(lenses[0].command!.title.includes('complete'));
    });

    test('skips duplicate flag references on same document', async () => {
        const cache = fakeFlagCache([makeFlag({ key: 'dup-flag', rollout_percentage: 100 })]);
        const expCache = fakeExperimentCache([]);
        const ts = fakeTreeSitter({
            calls: [
                call('getFeatureFlag', 'dup-flag', 0),
                call('getFeatureFlag', 'dup-flag', 5),  // duplicate
                call('getFeatureFlag', 'dup-flag', 10), // duplicate
            ],
        });
        const provider = new FlagCodeLensProvider(cache, expCache, ts, fakeTelemetry());

        const lenses = await provider.provideCodeLenses(
            mockDoc("posthog.getFeatureFlag('dup-flag')\n\n\n\n\nposthog.getFeatureFlag('dup-flag')", 'typescript'),
        );

        assert.strictEqual(lenses.length, 1, 'should return only one lens for the same flag');
    });

    test('returns no CodeLens for unknown flag', async () => {
        const cache = fakeFlagCache([]);
        const expCache = fakeExperimentCache([]);
        const ts = fakeTreeSitter({ calls: [call('getFeatureFlag', 'unknown', 0)] });
        const provider = new FlagCodeLensProvider(cache, expCache, ts, fakeTelemetry());

        const lenses = await provider.provideCodeLenses(
            mockDoc("posthog.getFeatureFlag('unknown')", 'typescript'),
        );

        assert.strictEqual(lenses.length, 0, 'should return no lens when flag not in cache');
    });

    test('returns no CodeLens when language not supported', async () => {
        const cache = fakeFlagCache([makeFlag({ key: 'test' })]);
        const expCache = fakeExperimentCache([]);
        const ts = fakeTreeSitter({
            isSupported: false,
            calls: [call('getFeatureFlag', 'test', 0)],
        });
        const provider = new FlagCodeLensProvider(cache, expCache, ts, fakeTelemetry());

        const lenses = await provider.provideCodeLenses(
            mockDoc("foo", 'plaintext'),
        );

        assert.strictEqual(lenses.length, 0);
    });

    test('skips non-flag methods (e.g. capture)', async () => {
        const cache = fakeFlagCache([makeFlag({ key: 'test' })]);
        const expCache = fakeExperimentCache([]);
        const ts = fakeTreeSitter({
            calls: [call('capture', 'pageview', 0)],
        });
        const provider = new FlagCodeLensProvider(cache, expCache, ts, fakeTelemetry());

        const lenses = await provider.provideCodeLenses(
            mockDoc("posthog.capture('pageview')", 'typescript'),
        );

        assert.strictEqual(lenses.length, 0);
    });

    test('extracts rollout_percentage from filters.groups when top-level is null', async () => {
        const cache = fakeFlagCache([
            makeFlag({
                key: 'group-flag',
                rollout_percentage: null,
                filters: {
                    groups: [{ rollout_percentage: 25, properties: [] }],
                },
            }),
        ]);
        const expCache = fakeExperimentCache([]);
        const ts = fakeTreeSitter({ calls: [call('getFeatureFlag', 'group-flag', 0)] });
        const provider = new FlagCodeLensProvider(cache, expCache, ts, fakeTelemetry());

        const lenses = await provider.provideCodeLenses(
            mockDoc("posthog.getFeatureFlag('group-flag')", 'typescript'),
        );

        assert.strictEqual(lenses.length, 1);
        assert.ok(lenses[0].command!.title.includes('25%'), 'should extract group rollout');
    });
});
