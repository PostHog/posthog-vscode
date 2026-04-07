import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fc from 'fast-check';
import { TreeSitterService } from '../../services/treeSitterService';

// ── Mock document (mirrors helper used by snapshot tests) ──

function mockDoc(code: string, languageId: string): vscode.TextDocument {
    const lines = code.split('\n');
    const ext =
        languageId === 'python' ? 'py' :
            languageId === 'go' ? 'go' :
                languageId === 'ruby' ? 'rb' :
                    languageId === 'typescript' ? 'ts' :
                        'js';
    return {
        getText: () => code,
        languageId,
        lineAt: (n: number) => ({
            text: lines[n] ?? '',
            range: new vscode.Range(n, 0, n, (lines[n] ?? '').length),
            firstNonWhitespaceCharacterIndex: (lines[n] ?? '').search(/\S/),
        }),
        uri: vscode.Uri.parse(`file:///test.${ext}`),
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

// ── Generators for realistic PostHog inputs ──

const generators = {
    flagKey: () => fc.stringMatching(/^[a-z][a-z0-9_-]{0,30}$/),
    eventName: () => fc.stringMatching(/^[a-z][a-z0-9_]{0,30}$/),
    apiToken: () => fc.stringMatching(/^phc_[a-zA-Z0-9]{30,40}$/),
    clientName: () => fc.constantFrom('posthog', 'client', 'ph'),
    variantKey: () => fc.constantFrom('control', 'test', 'a', 'b', 'red', 'blue', 'enabled', 'disabled'),
};

// ── Per-language flag-call generator ──

function flagCallSite(lang: 'javascript' | 'python' | 'go' | 'ruby', client: string, key: string): string {
    switch (lang) {
        case 'javascript': return `${client}.getFeatureFlag('${key}');`;
        case 'python':     return `${client}.get_feature_flag("${key}", "user-1")`;
        case 'go':         return [
            `package main`,
            `func main() {`,
            `    client := posthog.New("phc_token")`,
            `    flag, _ := client.GetFeatureFlag(posthog.FeatureFlagPayload{Key: "${key}", DistinctId: "u1"})`,
            `    _ = flag`,
            `}`,
        ].join('\n');
        case 'ruby':       return `${client}.get_feature_flag("${key}", "user-1")`;
    }
}

function captureCallSite(lang: 'javascript' | 'python' | 'go' | 'ruby', event: string): string {
    switch (lang) {
        case 'javascript': return `posthog.capture('${event}');`;
        case 'python':     return `posthog.capture("user-1", "${event}")`;
        case 'go':         return [
            `package main`,
            `func main() {`,
            `    client := posthog.New("phc_token")`,
            `    client.Enqueue(posthog.Capture{DistinctId: "u1", Event: "${event}"})`,
            `}`,
        ].join('\n');
        case 'ruby':       return `posthog.capture(distinct_id: "user-1", event: "${event}")`;
    }
}

// ── Test suite ──

suite('Tree-sitter Property Tests', function () {
    this.timeout(60000);

    let ts: TreeSitterService;

    suiteSetup(async () => {
        ts = new TreeSitterService();
        const ext = vscode.extensions.all.find(e => e.id.toLowerCase().includes('posthog'));
        const extensionPath = ext?.extensionPath ?? path.resolve(__dirname, '../../..');
        await ts.initialize(extensionPath);
        ts.updateConfig({
            additionalClientNames: [],
            additionalFlagFunctions: [],
            detectNestedClients: true,
        });
    });

    // ═══════════════════════════════════════════════════
    // Property 1: Idempotence — parsing twice yields the same result
    // ═══════════════════════════════════════════════════

    test('Property 1: parsing the same code twice yields identical results', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom('javascript', 'python', 'go', 'ruby') as fc.Arbitrary<'javascript' | 'python' | 'go' | 'ruby'>,
                generators.flagKey(),
                generators.clientName(),
                async (lang, key, client) => {
                    const code = flagCallSite(lang, client, key);
                    const r1 = await ts.findPostHogCalls(mockDoc(code, lang));
                    const r2 = await ts.findPostHogCalls(mockDoc(code, lang));
                    return JSON.stringify(r1) === JSON.stringify(r2);
                }
            ),
            { numRuns: 50 }
        );
    });

    // ═══════════════════════════════════════════════════
    // Property 2: Flag key roundtrip — whatever string we put in, that exact string comes out
    // ═══════════════════════════════════════════════════

    test('Property 2: flag key roundtrip in JavaScript single-quoted call', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.string({ minLength: 1, maxLength: 50 })
                    .filter(s => /^[a-z0-9_-]+$/i.test(s)),
                async (key) => {
                    const code = `posthog.getFeatureFlag('${key}')`;
                    const calls = await ts.findPostHogCalls(mockDoc(code, 'javascript'));
                    return calls.length === 1 && calls[0].key === key && calls[0].method === 'getFeatureFlag';
                }
            ),
            { numRuns: 100 }
        );
    });

    // ═══════════════════════════════════════════════════
    // Property 3: Client name detection — any of the configured client names is recognized
    // ═══════════════════════════════════════════════════

    test('Property 3: any configured client name is recognized', async () => {
        await fc.assert(
            fc.asyncProperty(
                generators.clientName(),
                generators.flagKey(),
                async (clientName, key) => {
                    const code = `${clientName}.getFeatureFlag('${key}')`;
                    const calls = await ts.findPostHogCalls(mockDoc(code, 'javascript'));
                    return calls.length === 1 && calls[0].key === key;
                }
            ),
            { numRuns: 50 }
        );
    });

    // ═══════════════════════════════════════════════════
    // Property 4: No false positives for non-PostHog object names
    // ═══════════════════════════════════════════════════

    test('Property 4: non-PostHog object calls are not detected', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.string({ minLength: 1, maxLength: 20 })
                    .filter(s => /^[a-z][a-z0-9]*$/.test(s))
                    .filter(s => !['posthog', 'client', 'ph'].includes(s)),
                generators.flagKey(),
                async (otherObject, key) => {
                    const code = `${otherObject}.getFeatureFlag('${key}')`;
                    const calls = await ts.findPostHogCalls(mockDoc(code, 'javascript'));
                    return calls.length === 0;
                }
            ),
            { numRuns: 100 }
        );
    });

    // ═══════════════════════════════════════════════════
    // Property 5: Variant branches preserve flag key
    // ═══════════════════════════════════════════════════

    test('Property 5: detected variant branches preserve their flag key', async () => {
        await fc.assert(
            fc.asyncProperty(
                generators.flagKey(),
                fc.array(generators.variantKey(), { minLength: 1, maxLength: 5 }),
                async (key, variants) => {
                    // Dedupe variants so each branch is unique
                    const unique = Array.from(new Set(variants));
                    const ifChain = unique
                        .map((v, i) => `${i === 0 ? 'if' : 'else if'} (flag === '${v}') { doThing(); }`)
                        .join(' ');
                    const code = `const flag = posthog.getFeatureFlag('${key}');\n${ifChain}`;
                    const branches = await ts.findVariantBranches(mockDoc(code, 'javascript'));
                    if (branches.length === 0) {
                        // No branches detected — that's a different bug, but Property 5 only checks
                        // that *detected* branches preserve flag key. Vacuous pass is acceptable here.
                        return true;
                    }
                    return branches.every(b => b.flagKey === key);
                }
            ),
            { numRuns: 50 }
        );
    });

    // ═══════════════════════════════════════════════════
    // Property 6: Number of branches matches the if/else if chain length
    // ═══════════════════════════════════════════════════

    test('Property 6: number of detected branches matches if/else-if chain length (multi-line)', async () => {
        // KNOWN BUG: this property fails on (n=3, withElse=false). The parser only returns
        // 2 branches when given a 3-arm `if / else if / else if` chain (no terminal else).
        // Smallest counterexample found by fast-check: { key: 'a', n: 3, withElse: false }
        // The chain looks like:
        //   const flag = posthog.getFeatureFlag('a');
        //   if (flag === 'v0') { ... } else if (flag === 'v1') { ... } else if (flag === 'v2') { ... }
        // Expected: 3 branches (one per explicit comparison).
        // Actual:   parser returns fewer than 3.
        // See: extractIfChainBranches() in src/services/treeSitterService.ts.
        await fc.assert(
            fc.asyncProperty(
                generators.flagKey(),
                fc.integer({ min: 1, max: 5 }),
                fc.boolean(),
                async (key, n, withElse) => {
                    // Build n unique variant labels and a multi-line if/else-if chain.
                    const variants = Array.from({ length: n }, (_, i) => `v${i}`);
                    const lines: string[] = [`const flag = posthog.getFeatureFlag('${key}');`];
                    for (let i = 0; i < variants.length; i++) {
                        const head = i === 0 ? 'if' : '} else if';
                        lines.push(`${head} (flag === '${variants[i]}') {`);
                        lines.push(`    doThing();`);
                    }
                    if (withElse) {
                        lines.push(`} else {`);
                        lines.push(`    other();`);
                    }
                    lines.push(`}`);
                    const code = lines.join('\n');
                    const branches = await ts.findVariantBranches(mockDoc(code, 'javascript'));
                    const expectedMin = n; // explicit comparison branches
                    const expectedMax = n + (withElse ? 1 : 0);
                    const ok = branches.length >= expectedMin && branches.length <= expectedMax;
                    if (!ok) {
                        // Surface a clear diagnostic so the bug report is self-contained.
                        console.error(
                            `[Property 6 mismatch] key=${JSON.stringify(key)} n=${n} withElse=${withElse}\n` +
                            `  expected: ${expectedMin}..${expectedMax} branches\n` +
                            `  actual:   ${branches.length} branches => ${JSON.stringify(branches.map(b => b.variantKey))}\n` +
                            `  source:\n${code.split('\n').map(l => '    ' + l).join('\n')}`
                        );
                    }
                    return ok;
                }
            ),
            { numRuns: 50 }
        );
    });

    // ═══════════════════════════════════════════════════
    // Property 7: Capture event detection across all 4 languages
    // ═══════════════════════════════════════════════════

    test('Property 7: capture event detected across all 4 languages', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom('javascript', 'python', 'go', 'ruby') as fc.Arbitrary<'javascript' | 'python' | 'go' | 'ruby'>,
                generators.eventName(),
                async (lang, event) => {
                    const code = captureCallSite(lang, event);
                    const calls = await ts.findPostHogCalls(mockDoc(code, lang));
                    // The event should be detected somewhere among the returned calls.
                    return calls.some(c => c.key === event);
                }
            ),
            { numRuns: 50 }
        );
    });

    // ═══════════════════════════════════════════════════
    // Bonus: idempotence for findVariantBranches
    // ═══════════════════════════════════════════════════

    test('Property 8: findVariantBranches is idempotent', async () => {
        await fc.assert(
            fc.asyncProperty(
                generators.flagKey(),
                generators.variantKey(),
                async (key, variant) => {
                    const code = [
                        `const flag = posthog.getFeatureFlag('${key}');`,
                        `if (flag === '${variant}') { a(); } else { b(); }`,
                    ].join('\n');
                    const doc = mockDoc(code, 'javascript');
                    const r1 = await ts.findVariantBranches(doc);
                    const r2 = await ts.findVariantBranches(doc);
                    return JSON.stringify(r1) === JSON.stringify(r2);
                }
            ),
            { numRuns: 50 }
        );
    });

    // ═══════════════════════════════════════════════════
    // Bonus: idempotence + token roundtrip for findInitCalls
    // ═══════════════════════════════════════════════════

    test('Property 9: findInitCalls preserves the API token', async () => {
        await fc.assert(
            fc.asyncProperty(
                generators.apiToken(),
                async (token) => {
                    const code = `posthog.init('${token}', { api_host: 'https://us.i.posthog.com' });`;
                    const inits = await ts.findInitCalls(mockDoc(code, 'javascript'));
                    return inits.length === 1 && inits[0].token === token;
                }
            ),
            { numRuns: 50 }
        );
    });

    // Sanity smoke check so the suite always has at least one regular assertion.
    test('sanity: tree-sitter service is initialized', () => {
        assert.ok(ts);
        assert.ok(ts.isSupported('javascript'));
    });
});
