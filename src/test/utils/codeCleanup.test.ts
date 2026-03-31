import * as assert from 'assert';
import { findMatchingBrace, dedentBlock } from '../../utils/codeCleanup';

// ---------------------------------------------------------------------------
// findMatchingBrace
// ---------------------------------------------------------------------------
suite('findMatchingBrace', () => {

    test('simple pair returns correct index', () => {
        assert.strictEqual(findMatchingBrace('{ }', 0), 2);
    });

    test('nested braces returns outer closing brace', () => {
        assert.strictEqual(findMatchingBrace('{ { } }', 0), 6);
    });

    test('unmatched open brace returns -1', () => {
        assert.strictEqual(findMatchingBrace('{ hello', 0), -1);
    });

    test('multiple nesting levels', () => {
        const text = '{ { { } } }';
        assert.strictEqual(findMatchingBrace(text, 0), 10);
        // Inner brace at index 2
        assert.strictEqual(findMatchingBrace(text, 2), 8);
        // Innermost brace at index 4
        assert.strictEqual(findMatchingBrace(text, 4), 6);
    });

    test('empty block returns index 1', () => {
        assert.strictEqual(findMatchingBrace('{}', 0), 1);
    });

    test('brace at very end of string', () => {
        assert.strictEqual(findMatchingBrace('abc{def}', 3), 7);
    });

    test('open index not pointing at brace returns -1 (no matching brace found)', () => {
        // Starting at index 1 which is a space, depth never reaches 0
        assert.strictEqual(findMatchingBrace('{ }', 1), -1);
    });

    test('handles braces inside text content', () => {
        const text = '{ a: "hello", b: { c: 1 } }';
        assert.strictEqual(findMatchingBrace(text, 0), 26);
    });

    test('starting from a mid-level nested brace', () => {
        const text = 'if (x) { for (y) { z(); } }';
        // Open brace at index 7
        assert.strictEqual(findMatchingBrace(text, 7), 26);
        // Inner brace at index 17
        assert.strictEqual(findMatchingBrace(text, 17), 24);
    });
});

// ---------------------------------------------------------------------------
// dedentBlock
// ---------------------------------------------------------------------------
suite('dedentBlock', () => {

    test('uniformly indented 4-space block with base empty removes 4 spaces', () => {
        const input = '    line1\n    line2\n    line3';
        const result = dedentBlock(input, '');
        assert.strictEqual(result, 'line1\nline2\nline3');
    });

    test('mixed indentation uses minimum non-blank indent', () => {
        const input = '    line1\n        line2\n    line3';
        const result = dedentBlock(input, '');
        assert.strictEqual(result, 'line1\n    line2\nline3');
    });

    test('blank lines are preserved as empty strings', () => {
        const input = '    line1\n\n    line3';
        const result = dedentBlock(input, '');
        assert.strictEqual(result, 'line1\n\nline3');
    });

    test('single line block', () => {
        const input = '        only_line';
        const result = dedentBlock(input, '');
        assert.strictEqual(result, 'only_line');
    });

    test('base indent of 4 spaces is applied after stripping', () => {
        const input = '        line1\n        line2';
        const result = dedentBlock(input, '    ');
        assert.strictEqual(result, '    line1\n    line2');
    });

    test('no indentation with empty base returns unchanged', () => {
        const input = 'line1\nline2';
        const result = dedentBlock(input, '');
        assert.strictEqual(result, 'line1\nline2');
    });

    test('all blank lines returns all empty', () => {
        const input = '   \n   \n';
        const result = dedentBlock(input, '');
        assert.strictEqual(result, '\n\n');
    });

    test('whitespace-only lines do not affect minimum indent', () => {
        const input = '        code\n    \n        more_code';
        const result = dedentBlock(input, '');
        assert.strictEqual(result, 'code\n\nmore_code');
    });

    test('base indent is prepended to non-blank lines', () => {
        const input = '    a\n    b';
        const result = dedentBlock(input, '  ');
        assert.strictEqual(result, '  a\n  b');
    });

    test('tab indentation works the same as spaces', () => {
        const input = '\t\tline1\n\t\tline2';
        const result = dedentBlock(input, '');
        assert.strictEqual(result, 'line1\nline2');
    });
});
