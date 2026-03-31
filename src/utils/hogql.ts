/**
 * Escape a value for safe embedding in HogQL string literals.
 * Escapes backslashes first, then single quotes (doubled).
 */
export function escapeHogQLString(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "''");
}
