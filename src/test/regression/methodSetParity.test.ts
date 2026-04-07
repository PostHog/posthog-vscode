import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Method Set Parity (regression)
// ---------------------------------------------------------------------------
//
// This regression test locks in the SDK method names that the extension uses
// to detect PostHog calls in user code. These names are duplicated across
// many provider files and a couple of helper arrays inside `staleFlagService`,
// because each provider needs a fast in-memory Set lookup.
//
// A recent QA review uncovered that `staleFlagService.POSTHOG_FLAG_METHODS`
// was missing the Go methods (`GetFeatureFlag`, `IsFeatureEnabled`,
// `GetFeatureFlagPayload`) and `get_remote_config_payload`. The cleanup
// machinery uses that array to rewrite if-statements/ternaries, so the
// missing entries would have silently broken cleanups for those languages.
//
// We group providers into three buckets:
//   1. React-aware providers — canonical SDK methods + React hooks
//   2. SDK-only providers   — canonical SDK methods only (no React hooks)
//   3. variantCompletionProvider — locked-in subset (no Go, no useActiveFeatureFlags)
//
// This file parses the relevant source files as text (instead of importing
// them) so it never has to touch the production code. The tests below will
// fail loudly with a precise diff whenever any of the duplicated method sets
// drift away from its locked-in definition.
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const PROVIDERS_DIR = path.join(REPO_ROOT, 'src', 'providers');
const SERVICES_DIR = path.join(REPO_ROOT, 'src', 'services');

// ── Canonical sets ─────────────────────────────────────────────────────────

/**
 * Canonical SDK flag-detection methods. This is what `staleFlagService` and
 * `treeSitterService` agree on. Providers may extend this with React hooks
 * (which are bare function calls, not member calls) — see REACT_FLAG_HOOKS.
 *
 * If you add support for a new SDK method, update this set AND every place
 * that includes it (the test will tell you exactly which files to touch).
 */
const CANONICAL_SDK_FLAG_METHODS = new Set<string>([
    // JavaScript / TypeScript
    'getFeatureFlag',
    'isFeatureEnabled',
    'getFeatureFlagPayload',
    'getFeatureFlagResult',
    'isFeatureFlagEnabled',
    'getRemoteConfig',
    // Python
    'feature_enabled',
    'is_feature_enabled',
    'get_feature_flag',
    'get_feature_flag_payload',
    'get_remote_config',
    'get_remote_config_payload',
    // Go
    'GetFeatureFlag',
    'IsFeatureEnabled',
    'GetFeatureFlagPayload',
]);

/**
 * React hooks are bare function calls, not member expressions, so only the
 * providers that operate on React/JSX code add them on top of the canonical
 * set. Listed here so the test can reason about both supersets.
 */
const REACT_FLAG_HOOKS = new Set<string>([
    'useFeatureFlag',
    'useFeatureFlagPayload',
    'useFeatureFlagVariantKey',
    'useActiveFeatureFlags',
]);

const CANONICAL_PLUS_REACT = new Set<string>([
    ...CANONICAL_SDK_FLAG_METHODS,
    ...REACT_FLAG_HOOKS,
]);

// Providers that include React hooks on top of the canonical SDK set.
const REACT_AWARE_PROVIDERS = [
    'flagCodeActionProvider.ts',
    'flagCodeLensProvider.ts',
    'flagDecorationProvider.ts',
    'flagLinkProvider.ts',
    'flagToggleCodeActionProvider.ts',
    'staleFlagCodeActionProvider.ts',
] as const;

// Providers that only need the canonical SDK set (no React hooks).
const SDK_ONLY_PROVIDERS = [
    'sessionCodeLensProvider.ts',
] as const;

// `variantCompletionProvider` historically tracked a smaller set: it deliberately
// omits the Go methods (no variant completion in Go) and the
// `useActiveFeatureFlags` hook (returns an array of keys, not a single
// variant). The expected set is locked in below so a future drift in either
// direction trips the test.
const VARIANT_COMPLETION_FLAG_METHODS = new Set<string>([
    // canonical SDK minus Go
    'getFeatureFlag', 'isFeatureEnabled', 'getFeatureFlagPayload',
    'getFeatureFlagResult', 'isFeatureFlagEnabled', 'getRemoteConfig',
    'feature_enabled', 'is_feature_enabled', 'get_feature_flag',
    'get_feature_flag_payload', 'get_remote_config', 'get_remote_config_payload',
    // React hooks that return a single variant value
    'useFeatureFlag', 'useFeatureFlagPayload', 'useFeatureFlagVariantKey',
]);

