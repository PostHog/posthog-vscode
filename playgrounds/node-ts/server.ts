// Node.js (TypeScript) — PostHog Extension Playground
// Tests: typed posthog-node SDK, constructor alias, feature flags, capture

import { PostHog } from 'posthog-node';

// ── SDK initialization ──
// Init decoration should show project/host info
const client = new PostHog('phc_test_token', {
    host: 'https://eu.i.posthog.com',
    flushAt: 10,
    flushInterval: 30000,
});

// TODO: Verify these work:
//   - `client` detected as PostHog client (constructor alias: `new PostHog(...)`)
//   - Right-click "PostHog: Generate Type" on flag assignments
//   - Flag key autocomplete
//   - Inline decorations for flag status
//   - Node SDK object-arg capture detected

interface User {
    id: string;
    email: string;
    plan: 'free' | 'pro' | 'enterprise';
}

// ── Feature flags with types ──
// Try right-click → "PostHog: Generate Type" on these assignments
async function getFeatures(user: User) {
    const showDashboard = await client.isFeatureEnabled('new-dashboard', user.id);
    const experiment = await client.getFeatureFlag('onboarding-flow', user.id);
    const config = await client.getFeatureFlagPayload('feature-limits', user.id);

    return { showDashboard, experiment, config };
}

// ── Multivariate flag handling ──
async function getPrice(userId: string): Promise<number> {
    const variant = await client.getFeatureFlag('pricing-test', userId);

    // Variant highlighting should color these branches
    if (variant === 'control') {
        return 29;
    } else if (variant === 'discount') {
        return 19;
    } else if (variant === 'premium') {
        return 49;
    }

    return 29;
}

// ── Event capture (Node SDK object pattern) ──
async function trackEvents(user: User) {
    // Each of these should show inline event volume decoration
    client.capture({
        distinctId: user.id,
        event: 'dashboard_viewed',
        properties: {
            plan: user.plan,
            timestamp: new Date().toISOString(),
        },
    });

    client.capture({
        distinctId: user.id,
        event: 'feature_used',
        properties: {
            feature: 'export',
            format: 'csv',
        },
    });

    client.capture({
        distinctId: user.id,
        event: 'api_request',
        properties: {
            endpoint: '/v1/query',
            status: 200,
            duration_ms: 142,
        },
    });
}

// ── Identify ──
async function identifyUser(user: User) {
    client.identify({
        distinctId: user.id,
        properties: {
            email: user.email,
            plan: user.plan,
        },
    });
}

// ── Group analytics ──
async function setGroup(user: User, companyId: string) {
    client.groupIdentify({
        groupType: 'company',
        groupKey: companyId,
        properties: {
            name: 'Acme Corp',
            plan: 'enterprise',
        },
    });
}

// ── Shutdown ──
async function shutdown() {
    await client.shutdown();
}

export { getFeatures, getPrice, trackEvents, identifyUser, setGroup, shutdown };
