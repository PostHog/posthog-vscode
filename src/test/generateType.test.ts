import * as assert from 'assert';
import { inferFlagTypeForMethod, inferVariantReturnType, inferPayloadType } from '../commands/generateTypeCommand';
import { FeatureFlag } from '../models/types';

function makeFlag(overrides: Partial<FeatureFlag> & { key: string }): FeatureFlag {
    return {
        id: overrides.id ?? 1,
        key: overrides.key,
        name: overrides.name ?? overrides.key,
        active: overrides.active ?? true,
        filters: overrides.filters ?? {},
        rollout_percentage: overrides.rollout_percentage ?? null,
        created_at: overrides.created_at ?? '2024-01-01T00:00:00Z',
        created_by: overrides.created_by ?? null,
        deleted: overrides.deleted ?? false,
    };
}

suite('generateTypeCommand — inferFlagTypeForMethod', () => {

    test('isFeatureEnabled with any flag returns "boolean"', () => {
        const flag = makeFlag({ key: 'test-flag' });
        assert.strictEqual(inferFlagTypeForMethod('isFeatureEnabled', 'test-flag', flag), 'boolean');
    });

    test('isFeatureFlagEnabled with any flag returns "boolean"', () => {
        const flag = makeFlag({ key: 'test-flag' });
        assert.strictEqual(inferFlagTypeForMethod('isFeatureFlagEnabled', 'test-flag', flag), 'boolean');
    });

    test('getFeatureFlag with no flag returns "boolean | undefined"', () => {
        assert.strictEqual(inferFlagTypeForMethod('getFeatureFlag', 'unknown-flag', undefined), 'boolean | undefined');
    });

    test('getFeatureFlagPayload with no flag returns "unknown"', () => {
        assert.strictEqual(inferFlagTypeForMethod('getFeatureFlagPayload', 'unknown-flag', undefined), 'unknown');
    });

    test('getFeatureFlag with multivariate flag (control+test) returns variant union', () => {
        const flag = makeFlag({
            key: 'mv-flag',
            filters: {
                multivariate: {
                    variants: [
                        { key: 'control', rollout_percentage: 50 },
                        { key: 'test', rollout_percentage: 50 },
                    ],
                },
            },
        });
        assert.strictEqual(
            inferFlagTypeForMethod('getFeatureFlag', 'mv-flag', flag),
            "'control' | 'test' | undefined"
        );
    });

    test('getFeatureFlag with boolean flag (no variants) returns "boolean | undefined"', () => {
        const flag = makeFlag({ key: 'bool-flag', filters: {} });
        assert.strictEqual(inferFlagTypeForMethod('getFeatureFlag', 'bool-flag', flag), 'boolean | undefined');
    });

    test('getRemoteConfig with flag with JSON payload returns inferred type + " | null"', () => {
        const flag = makeFlag({
            key: 'rc-flag',
            filters: {
                payloads: { true: '{"name":"test"}' },
            },
        });
        const result = inferFlagTypeForMethod('getRemoteConfig', 'rc-flag', flag);
        assert.ok(result.includes('name'), 'should contain property name');
        assert.ok(result.includes('string'), 'should contain string type');
        assert.ok(result.includes('| null'), 'should end with | null');
    });

    test('getFeatureFlagPayload with flag with JSON payload returns inferred type + " | null"', () => {
        const flag = makeFlag({
            key: 'payload-flag',
            filters: {
                payloads: { true: '{"count":42}' },
            },
        });
        const result = inferFlagTypeForMethod('getFeatureFlagPayload', 'payload-flag', flag);
        assert.ok(result.includes('count'), 'should contain property count');
        assert.ok(result.includes('number'), 'should contain number type');
        assert.ok(result.includes('| null'), 'should end with | null');
    });
});

suite('generateTypeCommand — inferVariantReturnType', () => {

    test('flag with variants [control, test] returns variant union with undefined', () => {
        const flag = makeFlag({
            key: 'mv-flag',
            filters: {
                multivariate: {
                    variants: [
                        { key: 'control', rollout_percentage: 50 },
                        { key: 'test', rollout_percentage: 50 },
                    ],
                },
            },
        });
        assert.strictEqual(inferVariantReturnType(flag), "'control' | 'test' | undefined");
    });

    test('flag with 3 variants returns all three + undefined', () => {
        const flag = makeFlag({
            key: 'mv3-flag',
            filters: {
                multivariate: {
                    variants: [
                        { key: 'control', rollout_percentage: 34 },
                        { key: 'test-a', rollout_percentage: 33 },
                        { key: 'test-b', rollout_percentage: 33 },
                    ],
                },
            },
        });
        assert.strictEqual(inferVariantReturnType(flag), "'control' | 'test-a' | 'test-b' | undefined");
    });

    test('flag without variants returns "boolean | undefined"', () => {
        const flag = makeFlag({ key: 'bool-flag', filters: {} });
        assert.strictEqual(inferVariantReturnType(flag), 'boolean | undefined');
    });
});

suite('generateTypeCommand — inferPayloadType', () => {

    test('no payloads returns "unknown"', () => {
        const flag = makeFlag({ key: 'no-payload', filters: {} });
        assert.strictEqual(inferPayloadType(flag), 'unknown');
    });

    test('empty payloads returns "unknown"', () => {
        const flag = makeFlag({ key: 'empty-payload', filters: { payloads: {} } });
        assert.strictEqual(inferPayloadType(flag), 'unknown');
    });

    test('single payload with JSON string \'{"name":"test"}\' returns object type + " | null"', () => {
        const flag = makeFlag({
            key: 'json-payload',
            filters: { payloads: { true: '{"name":"test"}' } },
        });
        const result = inferPayloadType(flag);
        assert.ok(result.includes('name'), 'should contain property name');
        assert.ok(result.includes('string'), 'should contain string type');
        assert.ok(result.endsWith('| null'), 'should end with | null');
    });

    test('single payload with number 42 returns "number | null"', () => {
        const flag = makeFlag({
            key: 'num-payload',
            filters: { payloads: { true: '42' } },
        });
        assert.strictEqual(inferPayloadType(flag), 'number | null');
    });

    test('multiple payloads with same type are deduped + " | null"', () => {
        const flag = makeFlag({
            key: 'dedup-payload',
            filters: { payloads: { control: '"hello"', test: '"world"' } },
        });
        assert.strictEqual(inferPayloadType(flag), 'string | null');
    });

    test('multiple payloads with different types returns union + " | null"', () => {
        const flag = makeFlag({
            key: 'mixed-payload',
            filters: { payloads: { control: '"hello"', test: '42' } },
        });
        assert.strictEqual(inferPayloadType(flag), 'string | number | null');
    });
});
