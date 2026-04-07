/**
 * Regression test for: HogQL escaping bug in postHogService
 *
 * Bug:    `getEventVolumes` (and other HogQL builders) were using
 *         `\\'` style escaping for single quotes inside string literals.
 *         The correct HogQL escape for an embedded single quote is to
 *         double it (`''`). The wrong escape both produced invalid
 *         queries and could allow injection in event/property names.
 * Fix:    Centralize string escaping in `escapeHogQLString` from
 *         utils/hogql and call it everywhere user-supplied values are
 *         interpolated. This is a meta-test that scans
 *         postHogService.ts for the bug pattern so nobody can
 *         reintroduce backslash-quote escaping by hand.
 * Date:   2026-04-07
 *
 * This test should FAIL if the bug regresses.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Regression: HogQL escaping (meta-test)', function () {
    this.timeout(30000);

    const postHogServicePath = path.resolve(__dirname, '../../..', 'src', 'services', 'postHogService.ts');

    test('postHogService.ts does not use replace(/.../g, "\\\\\'")  pattern', () => {
        const src = fs.readFileSync(postHogServicePath, 'utf8');

        // The bug pattern: replacing a quote with a backslash-escaped
        // quote, e.g. .replace(/'/g, "\\'") or similar variants.
        // We allow the centralized escapeHogQLString helper itself
        // (it lives in utils/hogql.ts), so we only scan postHogService.ts.
        const offenders: { line: number; text: string }[] = [];
        const patterns: RegExp[] = [
            /\.replace\(\s*\/'\/g\s*,\s*['"`]\\\\'['"`]\s*\)/,        // .replace(/'/g, "\\'")
            /\.replace\(\s*\/'\/g\s*,\s*['"`]\\'['"`]\s*\)/,           // .replace(/'/g, '\'') odd
            /\.replace\(\s*'['"]\s*'\s*,\s*['"`]\\\\'['"`]\s*\)/,      // .replace("'", "\\'")
        ];
        const lines = src.split('\n');
        lines.forEach((line, idx) => {
            for (const re of patterns) {
                if (re.test(line)) {
                    offenders.push({ line: idx + 1, text: line.trim() });
                    break;
                }
            }
        });

        assert.strictEqual(
            offenders.length, 0,
            `Bug regressed (HogQL escaping): postHogService.ts contains backslash-style quote escaping. HogQL escapes single quotes by doubling them. Use escapeHogQLString().\nOffenders:\n${offenders.map(o => `  line ${o.line}: ${o.text}`).join('\n')}`,
        );
    });

    test('postHogService.ts uses escapeHogQLString helper', () => {
        const src = fs.readFileSync(postHogServicePath, 'utf8');
        assert.ok(
            /escapeHogQLString/.test(src),
            `Bug regressed (HogQL escaping): postHogService.ts no longer references escapeHogQLString. All user-supplied HogQL string values must be escaped via this helper.`,
        );
    });

    test('postHogService.ts does not contain raw single-quote interpolation of unescaped values in HogQL', () => {
        // Heuristic scan: any line that builds a HogQL string with a
        // template literal containing `'${expr}'` where `expr` is NOT
        // already an escape call AND not a `safe*`-prefixed local
        // (which by convention in this file is the result of
        // escapeHogQLString) is suspicious.
        const src = fs.readFileSync(postHogServicePath, 'utf8');
        const lines = src.split('\n');
        const offenders: { line: number; text: string }[] = [];

        const interpolation = /'\$\{([^}]+)\}'/g;
        lines.forEach((line, idx) => {
            let m: RegExpExecArray | null;
            interpolation.lastIndex = 0;
            while ((m = interpolation.exec(line)) !== null) {
                const inner = m[1].trim();
                // Allowed: explicit escape call inside the interpolation.
                if (/escapeHogQLString/.test(inner)) { continue; }
                // Allowed: a `safe*` local variable (project convention
                // for `const safeFoo = this.escapeHogQLString(foo)`).
                if (/^safe[A-Z]\w*$/.test(inner)) { continue; }
                offenders.push({ line: idx + 1, text: line.trim() });
                break;
            }
        });

        assert.strictEqual(
            offenders.length, 0,
            `Bug regressed (HogQL escaping): postHogService.ts interpolates raw values into HogQL string literals without escapeHogQLString.\nOffenders:\n${offenders.map(o => `  line ${o.line}: ${o.text}`).join('\n')}`,
        );
    });
});
