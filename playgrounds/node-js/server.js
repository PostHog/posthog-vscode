// Node.js (JavaScript) — PostHog Extension Playground
// Tests: posthog-node SDK patterns, constructor alias detection, object-arg capture

const { PostHog } = require('posthog-node');

// ── SDK initialization ──
// The init decoration should show project info + host
const client = new PostHog('phc_test_token', {
    host: 'https://us.i.posthog.com',
    flushAt: 1,
    flushInterval: 0,
});

// TODO: Verify these work:
//   - `client` is detected as a PostHog client (via constructor alias)
//   - Flag autocomplete inside string arguments
//   - Inline decorations for flag status
//   - Node SDK capture pattern (object argument) detected

// ── Feature flags ──
// Each should show inline flag status decoration
async function handleRequest(userId) {
    const isEnabled = await client.isFeatureEnabled('new-api-endpoint', userId);
    const variant = await client.getFeatureFlag('pricing-experiment', userId);
    const payload = await client.getFeatureFlagPayload('rate-limits', userId);

    // ── Boolean flag branching ──
    // Should show green "enabled" / gray "disabled" variant highlights
    if (isEnabled) {
        console.log('New API endpoint active');
    } else {
        console.log('Using legacy endpoint');
    }

    // ── Multivariate branching ──
    // Should show color-coded variant highlights
    if (variant === 'control') {
        return { price: 29 };
    } else if (variant === 'test') {
        return { price: 19 };
    }

    return { price: 29 };
}

// ── Event capture (Node SDK pattern) ──
// Node SDK uses object argument: client.capture({ distinctId, event, properties })
// The extension should detect the event name from the object's `event` property
function trackPurchase(userId, amount) {
    client.capture({
        distinctId: userId,
        event: 'purchase_completed',
        properties: { amount, currency: 'USD' },
    });
}

function trackSignup(userId, method) {
    client.capture({
        distinctId: userId,
        event: 'user_signed_up',
        properties: { method },
    });
}

// ── Alternative client names ──
// These should also be detected if configured in additionalClientNames
const posthog = new PostHog('phc_another_token');
posthog.capture({
    distinctId: 'user-1',
    event: 'server_started',
});

// ── Shutdown ──
async function shutdown() {
    await client.shutdown();
}

module.exports = { handleRequest, trackPurchase, trackSignup, shutdown };