const ALL_PROVIDERS = [
    ...REACT_AWARE_PROVIDERS,
    ...SDK_ONLY_PROVIDERS,
    'variantCompletionProvider.ts',
];

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extracts a `new Set([...])` literal that follows `<name> = new Set([...])`
 * from a TypeScript source file. Strips comments, quotes and whitespace.
 */
function extractMethodSetLiteral(filePath: string, varName: string): Set<string> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const re = new RegExp(`${varName}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`);
    const match = content.match(re);
    if (!match) {
        throw new Error(
            `Could not find \`${varName} = new Set([...])\` in ${path.relative(REPO_ROOT, filePath)}.\n` +
            `If you renamed or restructured this constant, update the regression test.`,
        );
    }
    return parseStringList(match[1]);
}

/**
 * Extracts a `<name> = [...]` array literal from a TypeScript source file.
 */
function extractArrayLiteral(filePath: string, varName: string): string[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const re = new RegExp(`${varName}\\s*=\\s*\\[([\\s\\S]*?)\\]`);
    const match = content.match(re);
    if (!match) {
        throw new Error(
            `Could not find \`${varName} = [...]\` in ${path.relative(REPO_ROOT, filePath)}.\n` +
            `If you renamed or restructured this constant, update the regression test.`,
        );
    }
    return [...parseStringList(match[1])];
}

