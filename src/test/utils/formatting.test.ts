import * as assert from 'assert';
import { formatCount, formatPct, buildBar } from '../../utils/formatting';

suite('formatting — formatCount', () => {

    test('0 returns "0"', () => {
        assert.strictEqual(formatCount(0), '0');
    });

    test('999 returns "999"', () => {
        assert.strictEqual(formatCount(999), '999');
    });

    test('1000 returns "1.0K"', () => {
        assert.strictEqual(formatCount(1000), '1.0K');
    });

    test('1500 returns "1.5K"', () => {
        assert.strictEqual(formatCount(1500), '1.5K');
    });

    test('999999 returns "1000.0K"', () => {
        assert.strictEqual(formatCount(999999), '1000.0K');
    });

    test('1000000 returns "1.0M"', () => {
        assert.strictEqual(formatCount(1000000), '1.0M');
    });

    test('1500000 returns "1.5M"', () => {
        assert.strictEqual(formatCount(1500000), '1.5M');
    });
});

suite('formatting — formatPct', () => {

    test('0 returns "0.0%"', () => {
        assert.strictEqual(formatPct(0), '0.0%');
    });

    test('0.5 returns "50.0%"', () => {
        assert.strictEqual(formatPct(0.5), '50.0%');
    });

    test('1.0 returns "100.0%"', () => {
        assert.strictEqual(formatPct(1.0), '100.0%');
    });

    test('0.123 returns "12.3%"', () => {
        assert.strictEqual(formatPct(0.123), '12.3%');
    });
});

suite('formatting — buildBar', () => {

    test('0 pct, width 10 returns all empty', () => {
        assert.strictEqual(buildBar(0, 10), '░░░░░░░░░░');
    });

    test('100 pct, width 10 returns all filled', () => {
        assert.strictEqual(buildBar(100, 10), '██████████');
    });

    test('50 pct, width 10 returns half and half', () => {
        assert.strictEqual(buildBar(50, 10), '█████░░░░░');
    });

    test('25 pct, width 4 returns 1 filled 3 empty', () => {
        assert.strictEqual(buildBar(25, 4), '█░░░');
    });
});
