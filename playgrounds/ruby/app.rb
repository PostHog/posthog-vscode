# Ruby PostHog Extension Playground
# Tests ALL extension features against the Ruby SDK
#
# Launch with: F5 → "Playground: Ruby"
# Each section has a TODO comment describing what to verify.

require 'posthog-ruby'

# ═══════════════════════════════════════════════════════════════════════
# 1. INIT DETECTION
#    TODO: Inline decoration should show project/host info after this line
#    e.g. "● connected · US Cloud" or "● PostHog · US Cloud"
# ═══════════════════════════════════════════════════════════════════════

posthog = PostHog::Client.new(
  api_key: 'phc_test_token',
  host: 'https://us.posthog.com'
)

# Constructor alias — should also show init decoration
client = PostHog::Client.new(api_key: 'phc_other_token', host: 'https://eu.posthog.com')


# ═══════════════════════════════════════════════════════════════════════
# 2. INLINE FLAG DECORATIONS
#    TODO: Each line should show flag status after the call:
#    ● enabled / ○ inactive / ⚠ not in PostHog / ⚗ experiment running
# ═══════════════════════════════════════════════════════════════════════

flag = posthog.get_feature_flag('onboarding-wizard-prominence', 'user-1')
enabled = posthog.is_feature_enabled('beta-feature', 'user-1')
payload = posthog.get_feature_flag_payload('config-flag', 'user-1')


# ═══════════════════════════════════════════════════════════════════════
# 3. FLAG AUTOCOMPLETE
#    TODO: Place cursor inside the quotes and trigger autocomplete (Ctrl+Space).
#    Should show a list of flag keys from your PostHog project.
# ═══════════════════════════════════════════════════════════════════════

posthog.get_feature_flag('', 'user-1')
posthog.is_feature_enabled('', 'user-1')


# ═══════════════════════════════════════════════════════════════════════
# 4. UNKNOWN FLAG DETECTION
#    TODO: The flag key should have a yellow wavy underline with
#    "⚠ not in PostHog" and a "Create Flag" quick fix (Cmd+.)
# ═══════════════════════════════════════════════════════════════════════

posthog.get_feature_flag('this-flag-does-not-exist', 'user-1')


# ═══════════════════════════════════════════════════════════════════════
# 5. VARIANT HIGHLIGHTING (if/elsif/else)
#    TODO: Each branch should be color-coded with the variant name,
#    rollout %, and experiment results (if linked to an experiment).
#    The else block should infer the remaining variant.
# ═══════════════════════════════════════════════════════════════════════

if flag == 'control'
  puts 'Control group — original experience'
elsif flag == 'wizard-hero'
  puts 'Wizard hero variant — new experience'
else
  # Should infer the remaining variant if flag has [control, wizard-hero, blue]
  puts 'Remaining variant'
end


# ═══════════════════════════════════════════════════════════════════════
# 6. BOOLEAN FLAG HIGHLIGHTING
#    TODO: if-block should show green "enabled", else should show gray "disabled"
# ═══════════════════════════════════════════════════════════════════════

if enabled
  puts 'Feature is ON'
else
  puts 'Feature is OFF'
end


# ═══════════════════════════════════════════════════════════════════════
# 7. NEGATED FLAG CHECK
#    TODO: The if-block should show "disabled" (negated), else shows "enabled"
# ═══════════════════════════════════════════════════════════════════════

if !posthog.is_feature_enabled('another-flag', 'user-1')
  puts 'Flag is OFF (negated check)'
else
  puts 'Flag is ON'
end


# ═══════════════════════════════════════════════════════════════════════
# 8. INLINE FLAG COMPARISON (no variable)
#    TODO: Variant highlighting should work even without assigning to a variable.
#    Each branch colored by variant, with flag info in the label.
# ═══════════════════════════════════════════════════════════════════════

if posthog.get_feature_flag('file-engagement-v2', 'user-1') == 'control'
  puts 'Inline control'
elsif posthog.get_feature_flag('file-engagement-v2', 'user-1') == 'red'
  puts 'Inline red'
else
  puts 'Inline else'
end


# ═══════════════════════════════════════════════════════════════════════
# 9. EVENT CAPTURE — KEYWORD ARGS
#    TODO: Each line should show inline event volume + sparkline,
#    e.g. "▁▂▃▅▆▇█ 12.3K in 7d" or "unknown event"
# ═══════════════════════════════════════════════════════════════════════

posthog.capture(distinct_id: 'user-1', event: 'purchase_completed', properties: { amount: 42 })
posthog.capture(distinct_id: 'user-1', event: 'page_viewed')
posthog.capture(distinct_id: 'user-1', event: 'this_event_does_not_exist')


# ═══════════════════════════════════════════════════════════════════════
# 10. EVENT AUTOCOMPLETE
#     TODO: Place cursor inside the quotes and trigger autocomplete.
#     Should show known event names from your PostHog project.
# ═══════════════════════════════════════════════════════════════════════

posthog.capture(distinct_id: 'user-1', event: '')


# ═══════════════════════════════════════════════════════════════════════
# 11. CONSTANT REFERENCES
#     TODO: Flag keys and event names defined as constants should still
#     be detected and show inline decorations.
# ═══════════════════════════════════════════════════════════════════════

FLAG_KEY = 'file-engagement-v2'
const_flag = posthog.get_feature_flag(FLAG_KEY, 'user-1')

flag_key = 'beta-feature'
posthog.is_feature_enabled(flag_key, 'user-1')


# ═══════════════════════════════════════════════════════════════════════
# 12. CLIENT ALIAS
#     TODO: Aliases should be detected — `ph` is recognized as a PostHog client.
#     All inline decorations should work on `ph.method()` calls.
# ═══════════════════════════════════════════════════════════════════════

