import * as assert from 'assert';
import * as vscode from 'vscode';
import { FlagDecorationProvider } from '../../providers/flagDecorationProvider';
import { FlagCacheService } from '../../services/flagCacheService';
import { ExperimentCacheService } from '../../services/experimentCacheService';
import { TreeSitterService, PostHogCall } from '../../services/treeSitterService';
import { FeatureFlag, Experiment, ExperimentResults } from '../../models/types';

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
                variants: variantKeys.map(k => ({ key: k, rollout_percentage: 50, name: k })),
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

function postHogCall(method: string, key: string, line: number, keyStartCol = 0, keyEndCol = key.length): PostHogCall {
    return { method, key, line, keyStartCol, keyEndCol };
}

interface CapturedDecorations {
    after: { contentText?: string; color?: string }[];
    unknown: { range: vscode.Range }[];
}

// Build a fake TextEditor that records setDecorations calls per decoration type.
// We then swap vscode.window.activeTextEditor for it via Object.defineProperty.
function makeFakeEditor(
    code: string,
    languageId: string,
    inlineType: vscode.TextEditorDecorationType,
    unknownType: vscode.TextEditorDecorationType,
): { editor: vscode.TextEditor; captured: CapturedDecorations } {
    const lines = code.split('\n');
    const doc = {
        getText: () => code,
        languageId,
        lineAt: (n: number) => ({
            text: lines[n] ?? '',
            range: new vscode.Range(n, 0, n, (lines[n] ?? '').length),
            firstNonWhitespaceCharacterIndex: (lines[n] ?? '').search(/\S/),
        }),
        uri: vscode.Uri.parse('file:///fake.ts'),
        lineCount: lines.length,
    } as unknown as vscode.TextDocument;

    const captured: CapturedDecorations = { after: [], unknown: [] };

    const editor = {
        document: doc,
        selection: new vscode.Selection(0, 0, 0, 0),
        setDecorations: (
            type: vscode.TextEditorDecorationType,
            opts: readonly vscode.Range[] | readonly vscode.DecorationOptions[],
        ) => {
            // Filter by exact decoration type instance from our provider — this
            // ensures stray setDecorations calls (e.g., from the real provider
            // running in the extension host) don't pollute our capture state.
            const decorationOpts = opts as readonly vscode.DecorationOptions[];
            if (type === inlineType) {
                captured.after = decorationOpts.map(d => ({
                    contentText: d.renderOptions?.after?.contentText as string | undefined,
                    color: d.renderOptions?.after?.color as string | undefined,
                }));
            } else if (type === unknownType) {
                captured.unknown = decorationOpts.map(d => ({ range: d.range as vscode.Range }));
            }
        },
    } as unknown as vscode.TextEditor;

    return { editor, captured };
}

