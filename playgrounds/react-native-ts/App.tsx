// React Native (TypeScript) — PostHog Extension Playground
// Tests: typed hooks, posthog client methods, variant highlighting, type generation

import React, { useEffect } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import {
    useFeatureFlag,
    useFeatureFlagPayload,
    useFeatureFlagVariantKey,
    usePostHog,
} from 'posthog-react-native';

// TODO: Verify these work:
//   - useFeatureFlag autocomplete for flag keys
//   - Right-click "PostHog: Generate Type" on flag assignments
//   - Variant highlighting on if/switch branches
//   - Inline decorations for flag status + event volume

export default function App(): React.ReactElement {
    const posthog = usePostHog();

    // ── Typed flag hooks ──
    // Try right-click → "PostHog: Generate Type" on each of these
    const showBanner = useFeatureFlag('promo-banner');
    const variant = useFeatureFlagVariantKey('signup-experiment');
    const dashConfig = useFeatureFlagPayload('dashboard-layout');

    // ── Client methods ──
    const isEnabled = posthog.isFeatureEnabled('dark-mode');
    const abTest = posthog.getFeatureFlag('checkout-flow-v2');
    const remotePayload = posthog.getFeatureFlagPayload('feature-limits');

    // ── Event tracking ──
    useEffect(() => {
        posthog.capture('app_launched', {
            platform: 'react-native',
            version: '1.0.0',
        });
    }, []);

    const handlePurchase = (item: string) => {
        posthog.capture('purchase_completed', { item, amount: 9.99 });
    };

    // ── Multivariate branching ──
    // Variant highlighting should show different colors per branch
    if (abTest === 'control') {
        return (
            <View style={styles.container}>
                <Text>Original Checkout</Text>
                <Button title="Buy" onPress={() => handlePurchase('widget')} />
            </View>
        );
    } else if (abTest === 'test') {
        return (
            <View style={styles.container}>
                <Text>New Checkout Experience</Text>
                <Button title="Purchase" onPress={() => handlePurchase('widget')} />
            </View>
        );
    } else {
        return (
            <View style={styles.container}>
                <Text>Default</Text>
            </View>
        );
    }
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