ph = posthog
ph.capture(distinct_id: 'user-1', event: 'aliased_event')
ph_flag = ph.get_feature_flag('file-engagement-v2', 'user-1')


# ═══════════════════════════════════════════════════════════════════════
# 13. CONSTRUCTOR ALIAS
#     TODO: Variables assigned from PostHog::Client.new() should be detected.
#     `client.method()` should show decorations.
# ═══════════════════════════════════════════════════════════════════════

client.capture(distinct_id: 'user-1', event: 'constructor_event')
client_flag = client.get_feature_flag('file-engagement-v2', 'user-1')


# ═══════════════════════════════════════════════════════════════════════
# 14. CMD+CLICK / FLAG LINKS
#     TODO: Cmd+click on any flag key string should open the flag detail panel.
#     Try Cmd+clicking "file-engagement-v2" below:
# ═══════════════════════════════════════════════════════════════════════

posthog.get_feature_flag('file-engagement-v2', 'user-1')


# ═══════════════════════════════════════════════════════════════════════
# 15. CODELENS
#     TODO: Above flag/capture calls, CodeLens should appear:
#     - Flag: "Feature Flag: key (enabled · 100%)" or "Experiment: name (running)"
#     - Session: "X sessions · Y users in 24h" (only if sessions > 0)
# ═══════════════════════════════════════════════════════════════════════

# (CodeLens appears above the first occurrence of each flag/event)


# ═══════════════════════════════════════════════════════════════════════
# 16. STALE FLAG DETECTION
#     TODO: Run "PostHog: Scan for Stale Flags" from the Command Palette.
#     The stale flags tree view should include references from this .rb file.
# ═══════════════════════════════════════════════════════════════════════

posthog.is_feature_enabled('stale-flag-to-test', 'user-1')


# ═══════════════════════════════════════════════════════════════════════
# 17. VARIANT DIAGNOSTICS
#     TODO: If you check against a value that's not a valid variant,
#     a yellow warning should appear. Try changing "control" to "invalid":
# ═══════════════════════════════════════════════════════════════════════

test_flag = posthog.get_feature_flag('file-engagement-v2', 'user-1')
if test_flag == 'control'
  # valid
elsif test_flag == 'red'
  # valid
end
# Missing "blue" — should show "Not all variants covered" info diagnostic
# (only if there's no else block)


# ═══════════════════════════════════════════════════════════════════════
# 18. CASE/WHEN VARIANT HIGHLIGHTING
#     TODO: Each when branch should be color-coded with the variant name.
#     The else block should show "default".
# ═══════════════════════════════════════════════════════════════════════

case_flag = posthog.get_feature_flag('onboarding-wizard-prominence', 'user-1')
case case_flag
when 'control'
  puts 'Control variant'
when 'wizard-hero'
  puts 'Wizard hero variant'
else
  puts 'Default variant'
end


# ═══════════════════════════════════════════════════════════════════════
# 19. CONSTANTS / EDGE CASES — Static inference
#     TODO: Flag keys stored in constants should be resolved and show
#     inline decorations.
# ═══════════════════════════════════════════════════════════════════════

# Simple constant — should resolve to the string value
MY_FLAG = 'file-engagement-v2'
resolved_flag = posthog.get_feature_flag(MY_FLAG, 'user-1')

# Local variable constant
my_event = 'purchase_completed'
# Note: event name constants in capture are NOT expected to work
# because the event is in a keyword arg, not a positional arg.

# Multiple constants on different lines
FLAG_A = 'flag-a'
FLAG_B = 'flag-b'
posthog.get_feature_flag(FLAG_A, 'user-1')
posthog.get_feature_flag(FLAG_B, 'user-1')

# Hash keys — NOT expected to work (known limitation)
FLAGS = { checkout: 'checkout-v2', onboarding: 'onboarding-flow' }
posthog.get_feature_flag(FLAGS[:checkout], 'user-1')  # dynamic — won't resolve

# Class attribute — NOT expected to work (known limitation)
class Config
  FLAG_KEY = 'class-flag'
end
posthog.get_feature_flag(Config::FLAG_KEY, 'user-1')  # dynamic — won't resolve

# Interpolation — NOT expected to work (known limitation)
version = 'v2'
posthog.get_feature_flag("checkout_#{version}", 'user-1')  # dynamic — won't resolve


# ═══════════════════════════════════════════════════════════════════════
# SUMMARY: All extension features that should work in Ruby:
#
#  [  ] Init detection (PostHog::Client.new)
#  [  ] Inline flag decorations (● enabled / ○ inactive / ⚠ not in PostHog)
#  [  ] Flag key autocomplete
#  [  ] Unknown flag wavy underline + "Create Flag" quick fix
#  [  ] Variant highlighting (if/elsif/else with color-coded branches)
#  [  ] Boolean flag highlighting (green enabled / gray disabled)
#  [  ] Negated flag check highlighting
#  [  ] Inline flag comparison highlighting
#  [  ] Event capture detection (keyword event: arg)
#  [  ] Event autocomplete
#  [  ] Constant reference resolution
#  [  ] Client alias detection (ph = posthog)
#  [  ] Constructor alias detection (client = PostHog::Client.new(...))
#  [  ] Cmd+click flag links
#  [  ] CodeLens (flags + sessions)
#  [  ] Stale flag scanning (.rb files included)
#  [  ] Variant diagnostics (invalid variant warning, missing coverage)
#  [  ] Case/when variant highlighting
# ═══════════════════════════════════════════════════════════════════════

puts flag, enabled, payload, const_flag, ph_flag, client_flag, test_flag, case_flag
