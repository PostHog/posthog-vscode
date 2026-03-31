import * as assert from 'assert';
import {
    classifyFlagType,
    isFullyRolledOut,
    extractRollout,
    extractVariants,
    extractConditionCount,
} from '../../utils/flagClassification';
import { FeatureFlag } from '../../models/types';

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

// ---------------------------------------------------------------------------
// classifyFlagType
// ---------------------------------------------------------------------------
suite('classifyFlagType', () => {

    test('undefined flag returns boolean', () => {
        assert.strictEqual(classifyFlagType(undefined), 'boolean');
    });

    test('flag with multivariate variants returns multivariate', () => {
        const flag = makeFlag({
            filters: {
                multivariate: {
                    variants: [
                        { key: 'control', rollout_percentage: 50 },
                        { key: 'test', rollout_percentage: 50 },
                    ],
                },
            },
        });
        assert.strictEqual(classifyFlagType(flag), 'multivariate');
    });

    test('flag with payloads (no multivariate) returns remote_config', () => {
        const flag = makeFlag({
            filters: {
                payloads: { true: '{"theme":"dark"}' },
            },
        });
        assert.strictEqual(classifyFlagType(flag), 'remote_config');
    });

    test('flag with neither multivariate nor payloads returns boolean', () => {
        const flag = makeFlag({ filters: {} });
        assert.strictEqual(classifyFlagType(flag), 'boolean');
    });

    test('flag with empty variants array returns boolean', () => {
        const flag = makeFlag({
            filters: {
                multivariate: { variants: [] },
            },
        });
        assert.strictEqual(classifyFlagType(flag), 'boolean');
    });

    test('flag with payloads where all values are null returns boolean', () => {
        const flag = makeFlag({
            filters: {
                payloads: { true: null, false: null },
            },
        });
        assert.strictEqual(classifyFlagType(flag), 'boolean');
    });

    test('flag with multivariate takes priority over payloads', () => {
        const flag = makeFlag({
            filters: {
                multivariate: {
                    variants: [{ key: 'control', rollout_percentage: 100 }],
                },
                payloads: { control: '"value"' },
            },
        });
        assert.strictEqual(classifyFlagType(flag), 'multivariate');
    });
});

// ---------------------------------------------------------------------------
// isFullyRolledOut
// ---------------------------------------------------------------------------
suite('isFullyRolledOut', () => {

    test('no filters returns false', () => {
        const flag = makeFlag({ filters: undefined as unknown as Record<string, unknown> });
        assert.strictEqual(isFullyRolledOut(flag), false);
    });

    test('empty groups array returns false', () => {
        const flag = makeFlag({ filters: { groups: [] } });
        assert.strictEqual(isFullyRolledOut(flag), false);
    });

    test('single group 100% no conditions returns true', () => {
        const flag = makeFlag({
            filters: {
                groups: [{ rollout_percentage: 100, properties: [] }],
            },
        });
        assert.strictEqual(isFullyRolledOut(flag), true);
    });

    test('single group 100% with conditions returns false', () => {
        const flag = makeFlag({
            filters: {
                groups: [{
                    rollout_percentage: 100,
                    properties: [{ key: 'email', value: 'test@example.com', type: 'person' }],
                }],
            },
        });
        assert.strictEqual(isFullyRolledOut(flag), false);
    });

    test('single group less than 100% returns false', () => {
        const flag = makeFlag({
            filters: {
                groups: [{ rollout_percentage: 50, properties: [] }],
            },
        });
        assert.strictEqual(isFullyRolledOut(flag), false);
    });

    test('multiple groups all 100% no conditions returns true', () => {
        const flag = makeFlag({
            filters: {
                groups: [
                    { rollout_percentage: 100, properties: [] },
                    { rollout_percentage: 100, properties: [] },
                ],
            },
        });
        assert.strictEqual(isFullyRolledOut(flag), true);
    });

    test('one group less than 100% among many returns false', () => {
        const flag = makeFlag({
            filters: {
                groups: [
                    { rollout_percentage: 100, properties: [] },
                    { rollout_percentage: 75, properties: [] },
                ],
            },
        });
        assert.strictEqual(isFullyRolledOut(flag), false);
    });

    test('multivariate flag returns false even if 100% rollout', () => {
        const flag = makeFlag({
            filters: {
                multivariate: {
                    variants: [
                        { key: 'control', rollout_percentage: 50 },
                        { key: 'test', rollout_percentage: 50 },
                    ],
                },
                groups: [{ rollout_percentage: 100, properties: [] }],
            },
        });
        assert.strictEqual(isFullyRolledOut(flag), false);
    });

    test('top-level rollout_percentage 100 with no groups returns true', () => {
        const flag = makeFlag({
            rollout_percentage: 100,
            filters: {},
        });
        assert.strictEqual(isFullyRolledOut(flag), true);
    });

    test('group with no properties key and rollout 100 returns true', () => {
        const flag = makeFlag({
            filters: {
                groups: [{ rollout_percentage: 100 }],
            },
        });
        assert.strictEqual(isFullyRolledOut(flag), true);
    });

    test('filters present but no groups and no top-level rollout returns false', () => {
        const flag = makeFlag({ filters: { someOtherKey: true } });
        assert.strictEqual(isFullyRolledOut(flag), false);
    });
});