async function runProvider(
    provider: FlagDecorationProvider,
    code: string,
    languageId: string,
): Promise<CapturedDecorations> {
    // Reach into the provider for its decoration types so we can filter calls.
    const inlineType = (provider as unknown as { decoration: vscode.TextEditorDecorationType }).decoration;
    const unknownType = (provider as unknown as { unknownFlagDecoration: vscode.TextEditorDecorationType }).unknownFlagDecoration;
    const fake = makeFakeEditor(code, languageId, inlineType, unknownType);

    // Save original descriptor and override activeTextEditor with our fake.
    const windowAny = vscode.window as unknown as Record<string, unknown>;
    const originalDescriptor = Object.getOwnPropertyDescriptor(vscode.window, 'activeTextEditor');
    Object.defineProperty(vscode.window, 'activeTextEditor', {
        configurable: true,
        get: () => fake.editor,
    });

    try {
        provider.refresh();
        // Wait for the 200ms debounce + buffer
        await new Promise(resolve => setTimeout(resolve, 600));
    } finally {
        if (originalDescriptor) {
            Object.defineProperty(vscode.window, 'activeTextEditor', originalDescriptor);
        } else {
            delete windowAny.activeTextEditor;
        }
    }

    return fake.captured;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('FlagDecorationProvider', function () {
    this.timeout(10_000);

    suiteTeardown(async () => {
        // Close all editors that were opened during testing
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('renders "enabled" label for fully active flag with 100% rollout', async () => {
        const cache = fakeFlagCache([makeFlag({ key: 'on', active: true, rollout_percentage: 100 })]);
        const expCache = fakeExperimentCache([]);
        const ts = fakeTreeSitter({ calls: [postHogCall('getFeatureFlag', 'on', 0)] });
        const provider = new FlagDecorationProvider(cache, expCache, ts);

        const captured = await runProvider(provider, "posthog.getFeatureFlag('on');", 'typescript');

        assert.strictEqual(captured.after.length, 1, 'should produce one inline decoration');
        const text = captured.after[0].contentText ?? '';
        assert.ok(text.includes('enabled'), `expected "enabled" in label, got "${text}"`);
        assert.ok(text.includes('●'), `expected status dot in label, got "${text}"`);
        assert.strictEqual(captured.after[0].color, '#4CBB17', 'green for active');
    });

    test('renders rollout percentage label for partially-rolled-out flag', async () => {
        const cache = fakeFlagCache([makeFlag({ key: 'partial', active: true, rollout_percentage: 33 })]);
        const expCache = fakeExperimentCache([]);
        const ts = fakeTreeSitter({ calls: [postHogCall('getFeatureFlag', 'partial', 0)] });
        const provider = new FlagDecorationProvider(cache, expCache, ts);

        const captured = await runProvider(provider, "posthog.getFeatureFlag('partial');", 'typescript');

        assert.strictEqual(captured.after.length, 1);
        const text = captured.after[0].contentText ?? '';
        assert.ok(text.includes('33%'), `expected 33% in label, got "${text}"`);
    });

    test('renders "inactive" label for inactive flag', async () => {
        const cache = fakeFlagCache([makeFlag({ key: 'paused', active: false })]);
        const expCache = fakeExperimentCache([]);
        const ts = fakeTreeSitter({ calls: [postHogCall('getFeatureFlag', 'paused', 0)] });
        const provider = new FlagDecorationProvider(cache, expCache, ts);

        const captured = await runProvider(provider, "posthog.getFeatureFlag('paused');", 'typescript');

        assert.strictEqual(captured.after.length, 1);
        const text = captured.after[0].contentText ?? '';
        assert.ok(text.includes('inactive'), `expected "inactive" in label, got "${text}"`);
    });

    test('renders "not in PostHog" label for unknown flag and adds wavy underline', async () => {
        const cache = fakeFlagCache([]);  // empty cache
        const expCache = fakeExperimentCache([]);
        const ts = fakeTreeSitter({
            calls: [postHogCall('getFeatureFlag', 'missing', 0, 24, 31)],
        });
        const provider = new FlagDecorationProvider(cache, expCache, ts);

        const captured = await runProvider(provider, "posthog.getFeatureFlag('missing');", 'typescript');

        assert.strictEqual(captured.after.length, 1);
        const text = captured.after[0].contentText ?? '';
        assert.ok(text.includes('not in PostHog'), `expected "not in PostHog", got "${text}"`);
        assert.strictEqual(captured.after[0].color, '#F9BD2B', 'yellow warning color');

        assert.strictEqual(captured.unknown.length, 1, 'should produce wavy underline for unknown flag');
    });

    test('renders variant count for multivariate flag without experiment', async () => {
        const cache = fakeFlagCache([makeMultivariateFlag('multi-flag', ['a', 'b', 'c'])]);
        const expCache = fakeExperimentCache([]);
        const ts = fakeTreeSitter({ calls: [postHogCall('getFeatureFlag', 'multi-flag', 0)] });
        const provider = new FlagDecorationProvider(cache, expCache, ts);

        const captured = await runProvider(provider, "posthog.getFeatureFlag('multi-flag');", 'typescript');

        assert.strictEqual(captured.after.length, 1);
        const text = captured.after[0].contentText ?? '';
        assert.ok(text.includes('3 variants'), `expected "3 variants", got "${text}"`);
    });

    test('renders experiment running label when flag has linked experiment', async () => {
        const cache = fakeFlagCache([makeMultivariateFlag('exp-flag', ['control', 'test'])]);
        const expCache = fakeExperimentCache([
            makeExperiment({
                id: 7,
                name: 'My Test',
                feature_flag_key: 'exp-flag',
                start_date: '2024-01-01',
            }),
        ]);
        const ts = fakeTreeSitter({ calls: [postHogCall('getFeatureFlag', 'exp-flag', 0)] });
        const provider = new FlagDecorationProvider(cache, expCache, ts);

        const captured = await runProvider(provider, "posthog.getFeatureFlag('exp-flag');", 'typescript');

        assert.strictEqual(captured.after.length, 1);
        const text = captured.after[0].contentText ?? '';
        assert.ok(text.includes('experiment') || text.includes('running') || text.includes('leading'),
            `expected experiment label, got "${text}"`);
        assert.strictEqual(captured.after[0].color, '#1D4AFF', 'blue for experiments');
    });

    test('renders draft experiment label when no start_date', async () => {
        const cache = fakeFlagCache([makeMultivariateFlag('draft-flag', ['a', 'b'])]);
        const expCache = fakeExperimentCache([
            makeExperiment({ id: 1, feature_flag_key: 'draft-flag', start_date: null }),
        ]);
        const ts = fakeTreeSitter({ calls: [postHogCall('getFeatureFlag', 'draft-flag', 0)] });
        const provider = new FlagDecorationProvider(cache, expCache, ts);

        const captured = await runProvider(provider, "posthog.getFeatureFlag('draft-flag');", 'typescript');

        assert.strictEqual(captured.after.length, 1);
        const text = captured.after[0].contentText ?? '';
        assert.ok(text.includes('draft'), `expected "draft" in label, got "${text}"`);
    });

    test('skips non-flag methods (capture)', async () => {
        const cache = fakeFlagCache([makeFlag({ key: 'on' })]);
        const expCache = fakeExperimentCache([]);
        const ts = fakeTreeSitter({ calls: [postHogCall('capture', 'pageview', 0)] });
        const provider = new FlagDecorationProvider(cache, expCache, ts);

        const captured = await runProvider(provider, "posthog.capture('pageview');", 'typescript');

        assert.strictEqual(captured.after.length, 0, 'should not decorate capture calls');
    });

    test('renders decorations for multiple flag calls in same document', async () => {
        const cache = fakeFlagCache([
            makeFlag({ key: 'flag-a', active: true, rollout_percentage: 100, id: 1 }),
            makeFlag({ key: 'flag-b', active: true, rollout_percentage: 50, id: 2 }),
        ]);
        const expCache = fakeExperimentCache([]);
        const ts = fakeTreeSitter({
            calls: [
                postHogCall('getFeatureFlag', 'flag-a', 0),
                postHogCall('getFeatureFlag', 'flag-b', 1),
            ],
        });
        const provider = new FlagDecorationProvider(cache, expCache, ts);

        const code = "posthog.getFeatureFlag('flag-a');\nposthog.getFeatureFlag('flag-b');";
        const captured = await runProvider(provider, code, 'typescript');

        assert.strictEqual(captured.after.length, 2, 'should produce 2 decorations');
        assert.ok(captured.after[0].contentText?.includes('enabled'), 'first should be enabled');
        assert.ok(captured.after[1].contentText?.includes('50%'), 'second should be 50%');
    });
});
