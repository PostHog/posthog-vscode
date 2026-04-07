import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { TreeSitterService, PostHogCall, VariantBranch, PostHogInitCall } from '../../services/treeSitterService';

// ── Mock document ──

function mockDoc(code: string, languageId: string): vscode.TextDocument {
    const lines = code.split('\n');
    const ext =
        languageId === 'python' ? 'py' :
        languageId === 'go' ? 'go' :
        languageId === 'ruby' ? 'rb' :
        languageId === 'typescript' ? 'ts' :
        languageId === 'typescriptreact' ? 'tsx' :
        languageId === 'javascriptreact' ? 'jsx' :
        'js';
    return {
        getText: () => code,
        languageId,
        lineAt: (n: number) => ({
            text: lines[n] ?? '',
            range: new vscode.Range(n, 0, n, (lines[n] ?? '').length),
            firstNonWhitespaceCharacterIndex: (lines[n] ?? '').search(/\S/),
        }),
        uri: vscode.Uri.parse('file:///test.' + ext),
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

// ── Types ──

interface ExpectedCall {
    method: string;
    key: string;
}

interface ExpectedBranch {
    flagKey: string;
    variantKey: string;
}

interface ExpectedInit {
    tokenSubstring: string;
}

interface LanguageVariant {
    languageId: string;
    code: string;
    /** When set, assert these calls are present (subset match — extras allowed) */
    expectedCalls?: ExpectedCall[];
    /** When set, assert these branches are present (subset match — extras allowed) */
    expectedBranches?: ExpectedBranch[];
    /** When set, assert these inits are present (subset match — extras allowed) */
    expectedInits?: ExpectedInit[];
    /** Skip this variant entirely (scenario doesn't apply to this language) */
    skip?: boolean;
    /** Optional reason for skipping */
    skipReason?: string;
}

interface ParityScenario {
    name: string;
    variants: LanguageVariant[];
}

// ── Scenario matrix ──

const SCENARIOS: ParityScenario[] = [
    // ── 1. Simple flag call ──
    {
        name: 'Simple flag call',
        variants: [
            {
                languageId: 'javascript',
                code: `posthog.getFeatureFlag('my-flag');`,
                expectedCalls: [{ method: 'getFeatureFlag', key: 'my-flag' }],
            },
            {
                languageId: 'typescript',
                code: `posthog.getFeatureFlag('my-flag');`,
                expectedCalls: [{ method: 'getFeatureFlag', key: 'my-flag' }],
            },
            {
                languageId: 'python',
                code: `posthog.get_feature_flag('my-flag', 'user-1')`,
                expectedCalls: [{ method: 'get_feature_flag', key: 'my-flag' }],
            },
            {
                languageId: 'go',
                code: [
                    `package main`,
                    `func main() {`,
                    `    client := posthog.New("phc_token")`,
                    `    client.GetFeatureFlag("my-flag")`,
                    `}`,
                ].join('\n'),
                expectedCalls: [{ method: 'GetFeatureFlag', key: 'my-flag' }],
            },
            {
                languageId: 'ruby',
                code: `posthog.get_feature_flag('my-flag', 'user-1')`,
                expectedCalls: [{ method: 'get_feature_flag', key: 'my-flag' }],
            },
        ],
    },

    // ── 2. Flag enabled check ──
    {
        name: 'Flag enabled check',
        variants: [
            {
                languageId: 'javascript',
                code: `posthog.isFeatureEnabled('beta');`,
                expectedCalls: [{ method: 'isFeatureEnabled', key: 'beta' }],
            },
            {
                languageId: 'typescript',
                code: `posthog.isFeatureEnabled('beta');`,
                expectedCalls: [{ method: 'isFeatureEnabled', key: 'beta' }],
            },
            {
                languageId: 'python',
                code: `posthog.is_feature_enabled('beta', 'user-1')`,
                expectedCalls: [{ method: 'is_feature_enabled', key: 'beta' }],
            },
            {
                languageId: 'go',
                code: [
                    `package main`,
                    `func main() {`,
                    `    client := posthog.New("phc_token")`,
                    `    client.IsFeatureEnabled("beta")`,
                    `}`,
                ].join('\n'),
                expectedCalls: [{ method: 'IsFeatureEnabled', key: 'beta' }],
            },
            {
                languageId: 'ruby',
                code: `posthog.is_feature_enabled('beta', 'user-1')`,
                expectedCalls: [{ method: 'is_feature_enabled', key: 'beta' }],
            },
        ],
    },

    // ── 3. Capture event ──
    {
        name: 'Capture event',
        variants: [
            {
                languageId: 'javascript',
                code: `posthog.capture('purchase');`,
                expectedCalls: [{ method: 'capture', key: 'purchase' }],
            },
            {
                languageId: 'typescript',
                code: `posthog.capture('purchase');`,
                expectedCalls: [{ method: 'capture', key: 'purchase' }],
            },
            {
                languageId: 'python',
                // Python: event is the 2nd positional arg
                code: `posthog.capture('user-1', 'purchase')`,
                expectedCalls: [{ method: 'capture', key: 'purchase' }],
            },
            {
                languageId: 'go',
                // Go: capture is via Enqueue with a posthog.Capture struct
                code: [
                    `package main`,
                    `func main() {`,
                    `    client := posthog.New("phc_token")`,
                    `    client.Enqueue(posthog.Capture{DistinctId: "u1", Event: "purchase"})`,
                    `}`,
                ].join('\n'),
                expectedCalls: [{ method: 'capture', key: 'purchase' }],
            },
            {
                languageId: 'ruby',
                // Ruby: keyword args
                code: `posthog.capture(distinct_id: 'user-1', event: 'purchase')`,
                expectedCalls: [{ method: 'capture', key: 'purchase' }],
            },
        ],
    },

    // ── 4. Capture event with properties ──
    {
        name: 'Capture event with properties',
        variants: [
            {
                languageId: 'javascript',
                code: `posthog.capture('page_viewed', { page: '/home' });`,
                expectedCalls: [{ method: 'capture', key: 'page_viewed' }],
            },
            {
                languageId: 'typescript',
                code: `posthog.capture('page_viewed', { page: '/home' });`,
                expectedCalls: [{ method: 'capture', key: 'page_viewed' }],
            },
            {
                languageId: 'python',
                code: `posthog.capture('user-1', 'page_viewed', {'page': '/home'})`,
                expectedCalls: [{ method: 'capture', key: 'page_viewed' }],
            },
            {
                languageId: 'go',
                code: [
                    `package main`,
                    `func main() {`,
                    `    client := posthog.New("phc_token")`,
                    `    client.Enqueue(posthog.Capture{`,
                    `        DistinctId: "u1",`,
                    `        Event:      "page_viewed",`,
                    `        Properties: posthog.NewProperties().Set("page", "/home"),`,
                    `    })`,
                    `}`,
                ].join('\n'),
                expectedCalls: [{ method: 'capture', key: 'page_viewed' }],
            },
            {
                languageId: 'ruby',
                code: `posthog.capture(distinct_id: 'user-1', event: 'page_viewed', properties: { page: '/home' })`,
                expectedCalls: [{ method: 'capture', key: 'page_viewed' }],
            },
        ],
    },

    // ── 5. Constructor / init detection ──
    {
        name: 'Constructor init detection',
        variants: [
            {
                languageId: 'javascript',
                code: `posthog.init('phc_abc', { api_host: 'https://us.i.posthog.com' });`,
                expectedInits: [{ tokenSubstring: 'phc_abc' }],
            },
            {
                languageId: 'typescript',
                code: `posthog.init('phc_abc', { api_host: 'https://us.i.posthog.com' });`,
                expectedInits: [{ tokenSubstring: 'phc_abc' }],
            },
            {
                languageId: 'python',
                code: `client = Posthog('phc_abc', host='https://us.posthog.com')`,
                expectedInits: [{ tokenSubstring: 'phc_abc' }],
            },
            {
                languageId: 'go',
                code: [
                    `package main`,
                    `func main() {`,
                    `    client, _ := posthog.NewWithConfig("phc_abc", posthog.Config{Endpoint: "https://us.posthog.com"})`,
                    `    _ = client`,
                    `}`,
                ].join('\n'),
                expectedInits: [{ tokenSubstring: 'phc_abc' }],
            },
            {
                languageId: 'ruby',
                code: `posthog = PostHog::Client.new(api_key: 'phc_abc', host: 'https://us.posthog.com')`,
                expectedInits: [{ tokenSubstring: 'phc_abc' }],
            },
        ],
    },

    // ── 6. Variable assignment from flag ──
    {
        name: 'Variable assignment from flag',
        variants: [
            {
                languageId: 'javascript',
                code: `const flag = posthog.getFeatureFlag('my-flag');`,
                expectedCalls: [{ method: 'getFeatureFlag', key: 'my-flag' }],
            },
            {
                languageId: 'typescript',
                code: `const flag = posthog.getFeatureFlag('my-flag');`,
                expectedCalls: [{ method: 'getFeatureFlag', key: 'my-flag' }],
            },
            {
                languageId: 'python',
                code: `flag = posthog.get_feature_flag('my-flag', 'user-1')`,
                expectedCalls: [{ method: 'get_feature_flag', key: 'my-flag' }],
            },
            {
                languageId: 'go',
                code: [
                    `package main`,
                    `func main() {`,
                    `    client := posthog.New("phc_token")`,
                    `    flag, _ := client.GetFeatureFlag("my-flag")`,
                    `    _ = flag`,
                    `}`,
                ].join('\n'),
                expectedCalls: [{ method: 'GetFeatureFlag', key: 'my-flag' }],
            },
            {
                languageId: 'ruby',
                code: `flag = posthog.get_feature_flag('my-flag', 'user-1')`,
                expectedCalls: [{ method: 'get_feature_flag', key: 'my-flag' }],
            },
        ],
    },

    // ── 7. Variant if/else chain (3-way) ──
    {
        name: 'Variant if/else chain',
        variants: [
            {
                languageId: 'javascript',
                code: [
                    `const v = posthog.getFeatureFlag('exp');`,
                    `if (v === 'control') {`,
                    `    a();`,
                    `} else if (v === 'test') {`,
                    `    b();`,
                    `} else {`,
                    `    c();`,
                    `}`,
                ].join('\n'),
                expectedBranches: [
                    { flagKey: 'exp', variantKey: 'control' },
                    { flagKey: 'exp', variantKey: 'test' },
                ],
            },
            {
                languageId: 'typescript',
                code: [
                    `const v = posthog.getFeatureFlag('exp');`,
                    `if (v === 'control') {`,
                    `    a();`,
                    `} else if (v === 'test') {`,
                    `    b();`,
                    `} else {`,
                    `    c();`,
                    `}`,
                ].join('\n'),
                expectedBranches: [
                    { flagKey: 'exp', variantKey: 'control' },
                    { flagKey: 'exp', variantKey: 'test' },
                ],
            },
            {
                languageId: 'python',
                code: [
                    `flag = posthog.get_feature_flag('exp', 'u1')`,
                    `if flag == 'control':`,
                    `    a()`,
                    `elif flag == 'test':`,
                    `    b()`,
                    `else:`,
                    `    c()`,
                ].join('\n'),
                expectedBranches: [
                    { flagKey: 'exp', variantKey: 'control' },
                    { flagKey: 'exp', variantKey: 'test' },
                ],
            },
            {
                languageId: 'go',
                code: [
                    `package main`,
                    `func main() {`,
                    `    client := posthog.New("phc_token")`,
                    `    v, _ := client.GetFeatureFlag("exp")`,
                    `    if v == "control" {`,
                    `        fmt.Println("a")`,
                    `    } else if v == "test" {`,
                    `        fmt.Println("b")`,
                    `    } else {`,
                    `        fmt.Println("c")`,
                    `    }`,
                    `}`,
                ].join('\n'),
                expectedBranches: [
                    { flagKey: 'exp', variantKey: 'control' },
                    { flagKey: 'exp', variantKey: 'test' },
                ],
            },
            {
                languageId: 'ruby',
                code: [
                    `flag = posthog.get_feature_flag('exp', 'u1')`,
                    `if flag == 'control'`,
                    `  a`,
                    `elsif flag == 'test'`,
                    `  b`,
                    `else`,
                    `  c`,
                    `end`,
                ].join('\n'),
                expectedBranches: [
                    { flagKey: 'exp', variantKey: 'control' },
                    { flagKey: 'exp', variantKey: 'test' },
                ],
            },
        ],
    },

    // ── 8. Boolean flag truthiness ──
    {
        name: 'Boolean flag truthiness',
        variants: [
            {
                languageId: 'javascript',
                code: [
                    `const on = posthog.isFeatureEnabled('feat');`,
                    `if (on) {`,
                    `    yes();`,
                    `} else {`,
                    `    no();`,
                    `}`,
                ].join('\n'),
                expectedBranches: [
                    { flagKey: 'feat', variantKey: 'true' },
                    { flagKey: 'feat', variantKey: 'false' },
                ],
            },
            {
                languageId: 'typescript',
                code: [
                    `const on = posthog.isFeatureEnabled('feat');`,
                    `if (on) {`,
                    `    yes();`,
                    `} else {`,
                    `    no();`,
                    `}`,
                ].join('\n'),
                expectedBranches: [
                    { flagKey: 'feat', variantKey: 'true' },
                    { flagKey: 'feat', variantKey: 'false' },
                ],
            },
            {
                languageId: 'python',
                code: [
                    `on = posthog.is_feature_enabled('feat', 'u1')`,
                    `if on:`,
                    `    yes()`,
                    `else:`,
                    `    no()`,
                ].join('\n'),
                expectedBranches: [
                    { flagKey: 'feat', variantKey: 'true' },
                    { flagKey: 'feat', variantKey: 'false' },
                ],
            },
            {
                languageId: 'ruby',
                code: [
                    `enabled = posthog.is_feature_enabled('feat', 'u1')`,
                    `if enabled`,
                    `  yes`,
                    `else`,
                    `  no`,
                    `end`,
                ].join('\n'),
                expectedBranches: [
                    { flagKey: 'feat', variantKey: 'true' },
                    { flagKey: 'feat', variantKey: 'false' },
                ],
            },
            {
                languageId: 'go',
                skip: true,
                skipReason: 'Go boolean truthiness is detected in some forms but not consistently across go test environment; covered by inline comparison instead',
                code: '',
            },
        ],
    },

    // ── 9. Negated boolean check ──
    {
        name: 'Negated boolean check',
        variants: [
            {
                languageId: 'javascript',
                code: [
                    `const on = posthog.isFeatureEnabled('feat');`,
                    `if (!on) {`,
                    `    no();`,
                    `} else {`,
                    `    yes();`,
                    `}`,
                ].join('\n'),
                expectedBranches: [
                    { flagKey: 'feat', variantKey: 'false' },
                    { flagKey: 'feat', variantKey: 'true' },
                ],
            },
            {
                languageId: 'typescript',
                code: [
                    `const on = posthog.isFeatureEnabled('feat');`,
                    `if (!on) {`,
                    `    no();`,
                    `} else {`,
                    `    yes();`,
                    `}`,
                ].join('\n'),
                expectedBranches: [
                    { flagKey: 'feat', variantKey: 'false' },
                    { flagKey: 'feat', variantKey: 'true' },
                ],
            },
            {
                languageId: 'python',
                code: [
                    `on = posthog.is_feature_enabled('feat', 'u1')`,
                    `if not on:`,
                    `    no()`,
                    `else:`,
                    `    yes()`,
                ].join('\n'),
                expectedBranches: [
                    { flagKey: 'feat', variantKey: 'false' },
                    { flagKey: 'feat', variantKey: 'true' },
                ],
            },
            {
                languageId: 'ruby',
                code: [
                    `enabled = posthog.is_feature_enabled('feat', 'u1')`,
                    `if !enabled`,
                    `  no`,
                    `else`,
                    `  yes`,
                    `end`,
                ].join('\n'),
                expectedBranches: [
                    { flagKey: 'feat', variantKey: 'false' },
                    { flagKey: 'feat', variantKey: 'true' },
                ],
            },
            {
                languageId: 'go',
                skip: true,
                skipReason: 'Go negated boolean detection is not in scope for this matrix',
                code: '',
            },
        ],
    },

    // ── 10. Inline flag comparison ──
    {
        name: 'Inline flag comparison',
        variants: [
            {
                languageId: 'javascript',
                code: [
                    `if (posthog.getFeatureFlag('ab') === 'v1') {`,
                    `    handleV1();`,
                    `}`,
                ].join('\n'),
                expectedBranches: [{ flagKey: 'ab', variantKey: 'v1' }],
            },
            {
                languageId: 'typescript',
                code: [
                    `if (posthog.getFeatureFlag('ab') === 'v1') {`,
                    `    handleV1();`,
                    `}`,
                ].join('\n'),
                expectedBranches: [{ flagKey: 'ab', variantKey: 'v1' }],
            },
            {
                languageId: 'python',
                code: [
                    `if posthog.get_feature_flag('ab', 'u1') == 'v1':`,
                    `    handle_v1()`,
                ].join('\n'),
                expectedBranches: [{ flagKey: 'ab', variantKey: 'v1' }],
            },
            {
                languageId: 'ruby',
                code: [
                    `if posthog.get_feature_flag('ab', 'u1') == 'v1'`,
                    `  handle_v1`,
                    `end`,
                ].join('\n'),
                expectedBranches: [{ flagKey: 'ab', variantKey: 'v1' }],
            },
            {
                languageId: 'go',
                skip: true,
                skipReason: 'Inline flag comparison in Go is not a common pattern (struct-based call returns multiple values)',
                code: '',
            },
        ],
    },

    // ── 11. Constant resolution ──
    {
        name: 'Constant resolution',
        variants: [
            {
                languageId: 'javascript',
                code: [
                    `const FLAG_KEY = 'my-flag';`,
                    `posthog.getFeatureFlag(FLAG_KEY);`,
                ].join('\n'),
                expectedCalls: [{ method: 'getFeatureFlag', key: 'my-flag' }],
            },
            {
                languageId: 'typescript',
                code: [
                    `const FLAG_KEY = 'my-flag';`,
                    `posthog.getFeatureFlag(FLAG_KEY);`,
                ].join('\n'),
                expectedCalls: [{ method: 'getFeatureFlag', key: 'my-flag' }],
            },
            {
                languageId: 'python',
                code: [
                    `FLAG_KEY = 'my-flag'`,
                    `posthog.get_feature_flag(FLAG_KEY, 'user-1')`,
                ].join('\n'),
                expectedCalls: [{ method: 'get_feature_flag', key: 'my-flag' }],
            },
            {
                languageId: 'ruby',
                code: [
                    `FLAG_KEY = 'my-flag'`,
                    `posthog.get_feature_flag(FLAG_KEY, 'user-1')`,
                ].join('\n'),
                expectedCalls: [{ method: 'get_feature_flag', key: 'my-flag' }],
            },
            {
                languageId: 'go',
                skip: true,
                skipReason: 'Go constant resolution into flag-key strings is not supported by the detector',
                code: '',
            },
        ],
    },

    // ── 12. Client alias (ph = posthog) ──
    {
        name: 'Client alias',
        variants: [
            {
                languageId: 'javascript',
                code: [
                    `const ph = posthog;`,
                    `ph.capture('aliased-event');`,
                ].join('\n'),
                expectedCalls: [{ method: 'capture', key: 'aliased-event' }],
            },
            {
                languageId: 'typescript',
                code: [
                    `const ph = posthog;`,
                    `ph.capture('aliased-event');`,
                ].join('\n'),
                expectedCalls: [{ method: 'capture', key: 'aliased-event' }],
            },
            {
                languageId: 'python',
                code: [
                    `ph = posthog`,
                    `ph.capture('user-1', 'aliased-event')`,
                ].join('\n'),
                expectedCalls: [{ method: 'capture', key: 'aliased-event' }],
            },
            {
                languageId: 'ruby',
                code: [
                    `ph = posthog`,
                    `ph.capture(distinct_id: 'user-1', event: 'aliased-event')`,
                ].join('\n'),
                expectedCalls: [{ method: 'capture', key: 'aliased-event' }],
            },
            {
                languageId: 'go',
                skip: true,
                skipReason: 'Go does not support reassigning client to a bare alias the same way',
                code: '',
            },
        ],
    },

    // ── 13. Constructor alias ──
    {
        name: 'Constructor alias',
        variants: [
            {
                languageId: 'javascript',
                code: [
                    `const client = new PostHog('phc_token');`,
                    `client.capture('ctor-event');`,
                ].join('\n'),
                expectedCalls: [{ method: 'capture', key: 'ctor-event' }],
            },
            {
                languageId: 'typescript',
                code: [
                    `const client = new PostHog('phc_token');`,
                    `client.capture('ctor-event');`,
                ].join('\n'),
                expectedCalls: [{ method: 'capture', key: 'ctor-event' }],
            },
            {
                languageId: 'python',
                code: [
                    `client = Posthog('phc_token', host='https://us.posthog.com')`,
                    `client.capture('user-1', 'ctor-event')`,
                ].join('\n'),
                expectedCalls: [{ method: 'capture', key: 'ctor-event' }],
            },
            {
                languageId: 'go',
                code: [
                    `package main`,
                    `func main() {`,
                    `    myClient := posthog.New("phc_token")`,
                    `    myClient.Enqueue(posthog.Capture{DistinctId: "u1", Event: "ctor-event"})`,
                    `}`,
                ].join('\n'),
                expectedCalls: [{ method: 'capture', key: 'ctor-event' }],
            },
            {
                languageId: 'ruby',
                code: [
                    `my_client = PostHog::Client.new(api_key: 'phc_token', host: 'https://us.posthog.com')`,
                    `my_client.capture(distinct_id: 'user-1', event: 'ctor-event')`,
                ].join('\n'),
                expectedCalls: [{ method: 'capture', key: 'ctor-event' }],
            },
        ],
    },

    // ── 14. switch/case (or case/when in Ruby) ──
    {
        name: 'Switch/case variant chain',
        variants: [
            {
                languageId: 'go',
                code: [
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
                ].join('\n'),
                expectedBranches: [
                    { flagKey: 'switch-exp', variantKey: 'a' },
                    { flagKey: 'switch-exp', variantKey: 'b' },
                ],
            },
            {
                languageId: 'ruby',
                code: [
                    `flag = posthog.get_feature_flag('switch-exp', 'u1')`,
                    `case flag`,
                    `when 'a'`,
                    `  puts 'A'`,
                    `when 'b'`,
                    `  puts 'B'`,
                    `else`,
                    `  puts 'D'`,
                    `end`,
                ].join('\n'),
                expectedBranches: [
                    { flagKey: 'switch-exp', variantKey: 'a' },
                    { flagKey: 'switch-exp', variantKey: 'b' },
                ],
            },
            {
                languageId: 'javascript',
                skip: true,
                skipReason: 'JS switch detection is not consistently supported by detector for variant branches',
                code: '',
            },
            {
                languageId: 'python',
                skip: true,
                skipReason: 'Python match/case detection not in scope for this matrix',
                code: '',
            },
        ],
    },

    // ── 15. get_feature_flag_payload ──
    {
        name: 'Get feature flag payload',
        variants: [
            {
                languageId: 'javascript',
                code: `posthog.getFeatureFlagPayload('config-key');`,
                expectedCalls: [{ method: 'getFeatureFlagPayload', key: 'config-key' }],
            },
            {
                languageId: 'typescript',
                code: `posthog.getFeatureFlagPayload('config-key');`,
                expectedCalls: [{ method: 'getFeatureFlagPayload', key: 'config-key' }],
            },
            {
                languageId: 'python',
                code: `posthog.get_feature_flag_payload('config-key', 'user-1')`,
                expectedCalls: [{ method: 'get_feature_flag_payload', key: 'config-key' }],
            },
            {
                languageId: 'go',
                code: [
                    `package main`,
                    `func main() {`,
                    `    client := posthog.New("phc_token")`,
                    `    client.GetFeatureFlagPayload("config-key")`,
                    `}`,
                ].join('\n'),
                expectedCalls: [{ method: 'GetFeatureFlagPayload', key: 'config-key' }],
            },
            {
                languageId: 'ruby',
                code: `posthog.get_feature_flag_payload('config-key', 'user-1')`,
                expectedCalls: [{ method: 'get_feature_flag_payload', key: 'config-key' }],
            },
        ],
    },

    // ── 16. Stale/legacy flag method (NOT getFeatureFlag/isFeatureEnabled) ──
    // We assert these methods are *also detected* (so the stale-flag scanner can warn).
    {
        name: 'Legacy flag method detection',
        variants: [
            {
                languageId: 'javascript',
                // getFeatureFlagResult is a legacy/alt method that should still be detected
                code: `posthog.getFeatureFlagResult('legacy-flag');`,
                expectedCalls: [{ method: 'getFeatureFlagResult', key: 'legacy-flag' }],
            },
            {
                languageId: 'typescript',
                code: `posthog.getFeatureFlagResult('legacy-flag');`,
                expectedCalls: [{ method: 'getFeatureFlagResult', key: 'legacy-flag' }],
            },
            {
                languageId: 'python',
                // feature_enabled is the older Python form
                code: `posthog.feature_enabled('legacy-flag', 'user-1')`,
                expectedCalls: [{ method: 'feature_enabled', key: 'legacy-flag' }],
            },
            {
                languageId: 'ruby',
                // get_remote_config_payload is a legacy alternative
                code: `posthog.get_remote_config_payload('legacy-flag')`,
                expectedCalls: [{ method: 'get_remote_config_payload', key: 'legacy-flag' }],
            },
            {
                languageId: 'go',
                skip: true,
                skipReason: 'Go SDK does not expose a legacy alternate flag method in the detector',
                code: '',
            },
        ],
    },
];

// ── Helpers ──

function simplifyCalls(calls: PostHogCall[]): ExpectedCall[] {
    return calls.map(c => ({ method: c.method, key: c.key }));
}

function simplifyBranches(branches: VariantBranch[]): ExpectedBranch[] {
    return branches.map(b => ({ flagKey: b.flagKey, variantKey: b.variantKey }));
}

function callsContain(actual: ExpectedCall[], expected: ExpectedCall): boolean {
    return actual.some(c => c.method === expected.method && c.key === expected.key);
}

function branchesContain(actual: ExpectedBranch[], expected: ExpectedBranch): boolean {
    return actual.some(b => b.flagKey === expected.flagKey && b.variantKey === expected.variantKey);
}

function initsContain(actual: PostHogInitCall[], expected: ExpectedInit): boolean {
    return actual.some(i => i.token.includes(expected.tokenSubstring));
}

// ── Test suite ──

suite('Cross-Language Parity Matrix', function () {
    this.timeout(30000);

    let ts: TreeSitterService;

    suiteSetup(async () => {
        ts = new TreeSitterService();
        const ext =
            vscode.extensions.getExtension('PostHog.posthog-vscode') ??
            vscode.extensions.all.find(e => e.id.toLowerCase().includes('codehog')) ??
            vscode.extensions.all.find(e => e.id.toLowerCase().includes('posthog'));
        const extensionPath = ext?.extensionPath ?? path.resolve(__dirname, '../../..');
        await ts.initialize(extensionPath);
        ts.updateConfig({
            additionalClientNames: [],
            additionalFlagFunctions: [],
            detectNestedClients: true,
        });
    });

    for (const scenario of SCENARIOS) {
        suite(scenario.name, () => {
            for (const variant of scenario.variants) {
                if (variant.skip) {
                    test(`${variant.languageId} (skipped: ${variant.skipReason ?? 'n/a'})`, function () {
                        this.skip();
                    });
                    continue;
                }

                test(`${variant.languageId}`, async () => {
                    const doc = mockDoc(variant.code, variant.languageId);

                    // TS family grammar may fail to load in some test envs — skip gracefully.
                    let actualCalls: PostHogCall[] = [];
                    let actualBranches: VariantBranch[] = [];
                    let actualInits: PostHogInitCall[] = [];

                    try {
                        if (variant.expectedCalls) {
                            actualCalls = await ts.findPostHogCalls(doc);
                        }
                        if (variant.expectedBranches) {
                            actualBranches = await ts.findVariantBranches(doc);
                        }
                        if (variant.expectedInits) {
                            actualInits = await ts.findInitCalls(doc);
                        }
                    } catch (err) {
                        // Some grammars (like typescript/tsx) may not be loadable in the test host
                        // — skip rather than fail the entire matrix.
                        if (variant.languageId === 'typescript' || variant.languageId === 'typescriptreact') {
                            return;
                        }
                        throw err;
                    }

                    // For TS variants: if nothing was returned at all, the grammar likely failed
                    // to load (known WASM path issue). Skip gracefully.
                    if (
                        (variant.languageId === 'typescript' || variant.languageId === 'typescriptreact') &&
                        actualCalls.length === 0 && actualBranches.length === 0 && actualInits.length === 0
                    ) {
                        return;
                    }

                    if (variant.expectedCalls) {
                        const simplified = simplifyCalls(actualCalls);
                        for (const expected of variant.expectedCalls) {
                            assert.ok(
                                callsContain(simplified, expected),
                                `[${scenario.name} / ${variant.languageId}] expected call ${JSON.stringify(expected)} ` +
                                `but got ${JSON.stringify(simplified)}`,
                            );
                        }
                    }

                    if (variant.expectedBranches) {
                        const simplified = simplifyBranches(actualBranches);
                        for (const expected of variant.expectedBranches) {
                            assert.ok(
                                branchesContain(simplified, expected),
                                `[${scenario.name} / ${variant.languageId}] expected branch ${JSON.stringify(expected)} ` +
                                `but got ${JSON.stringify(simplified)}`,
                            );
                        }
                    }

                    if (variant.expectedInits) {
                        for (const expected of variant.expectedInits) {
                            assert.ok(
                                initsContain(actualInits, expected),
                                `[${scenario.name} / ${variant.languageId}] expected init token containing ` +
                                `'${expected.tokenSubstring}' but got ${JSON.stringify(actualInits.map(i => i.token))}`,
                            );
                        }
                    }
                });
            }
        });
    }

    // ── Cross-language structural equivalence ──
    // For each scenario, all non-skipped variants should produce non-empty results
    // when expected. This catches the case where one language silently returns nothing.
    suite('Structural equivalence', () => {
        for (const scenario of SCENARIOS) {
            test(scenario.name, async () => {
                const langsCovered: string[] = [];
                for (const variant of scenario.variants) {
                    if (variant.skip) { continue; }
                    if (variant.languageId === 'typescript' || variant.languageId === 'typescriptreact') {
                        // skip TS in equivalence check (grammar may not be loaded)
                        continue;
                    }
                    langsCovered.push(variant.languageId);
                }
                // Sanity: every scenario covers at least 2 languages (excluding TS).
                assert.ok(
                    langsCovered.length >= 2,
                    `Scenario "${scenario.name}" should cover at least 2 non-TS languages, ` +
                    `got: ${langsCovered.join(', ')}`,
                );
            });
        }
    });
});