// ---------------------------------------------------------------------------
// extractRollout
// ---------------------------------------------------------------------------
suite('extractRollout', () => {

    test('top-level rollout_percentage set returns it', () => {
        const flag = makeFlag({ rollout_percentage: 75 });
        assert.strictEqual(extractRollout(flag), 75);
    });

    test('rollout in filters.groups[0] returns it', () => {
        const flag = makeFlag({
            filters: {
                groups: [{ rollout_percentage: 42 }],
            },
        });
        assert.strictEqual(extractRollout(flag), 42);
    });

    test('no rollout anywhere returns null', () => {
        const flag = makeFlag({ filters: {} });
        assert.strictEqual(extractRollout(flag), null);
    });

    test('null rollout_percentage at top level looks in groups', () => {
        const flag = makeFlag({
            rollout_percentage: null,
            filters: {
                groups: [{ rollout_percentage: 60 }],
            },
        });
        assert.strictEqual(extractRollout(flag), 60);
    });

    test('top-level rollout_percentage 0 returns 0 (not null)', () => {
        const flag = makeFlag({ rollout_percentage: 0 });
        assert.strictEqual(extractRollout(flag), 0);
    });

    test('returns first group rollout when multiple groups exist', () => {
        const flag = makeFlag({
            filters: {
                groups: [
                    { rollout_percentage: 30 },
                    { rollout_percentage: 80 },
                ],
            },
        });
        assert.strictEqual(extractRollout(flag), 30);
    });

    test('skips groups without rollout_percentage and returns first numeric', () => {
        const flag = makeFlag({
            filters: {
                groups: [
                    { properties: [] },
                    { rollout_percentage: 55 },
                ],
            },
        });
        assert.strictEqual(extractRollout(flag), 55);
    });
});

// ---------------------------------------------------------------------------
// extractVariants
// ---------------------------------------------------------------------------
suite('extractVariants', () => {

    test('no multivariate returns empty array', () => {
        const flag = makeFlag({ filters: {} });
        assert.deepStrictEqual(extractVariants(flag), []);
    });

    test('multivariate with variants returns them', () => {
        const variants = [
            { key: 'control', rollout_percentage: 50 },
            { key: 'test', rollout_percentage: 50 },
        ];
        const flag = makeFlag({
            filters: { multivariate: { variants } },
        });
        assert.deepStrictEqual(extractVariants(flag), variants);
    });

    test('multivariate with empty variants array returns empty', () => {
        const flag = makeFlag({
            filters: { multivariate: { variants: [] } },
        });
        assert.deepStrictEqual(extractVariants(flag), []);
    });

    test('multivariate object without variants key returns empty', () => {
        const flag = makeFlag({
            filters: { multivariate: {} },
        });
        assert.deepStrictEqual(extractVariants(flag), []);
    });
});

// ---------------------------------------------------------------------------
// extractConditionCount
// ---------------------------------------------------------------------------
suite('extractConditionCount', () => {

    test('no groups returns 0', () => {
        const flag = makeFlag({ filters: {} });
        assert.strictEqual(extractConditionCount(flag), 0);
    });

    test('groups with empty properties returns 0', () => {
        const flag = makeFlag({
            filters: {
                groups: [
                    { properties: [], rollout_percentage: 100 },
                    { properties: [], rollout_percentage: 50 },
                ],
            },
        });
        assert.strictEqual(extractConditionCount(flag), 0);
    });

    test('groups with properties counts correctly', () => {
        const flag = makeFlag({
            filters: {
                groups: [
                    { properties: [{ key: 'email', value: '@posthog.com', type: 'person' }], rollout_percentage: 100 },
                    { properties: [], rollout_percentage: 50 },
                    { properties: [{ key: 'country', value: 'US', type: 'person' }], rollout_percentage: 80 },
                ],
            },
        });
        assert.strictEqual(extractConditionCount(flag), 2);
    });

    test('group without properties key is not counted', () => {
        const flag = makeFlag({
            filters: {
                groups: [
                    { rollout_percentage: 100 },
                ],
            },
        });
        assert.strictEqual(extractConditionCount(flag), 0);
    });

    test('all groups with conditions returns total count', () => {
        const flag = makeFlag({
            filters: {
                groups: [
                    { properties: [{ key: 'a', value: '1', type: 'person' }] },
                    { properties: [{ key: 'b', value: '2', type: 'person' }] },
                    { properties: [{ key: 'c', value: '3', type: 'person' }] },
                ],
            },
        });
        assert.strictEqual(extractConditionCount(flag), 3);
    });
});