function parseStringList(body: string): Set<string> {
    return new Set(
        body
            .split('\n')
            // strip line comments
            .map(line => line.replace(/\/\/.*$/, ''))
            .join('\n')
            .split(',')
            .map(s => s.trim())
            // drop trailing/leading quotes
            .map(s => s.replace(/^['"`]|['"`]$/g, ''))
            // ignore anything that isn't a plain identifier-ish token
            .filter(s => s.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(s)),
    );
}

function diffSets(actual: Set<string>, expected: Set<string>): { missing: string[]; extra: string[] } {
    const missing = [...expected].filter(x => !actual.has(x)).sort();
    const extra = [...actual].filter(x => !expected.has(x)).sort();
    return { missing, extra };
}

function formatDiff(label: string, actual: Set<string>, expected: Set<string>): string {
    const { missing, extra } = diffSets(actual, expected);
    return [
        `${label}`,
        `  missing (in expected, not in actual): ${missing.length === 0 ? '<none>' : missing.join(', ')}`,
        `  extra   (in actual, not in expected): ${extra.length === 0 ? '<none>' : extra.join(', ')}`,
    ].join('\n');
}

function assertSetEqual(actual: Set<string>, expected: Set<string>, label: string): void {
    const { missing, extra } = diffSets(actual, expected);
    if (missing.length === 0 && extra.length === 0) { return; }
    assert.fail('\n' + formatDiff(label, actual, expected));
}

// ── Tests ──────────────────────────────────────────────────────────────────

suite('Method Set Parity (regression)', () => {

    // -----------------------------------------------------------------------
    // Providers
    // -----------------------------------------------------------------------

    test('every React-aware provider FLAG_METHODS equals canonical SDK + React hooks', () => {
        const failures: string[] = [];
        for (const file of REACT_AWARE_PROVIDERS) {
            const filePath = path.join(PROVIDERS_DIR, file);
            const actual = extractMethodSetLiteral(filePath, 'FLAG_METHODS');
            const { missing, extra } = diffSets(actual, CANONICAL_PLUS_REACT);
            if (missing.length || extra.length) {
                failures.push(formatDiff(`providers/${file} FLAG_METHODS drifted`, actual, CANONICAL_PLUS_REACT));
            }
        }
        if (failures.length > 0) {
            assert.fail(
                '\nOne or more React-aware providers have a FLAG_METHODS set that does not match ' +
                'the canonical SDK + React hook union. Update the offending file(s) so the set ' +
                'matches CANONICAL_PLUS_REACT (defined in this test).\n\n' + failures.join('\n\n'),
            );
        }
    });

    test('variantCompletionProvider FLAG_METHODS matches its locked-in subset', () => {
        // This provider intentionally excludes Go methods and useActiveFeatureFlags,
        // because variant-key completion only makes sense where a single string
        // value is returned. If you change this set, update VARIANT_COMPLETION_FLAG_METHODS
        // at the top of this test to match — and double-check the inlinePattern
        // regex inside findNearbyFlagCall() in the provider while you're at it.
        const filePath = path.join(PROVIDERS_DIR, 'variantCompletionProvider.ts');
        const actual = extractMethodSetLiteral(filePath, 'FLAG_METHODS');
        assertSetEqual(
            actual, VARIANT_COMPLETION_FLAG_METHODS,
            'providers/variantCompletionProvider.ts FLAG_METHODS drifted from its locked-in subset.',
        );
    });

    test('every SDK-only provider FLAG_METHODS equals canonical SDK set', () => {
        const failures: string[] = [];
        for (const file of SDK_ONLY_PROVIDERS) {
            const filePath = path.join(PROVIDERS_DIR, file);
            const actual = extractMethodSetLiteral(filePath, 'FLAG_METHODS');
            const { missing, extra } = diffSets(actual, CANONICAL_SDK_FLAG_METHODS);
            if (missing.length || extra.length) {
                failures.push(formatDiff(`providers/${file} FLAG_METHODS drifted`, actual, CANONICAL_SDK_FLAG_METHODS));
            }
        }
        if (failures.length > 0) {
            assert.fail(
                '\nOne or more SDK-only providers have a FLAG_METHODS set that does not match ' +
                'the canonical SDK set. Update the offending file(s) so the set matches ' +
                'CANONICAL_SDK_FLAG_METHODS (defined in this test).\n\n' + failures.join('\n\n'),
            );
        }
    });

    test('all 8 expected provider files exist', () => {
        for (const file of ALL_PROVIDERS) {
            const filePath = path.join(PROVIDERS_DIR, file);
            assert.ok(
                fs.existsSync(filePath),
                `Expected provider file is missing: src/providers/${file}. ` +
                `If you renamed or removed it, update the ALL_PROVIDERS list in this test.`,
            );
        }
        assert.strictEqual(
            ALL_PROVIDERS.length, 8,
            `Expected 8 providers with FLAG_METHODS sets, found ${ALL_PROVIDERS.length}. ` +
            `Update REACT_AWARE_PROVIDERS / SDK_ONLY_PROVIDERS in this test if you added a new one.`,
        );
    });

    // -----------------------------------------------------------------------
    // staleFlagService
    // -----------------------------------------------------------------------

    test('staleFlagService.FLAG_METHODS equals the canonical SDK set', () => {
        const filePath = path.join(SERVICES_DIR, 'staleFlagService.ts');
        const actual = extractMethodSetLiteral(filePath, 'FLAG_METHODS');
        assertSetEqual(
            actual, CANONICAL_SDK_FLAG_METHODS,
            'services/staleFlagService.ts FLAG_METHODS drifted from CANONICAL_SDK_FLAG_METHODS.\n' +
            'This Set is used to decide which calls in user code count as flag references during a stale-flag scan.',
        );
    });

    test('staleFlagService.POSTHOG_FLAG_METHODS array contains every canonical SDK method', () => {
        // Regression: this array was previously missing the Go methods and
        // `get_remote_config_payload`, which silently broke cleanup edits in
        // those languages.
        const filePath = path.join(SERVICES_DIR, 'staleFlagService.ts');
        const arr = extractArrayLiteral(filePath, 'POSTHOG_FLAG_METHODS');
        const actual = new Set(arr);
        assertSetEqual(
            actual, CANONICAL_SDK_FLAG_METHODS,
            'services/staleFlagService.ts POSTHOG_FLAG_METHODS drifted from CANONICAL_SDK_FLAG_METHODS.\n' +
            'This array is used in regex patterns when buildCleanupEditForRef rewrites if-statements and ternaries — ' +
            'missing entries here mean cleanup actions will silently no-op for that language.',
        );
        assert.strictEqual(
            arr.length, new Set(arr).size,
            `services/staleFlagService.ts POSTHOG_FLAG_METHODS contains duplicate entries: ` +
            `[${arr.filter((m, i) => arr.indexOf(m) !== i).join(', ')}]`,
        );
    });

    test('staleFlagService.FLAG_METHODS and POSTHOG_FLAG_METHODS are in sync', () => {
        const filePath = path.join(SERVICES_DIR, 'staleFlagService.ts');
        const setVar = extractMethodSetLiteral(filePath, 'FLAG_METHODS');
        const arrVar = new Set(extractArrayLiteral(filePath, 'POSTHOG_FLAG_METHODS'));
        assertSetEqual(
            setVar, arrVar,
            'staleFlagService.ts has two flag method definitions that disagree:\n' +
            '  FLAG_METHODS (Set, used by scan())\n' +
            '  POSTHOG_FLAG_METHODS (array, used by buildCleanupEditForRef())\n' +
            'Both must list the same methods or scans and cleanups will diverge.',
        );
    });

    // -----------------------------------------------------------------------
    // treeSitterService
    // -----------------------------------------------------------------------

    test('treeSitterService JS_FLAG_METHODS contains the expected JavaScript methods', () => {
        const filePath = path.join(SERVICES_DIR, 'treeSitterService.ts');
        const actual = extractMethodSetLiteral(filePath, 'JS_FLAG_METHODS');
        const expected = new Set([
            'getFeatureFlag', 'isFeatureEnabled', 'getFeatureFlagPayload',
            'getFeatureFlagResult', 'isFeatureFlagEnabled', 'getRemoteConfig',
        ]);
        assertSetEqual(
            actual, expected,
            'services/treeSitterService.ts JS_FLAG_METHODS drifted.\n' +
            'This Set drives PostHog call detection in .js/.jsx/.ts/.tsx files.',
        );
    });

    test('treeSitterService PY_FLAG_METHODS contains the expected Python methods', () => {
        const filePath = path.join(SERVICES_DIR, 'treeSitterService.ts');
        const actual = extractMethodSetLiteral(filePath, 'PY_FLAG_METHODS');
        const expected = new Set([
            'feature_enabled', 'is_feature_enabled', 'get_feature_flag',
            'get_feature_flag_payload', 'get_remote_config',
        ]);
        assertSetEqual(
            actual, expected,
            'services/treeSitterService.ts PY_FLAG_METHODS drifted.\n' +
            'This Set drives PostHog call detection in .py files.',
        );
    });

    test('treeSitterService GO_FLAG_METHODS contains the expected Go methods', () => {
        const filePath = path.join(SERVICES_DIR, 'treeSitterService.ts');
        const actual = extractMethodSetLiteral(filePath, 'GO_FLAG_METHODS');
        const expected = new Set([
            'GetFeatureFlag', 'IsFeatureEnabled', 'GetFeatureFlagPayload',
        ]);
        assertSetEqual(
            actual, expected,
            'services/treeSitterService.ts GO_FLAG_METHODS drifted.\n' +
            'This Set drives PostHog call detection in .go files.',
        );
    });

    test('treeSitterService RB_FLAG_METHODS contains the expected Ruby methods', () => {
        const filePath = path.join(SERVICES_DIR, 'treeSitterService.ts');
        const actual = extractMethodSetLiteral(filePath, 'RB_FLAG_METHODS');
        const expected = new Set([
            'is_feature_enabled', 'get_feature_flag',
            'get_feature_flag_payload', 'get_remote_config_payload',
        ]);
        assertSetEqual(
            actual, expected,
            'services/treeSitterService.ts RB_FLAG_METHODS drifted.\n' +
            'This Set drives PostHog call detection in .rb files.',
        );
    });

    test('union of all language flag method sets equals the canonical SDK set', () => {
        const filePath = path.join(SERVICES_DIR, 'treeSitterService.ts');
        const union = new Set<string>([
            ...extractMethodSetLiteral(filePath, 'JS_FLAG_METHODS'),
            ...extractMethodSetLiteral(filePath, 'PY_FLAG_METHODS'),
            ...extractMethodSetLiteral(filePath, 'GO_FLAG_METHODS'),
            ...extractMethodSetLiteral(filePath, 'RB_FLAG_METHODS'),
        ]);
        assertSetEqual(
            union, CANONICAL_SDK_FLAG_METHODS,
            'The union of JS_FLAG_METHODS / PY_FLAG_METHODS / GO_FLAG_METHODS / RB_FLAG_METHODS in ' +
            'treeSitterService.ts no longer matches the canonical SDK set.\n' +
            'If you added a new SDK method, add it to the appropriate language set AND to ' +
            'CANONICAL_SDK_FLAG_METHODS at the top of this test file.',
        );
    });
});
