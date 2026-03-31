import * as assert from 'assert';
import { FlagCacheService } from '../services/flagCacheService';
import { EventCacheService } from '../services/eventCacheService';
import { ExperimentCacheService } from '../services/experimentCacheService';
import { FeatureFlag, EventDefinition, Experiment, ExperimentResults } from '../models/types';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeFlag(overrides: Partial<FeatureFlag> = {}): FeatureFlag {
    return {
        id: 1,
        key: 'test-flag',
        name: 'Test',
        active: true,
        filters: {},
        rollout_percentage: null,
        created_at: '2024-01-01',
        created_by: null,
        deleted: false,
        ...overrides,
    };
}

function makeEvent(overrides: Partial<EventDefinition> = {}): EventDefinition {
    return {
        id: '1',
        name: 'test_event',
        description: null,
        tags: [],
        last_seen_at: null,
        verified: false,
        hidden: false,
        ...overrides,
    };
}

function makeExperiment(overrides: Partial<Experiment> = {}): Experiment {
    return {
        id: 1,
        name: 'Test Experiment',
        description: null,
        start_date: null,
        end_date: null,
        feature_flag_key: 'test-flag',
        created_at: '2024-01-01',
        created_by: null,
        ...overrides,
    };
}

function makeExperimentResults(overrides: Partial<ExperimentResults> = {}): ExperimentResults {
    return {
        primary: { count: 1, results: [] },
        secondary: { count: 0, results: [] },
        ...overrides,
    };
}

// ===========================================================================
// FlagCacheService
// ===========================================================================

suite('FlagCacheService', () => {

    test('update() stores flags and getFlags() returns them', () => {
        const cache = new FlagCacheService();
        const flags = [makeFlag({ key: 'a' }), makeFlag({ key: 'b', id: 2 })];
        cache.update(flags);
        assert.deepStrictEqual(cache.getFlags(), flags);
    });

    test('getFlag(key) returns the correct flag by key', () => {
        const cache = new FlagCacheService();
        const flagA = makeFlag({ key: 'alpha', id: 1 });
        const flagB = makeFlag({ key: 'beta', id: 2 });
        cache.update([flagA, flagB]);
        assert.deepStrictEqual(cache.getFlag('beta'), flagB);
    });

    test('getFlag(key) returns undefined for nonexistent key', () => {
        const cache = new FlagCacheService();
        cache.update([makeFlag({ key: 'exists' })]);
        assert.strictEqual(cache.getFlag('nope'), undefined);
    });

    test('getFlag(key) skips deleted flags', () => {
        const cache = new FlagCacheService();
        cache.update([makeFlag({ key: 'gone', deleted: true })]);
        assert.strictEqual(cache.getFlag('gone'), undefined);
    });

    test('hasFlag(key) returns true for existing flag', () => {
        const cache = new FlagCacheService();
        cache.update([makeFlag({ key: 'present' })]);
        assert.strictEqual(cache.hasFlag('present'), true);
    });

    test('hasFlag(key) returns false for missing flag', () => {
        const cache = new FlagCacheService();
        cache.update([makeFlag({ key: 'other' })]);
        assert.strictEqual(cache.hasFlag('missing'), false);
    });

    test('hasFlag(key) returns false for deleted flag', () => {
        const cache = new FlagCacheService();
        cache.update([makeFlag({ key: 'removed', deleted: true })]);
        assert.strictEqual(cache.hasFlag('removed'), false);
    });

    test('getFlagKeys() returns only non-deleted flag keys', () => {
        const cache = new FlagCacheService();
        cache.update([
            makeFlag({ key: 'alive', id: 1 }),
            makeFlag({ key: 'dead', id: 2, deleted: true }),
            makeFlag({ key: 'also-alive', id: 3 }),
        ]);
        const keys = cache.getFlagKeys();
        assert.deepStrictEqual(keys, ['alive', 'also-alive']);
    });

    test('update() fires onChange listeners', () => {
        const cache = new FlagCacheService();
        let called = false;
        cache.onChange(() => { called = true; });
        cache.update([makeFlag()]);
        assert.strictEqual(called, true);
    });

    test('multiple onChange listeners all fire', () => {
        const cache = new FlagCacheService();
        let count = 0;
        cache.onChange(() => { count++; });
        cache.onChange(() => { count++; });
        cache.onChange(() => { count++; });
        cache.update([makeFlag()]);
        assert.strictEqual(count, 3);
    });

    test('lastRefreshed is null initially and set after update()', () => {
        const cache = new FlagCacheService();
        assert.strictEqual(cache.lastRefreshed, null);
        const before = new Date();
        cache.update([]);
        const after = new Date();
        assert.ok(cache.lastRefreshed !== null, 'lastRefreshed should be set');
        const refreshed = cache.lastRefreshed as Date;
        assert.ok(refreshed >= before, 'lastRefreshed should be >= time before update');
        assert.ok(refreshed <= after, 'lastRefreshed should be <= time after update');
    });
});

// ===========================================================================
// EventCacheService
// ===========================================================================

