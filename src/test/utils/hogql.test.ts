import * as assert from 'assert';
import { escapeHogQLString } from '../../utils/hogql';

suite('escapeHogQLString', () => {

    test('plain string passes through unchanged', () => {
        assert.strictEqual(escapeHogQLString('hello world'), 'hello world');
    });

    test('single quote is doubled', () => {
        assert.strictEqual(escapeHogQLString("O'Brien"), "O''Brien");
    });

    test('backslash is escaped', () => {
        assert.strictEqual(escapeHogQLString('C:\\path'), 'C:\\\\path');
    });

    test('both backslash and single quote are escaped', () => {
        // backslash escaped first, then quote doubled
        assert.strictEqual(escapeHogQLString("it's a \\ test"), "it''s a \\\\ test");
    });

    test('empty string returns empty string', () => {
        assert.strictEqual(escapeHogQLString(''), '');
    });

    test('double quotes pass through unchanged', () => {
        assert.strictEqual(escapeHogQLString('say "hello"'), 'say "hello"');
    });

    test('backslash-then-quote sequence escapes backslash first then doubles quote', () => {
        // Input: \' (one backslash, one quote)
        // Step 1: backslash -> \\ => \\'
        // Step 2: quote -> '' => \\''
        assert.strictEqual(escapeHogQLString("\\'"), "\\\\''");
    });

    test('unicode characters pass through unchanged', () => {
        assert.strictEqual(escapeHogQLString('cafe\u0301 \u2603 \uD83D\uDE00'), 'cafe\u0301 \u2603 \uD83D\uDE00');
    });

    test('newlines pass through unchanged', () => {
        assert.strictEqual(escapeHogQLString('line1\nline2\r\n'), 'line1\nline2\r\n');
    });

    test('multiple single quotes are all doubled', () => {
        assert.strictEqual(escapeHogQLString("a''b'c"), "a''''b''c");
    });

    test('multiple backslashes are all escaped', () => {
        assert.strictEqual(escapeHogQLString('a\\\\b'), 'a\\\\\\\\b');
    });
});
