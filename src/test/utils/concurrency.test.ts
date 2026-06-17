import * as assert from 'assert';
import { mapWithConcurrency } from '../../utils/concurrency';

suite('mapWithConcurrency', () => {
    test('returns results in input order', async () => {
        const items = [1, 2, 3, 4, 5];
        const out = await mapWithConcurrency(items, 2, async (n) => n * 10);
        assert.deepStrictEqual(out, [10, 20, 30, 40, 50]);
    });

    test('passes the index to the mapper', async () => {
        const out = await mapWithConcurrency(['a', 'b', 'c'], 3, async (item, i) => `${i}:${item}`);
        assert.deepStrictEqual(out, ['0:a', '1:b', '2:c']);
    });

    test('handles an empty input', async () => {
        const out = await mapWithConcurrency([], 4, async (n) => n);
        assert.deepStrictEqual(out, []);
    });

    test('never exceeds the concurrency limit in flight', async () => {
        const limit = 3;
        let inFlight = 0;
        let maxInFlight = 0;
        const items = Array.from({ length: 50 }, (_, i) => i);

        await mapWithConcurrency(items, limit, async (n) => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            // yield to the event loop so concurrent tasks overlap
            await new Promise((resolve) => setTimeout(resolve, 1));
            inFlight--;
            return n;
        });

        assert.ok(
            maxInFlight <= limit,
            `Expected at most ${limit} tasks in flight, observed ${maxInFlight}. ` +
            `The scan must stay bounded so a large workspace cannot freeze the extension host.`,
        );
        assert.ok(maxInFlight > 1, 'Expected some real concurrency (tasks should overlap).');
    });

    test('processes every item even when there are more items than the limit', async () => {
        const items = Array.from({ length: 1000 }, (_, i) => i);
        const out = await mapWithConcurrency(items, 8, async (n) => n + 1);
        assert.strictEqual(out.length, 1000);
        assert.strictEqual(out[0], 1);
        assert.strictEqual(out[999], 1000);
    });
});