suite('EventCacheService', () => {

    test('update() stores events and getEvents() returns them', () => {
        const cache = new EventCacheService();
        const events = [makeEvent({ name: 'click' }), makeEvent({ name: 'pageview', id: '2' })];
        cache.update(events);
        assert.deepStrictEqual(cache.getEvents(), events);
    });

    test('getEvent(name) finds event by name', () => {
        const cache = new EventCacheService();
        const ev = makeEvent({ name: 'signup' });
        cache.update([makeEvent({ name: 'click' }), ev]);
        assert.deepStrictEqual(cache.getEvent('signup'), ev);
    });

    test('getEventNames() filters hidden events', () => {
        const cache = new EventCacheService();
        cache.update([
            makeEvent({ name: 'visible_one', id: '1' }),
            makeEvent({ name: '$hidden_event', id: '2', hidden: true }),
            makeEvent({ name: 'visible_two', id: '3' }),
        ]);
        assert.deepStrictEqual(cache.getEventNames(), ['visible_one', 'visible_two']);
    });

    test('updateVolumes() + getVolume() stores and retrieves', () => {
        const cache = new EventCacheService();
        const volumes = new Map<string, { count: number; days: number }>();
        volumes.set('click', { count: 500, days: 7 });
        volumes.set('pageview', { count: 1200, days: 7 });
        cache.updateVolumes(volumes);
        assert.deepStrictEqual(cache.getVolume('click'), { count: 500, days: 7 });
        assert.deepStrictEqual(cache.getVolume('pageview'), { count: 1200, days: 7 });
        assert.strictEqual(cache.getVolume('nope'), undefined);
    });

    test('updateSparklines() + getSparkline() stores and retrieves', () => {
        const cache = new EventCacheService();
        const sparklines = new Map<string, number[]>();
        sparklines.set('click', [1, 2, 3, 4, 5]);
        cache.updateSparklines(sparklines);
        assert.deepStrictEqual(cache.getSparkline('click'), [1, 2, 3, 4, 5]);
        assert.strictEqual(cache.getSparkline('missing'), undefined);
    });

    test('setProperties() + getProperties() per event', () => {
        const cache = new EventCacheService();
        const props = [
            { name: 'browser', property_type: 'String', is_numerical: false },
            { name: 'price', property_type: 'Numeric', is_numerical: true },
        ];
        cache.setProperties('purchase', props);
        assert.deepStrictEqual(cache.getProperties('purchase'), props);
        assert.strictEqual(cache.getProperties('other'), undefined);
    });

    test('setPropertyValues() + getPropertyValues() uses composite key', () => {
        const cache = new EventCacheService();
        const values = [
            { value: 'Chrome', count: 400 },
            { value: 'Firefox', count: 200 },
        ];
        cache.setPropertyValues('pageview', 'browser', values);
        assert.deepStrictEqual(cache.getPropertyValues('pageview', 'browser'), values);
        // Different event or property returns undefined
        assert.strictEqual(cache.getPropertyValues('pageview', 'os'), undefined);
        assert.strictEqual(cache.getPropertyValues('click', 'browser'), undefined);
    });

    test('update() fires onChange listeners', () => {
        const cache = new EventCacheService();
        let called = false;
        cache.onChange(() => { called = true; });
        cache.update([makeEvent()]);
        assert.strictEqual(called, true);
    });

    test('updateVolumes() fires onChange listeners', () => {
        const cache = new EventCacheService();
        let called = false;
        cache.onChange(() => { called = true; });
        cache.updateVolumes(new Map());
        assert.strictEqual(called, true);
    });

    test('updateSparklines() fires onChange listeners', () => {
        const cache = new EventCacheService();
        let called = false;
        cache.onChange(() => { called = true; });
        cache.updateSparklines(new Map());
        assert.strictEqual(called, true);
    });

    test('lastRefreshed is null initially and set after update()', () => {
        const cache = new EventCacheService();
        assert.strictEqual(cache.lastRefreshed, null);
        cache.update([]);
        assert.ok(cache.lastRefreshed !== null, 'lastRefreshed should be set after update');
    });
});

// ===========================================================================
// ExperimentCacheService
// ===========================================================================

suite('ExperimentCacheService', () => {

    test('update() stores experiments and getExperiments() returns them', () => {
        const cache = new ExperimentCacheService();
        const experiments = [
            makeExperiment({ id: 1, name: 'Exp A' }),
            makeExperiment({ id: 2, name: 'Exp B', feature_flag_key: 'flag-b' }),
        ];
        cache.update(experiments);
        assert.deepStrictEqual(cache.getExperiments(), experiments);
    });

    test('getByFlagKey() finds experiment by feature_flag_key', () => {
        const cache = new ExperimentCacheService();
        const expA = makeExperiment({ id: 1, feature_flag_key: 'flag-a' });
        const expB = makeExperiment({ id: 2, feature_flag_key: 'flag-b' });
        cache.update([expA, expB]);
        assert.deepStrictEqual(cache.getByFlagKey('flag-b'), expB);
    });

    test('getByFlagKey() returns undefined for missing key', () => {
        const cache = new ExperimentCacheService();
        cache.update([makeExperiment({ feature_flag_key: 'only-this' })]);
        assert.strictEqual(cache.getByFlagKey('not-here'), undefined);
    });

    test('updateResults() + getResults() stores by experiment ID', () => {
        const cache = new ExperimentCacheService();
        const results = makeExperimentResults({
            primary: { count: 2, results: [] },
            variants: [{ key: 'control', absolute_exposure: 1000 }],
        });
        cache.updateResults(42, results);
        assert.deepStrictEqual(cache.getResults(42), results);
        assert.strictEqual(cache.getResults(99), undefined);
    });

    test('update() fires onChange listeners', () => {
        const cache = new ExperimentCacheService();
        let count = 0;
        cache.onChange(() => { count++; });
        cache.update([makeExperiment()]);
        assert.strictEqual(count, 1);
    });

    test('updateResults() fires onChange listeners', () => {
        const cache = new ExperimentCacheService();
        let called = false;
        cache.onChange(() => { called = true; });
        cache.updateResults(1, makeExperimentResults());
        assert.strictEqual(called, true);
    });

    test('lastRefreshed is null initially and set after update()', () => {
        const cache = new ExperimentCacheService();
        assert.strictEqual(cache.lastRefreshed, null);
        cache.update([]);
        assert.ok(cache.lastRefreshed !== null, 'lastRefreshed should be set after update');
    });
});
