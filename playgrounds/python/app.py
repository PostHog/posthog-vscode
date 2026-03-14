from posthog import Posthog

posthog = Posthog(
    api_key="phc_test",
    host="https://us.posthog.com",
)

# Try typing inside the quotes — PostHog should autocomplete flag keys
flag = posthog.get_feature_flag("")

enabled = posthog.is_feature_enabled("")

payload = posthog.get_feature_flag_payload("")

if enabled:
    print("Feature is enabled")

# Try typing inside the quotes — PostHog should autocomplete event names
posthog.capture("")

print(flag, enabled, payload)
