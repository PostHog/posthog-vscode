/**
 * Run an async mapper over `items` with at most `limit` tasks in flight at once.
 *
 * Unlike `Promise.all(items.map(fn))`, this never starts more than `limit` tasks
 * concurrently, so a large input (e.g. every source file in a monorepo) can't swamp
 * the extension host by opening/parsing thousands of files at the same time.
 *
 * Results are returned in input order. The mapper is called with the item and its index.
 */
export async function mapWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    if (items.length === 0) { return results; }

    const workers = Math.max(1, Math.min(limit, items.length));
    let cursor = 0;

    const worker = async (): Promise<void> => {
        while (cursor < items.length) {
            const index = cursor++;
            results[index] = await mapper(items[index], index);
        }
    };

    await Promise.all(Array.from({ length: workers }, () => worker()));
    return results;
}
