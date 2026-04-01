// React Native (JavaScript) — PostHog Extension Playground
// Tests: useFeatureFlag hook, posthog.capture, getFeatureFlag, inline decorations

import React, { useEffect } from 'react';
import { View, Text, Button } from 'react-native';
import { useFeatureFlag, useFeatureFlagPayload, usePostHog } from 'posthog-react-native';

// TODO: Verify these inline decorations appear:
//   - Flag status (● enabled / ○ inactive / ⚠ not in PostHog)
//   - Event volume sparklines
//   - Autocomplete inside string arguments

export default function App() {
    const posthog = usePostHog();

    // ── Feature flags via hooks ──
    // Each of these should show inline flag status decoration
    const showNewOnboarding = useFeatureFlag('new-onboarding-flow');
    const experimentVariant = useFeatureFlag('checkout-experiment');
    const remoteConfig = useFeatureFlagPayload('dashboard-config');

    // ── Feature flags via client ──
    const betaEnabled = posthog.isFeatureEnabled('beta-features');
    const variant = posthog.getFeatureFlag('pricing-page-test');
    const payload = posthog.getFeatureFlagPayload('remote-settings');

    // ── Event capture ──
    useEffect(() => {
        posthog.capture('app_opened', { source: 'react-native' });
    }, []);

    // ── Conditional rendering based on flags ──
    // Variant highlighting should color-code these branches
    if (showNewOnboarding) {
        return (
            <View>
                <Text>New Onboarding Flow</Text>
                <Button
                    title="Complete Onboarding"
                    onPress={() => posthog.capture('onboarding_completed', { variant: 'new' })}
                />
            </View>
        );
    } else {
        return (
            <View>
                <Text>Classic Onboarding</Text>
                <Button
                    title="Skip"
                    onPress={() => posthog.capture('onboarding_skipped')}
                />
            </View>
        );
    }
}
