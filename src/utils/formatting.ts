/** Format a number with K/M suffixes */
export function formatCount(n: number): string {
    if (n >= 1_000_000) { return `${(n / 1_000_000).toFixed(1)}M`; }
    if (n >= 1_000) { return `${(n / 1_000).toFixed(1)}K`; }
    return String(n);
}

/** Format a decimal as percentage string */
export function formatPct(n: number): string {
    return `${(n * 100).toFixed(1)}%`;
}

/** Build a bar chart string of given width */
export function buildBar(pct: number, width: number): string {
    const filled = Math.round((pct / 100) * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
}
