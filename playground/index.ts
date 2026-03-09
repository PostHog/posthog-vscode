import posthog from 'posthog-js';

posthog.init('phc_test', { api_host: 'https://us.posthog.com' });

// Try typing inside the quotes — PostHog should autocomplete flag keys
const flag = posthog.getFeatureFlag('');

if (posthog.isFeatureEnabled('')) {
    console.log('Feature is enabled');
}

const payload = posthog.getFeatureFlagPayload('');

// Try typing inside the quotes — PostHog should autocomplete event names
posthog.capture('');

console.log(flag, payload);
