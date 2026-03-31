/** Find the index of the matching closing brace for an open brace */
export function findMatchingBrace(text: string, openIndex: number): number {
    let depth = 0;
    for (let i = openIndex; i < text.length; i++) {
        if (text[i] === '{') { depth++; }
        else if (text[i] === '}') {
            depth--;
            if (depth === 0) { return i; }
        }
    }
    return -1;
}

/** Dedent a code block to a given base indentation level */
export function dedentBlock(block: string, baseIndent: string): string {
    const lines = block.split('\n');
    let minIndent = Infinity;
    for (const line of lines) {
        if (line.trim().length === 0) { continue; }
        const leadingSpaces = line.match(/^(\s*)/)?.[1].length || 0;
        minIndent = Math.min(minIndent, leadingSpaces);
    }
    if (minIndent === Infinity) { minIndent = 0; }

    return lines
        .map(line => {
            if (line.trim().length === 0) { return ''; }
            return baseIndent + line.substring(minIndent);
        })
        .join('\n');
}
