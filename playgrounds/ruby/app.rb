require 'posthog-ruby'

posthog = PostHog::Client.new(
  api_key: 'phc_test',
  host: 'https://us.posthog.com'
)

# Try typing inside the quotes — PostHog should autocomplete flag keys
flag = posthog.get_feature_flag('')

enabled = posthog.is_feature_enabled('')

payload = posthog.get_feature_flag_payload('')

if enabled
  puts 'Feature is enabled'
end

# Try typing inside the quotes — PostHog should autocomplete event names
posthog.capture('')

puts flag, enabled, payload
