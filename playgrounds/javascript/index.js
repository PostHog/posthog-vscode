import posthog from 'posthog-js';

posthog.init('phc_test', {
    api_host: 'https://proxy.posthog.com',
    ui_host: 'https://us.posthog.com'
});

const flag = posthog.getFeatureFlag('flag-that-doesnt-exist');
const aStaleFlag = posthog.getFeatureFlag('aa-test-bayesian-new');

if (flag === 'control') {
    console.log('Feature is enabled');
} else if (flag === 'wizard-only') {
    console.log('Feature is disabled');
} else if (flag === 'wizard-hero') {
    console.log('Feature is enabled with the wizard-hero variant');
} else if (flag === 'wizard-tab') {
    console.log('Feature is enabled with the wizard-hero-2 variant');
}

const payload = posthog.getFeatureFlagPayload('active-hours-heatmap');

posthog.capture('insight analyzed');

console.log(aStaleFlag, payload);

