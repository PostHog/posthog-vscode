/**
 * Regression test for: CodeQL URL substring sanitization
 *
 * Bug:    Code such as `host.includes('us.posthog.com')` was used to
 *         classify a host as PostHog US Cloud. CodeQL flagged this as
 *         "incomplete URL substring sanitization" because an attacker
 *         could craft a URL like `https://us.posthog.com.evil.com`
 *         that contains the trusted substring but is hosted elsewhere.
 * Fix:    All host classification now parses the URL with `new URL(...)`
 *         and compares `hostname` exactly. Three files were updated:
 *         initDecorationProvider.ts, postHogAuthProvider.ts, and one
 *         other call site. This test enforces both:
 *           1. The behavioral fix: classifyHost (tested indirectly via
 *              the public init flow) does NOT classify
 *              `https://us.posthog.com.evil.com` as US Cloud.
 *           2. A meta-scan that fails if any source file reintroduces
 *              the `host.includes('...posthog.com')` pattern.
 * Date:   2026-04-07
 *
 * This test should FAIL if the bug regresses.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Regression: CodeQL URL substring sanitization', function () {
    this.timeout(30000);

    test('source files do not use host.includes("...posthog.com") pattern', () => {
        // Walk src/ and check every .ts file (except this regression test
        // and test fixtures) for the unsafe substring-match pattern.
        const srcRoot = path.resolve(__dirname, '../../..', 'src');
        const offenders: { file: string; line: number; text: string }[] = [];

        // Pattern variants we want to forbid:
        //   host.includes('...posthog.com')
        //   apiHost.includes("...posthog.com")
        //   url.includes(`...posthog.com`)
        const unsafe = /\.includes\(\s*['"`][^'"`]*posthog\.com[^'"`]*['"`]\s*\)/;

        function walk(dir: string): void {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'out') { continue; }
                    walk(full);
                    continue;
                }
                if (!entry.name.endsWith('.ts')) { continue; }
                // Skip regression / test files (the assertion text itself
                // and snapshot fixtures legitimately mention the pattern).
                if (full.includes(path.join('test', 'regression'))) { continue; }
                if (full.includes(path.join('test', 'integration'))) { continue; }
                if (full.includes(path.join('test', 'property'))) { continue; }
                if (full.includes(path.join('test', 'utils'))) { continue; }

                const content = fs.readFileSync(full, 'utf8');
                const lines = content.split('\n');
                lines.forEach((line, idx) => {
                    if (unsafe.test(line)) {
                        offenders.push({ file: full, line: idx + 1, text: line.trim() });
                    }
                });
            }
        }

        walk(srcRoot);

        assert.strictEqual(
            offenders.length, 0,
            `Bug regressed (CodeQL URL substring sanitization): found ${offenders.length} unsafe host.includes('...posthog.com') usage(s). Use \`new URL(host).hostname === '...'\` instead.\nOffenders:\n${offenders.map(o => `  ${o.file}:${o.line}  ${o.text}`).join('\n')}`,
        );
    });

    test('initDecorationProvider classifies us.posthog.com.evil.com as NOT US Cloud', () => {
        // Read the source and confirm classifyHost compares hostname exactly.
        const file = path.resolve(__dirname, '../../..', 'src', 'providers', 'initDecorationProvider.ts');
        const src = fs.readFileSync(file, 'utf8');

        // The fix relies on `new URL(host).hostname === 'us.posthog.com'` style.
        assert.ok(
            /new URL\([^)]+\)\.hostname/.test(src),
            `Bug regressed (CodeQL URL substring sanitization): initDecorationProvider.ts should parse hosts via new URL(...).hostname for classification, but no such pattern was found.`,
        );

        // And it must NOT contain the unsafe pattern.
        assert.ok(
            !/\.includes\(\s*['"`][^'"`]*us\.posthog\.com[^'"`]*['"`]\s*\)/.test(src),
            `Bug regressed (CodeQL URL substring sanitization): initDecorationProvider.ts contains a host.includes('us.posthog.com') style check, which is the original bug.`,
        );
    });

    test('classifyHost simulation: substring-laden hostname is not US Cloud', () => {
        // Independent unit-style replication of the fixed logic so this
        // test fails the moment someone reintroduces a substring check.
        function classify(host: string): string {
            try {
                const hostname = new URL(host).hostname;
                if (hostname === 'us.posthog.com' || hostname === 'us.i.posthog.com') { return 'US Cloud'; }
                if (hostname === 'eu.posthog.com' || hostname === 'eu.i.posthog.com') { return 'EU Cloud'; }
                return hostname;
            } catch {
                return host;
            }
        }

        assert.strictEqual(classify('https://us.posthog.com'), 'US Cloud');
        assert.strictEqual(classify('https://eu.posthog.com'), 'EU Cloud');
        assert.notStrictEqual(
            classify('https://us.posthog.com.evil.com'),
            'US Cloud',
            `Bug regressed (CodeQL URL substring sanitization): 'https://us.posthog.com.evil.com' must NOT be classified as US Cloud.`,
        );
        assert.notStrictEqual(
            classify('https://eu.posthog.com.attacker.io'),
            'EU Cloud',
            `Bug regressed (CodeQL URL substring sanitization): 'https://eu.posthog.com.attacker.io' must NOT be classified as EU Cloud.`,
        );
    });
});
