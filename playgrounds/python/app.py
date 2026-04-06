# Python PostHog Extension Playground
# Tests ALL extension features against the Python SDK
#
# Launch with: F5 → "Playground: Python"
# Each section has a TODO comment describing what to verify.

from posthog import Posthog

# ═══════════════════════════════════════════════════════════════════════
# 1. INIT DETECTION
#    TODO: Inline decoration should show project/host info after this line
#    e.g. "● connected · US Cloud" or "● PostHog · US Cloud"
# ═══════════════════════════════════════════════════════════════════════

posthog = Posthog(
    api_key="phc_test_token",
    host="https://us.posthog.com",
)

# Constructor alias — should also show init decoration
client = Posthog(api_key="phc_other_token", host="https://eu.posthog.com")


# ═══════════════════════════════════════════════════════════════════════
# 2. INLINE FLAG DECORATIONS
#    TODO: Each line should show flag status after the call:
#    ● enabled / ○ inactive / ⚠ not in PostHog / ⚗ experiment running
# ═══════════════════════════════════════════════════════════════════════

flag = posthog.get_feature_flag("onboarding-wizard-prominence", "user-1")
enabled = posthog.is_feature_enabled("beta-feature", "user-1")
also_enabled = posthog.feature_enabled("onboarding-wizard-prominence", "user-1")
payload = posthog.get_feature_flag_payload("config-flag", "user-1")
remote = posthog.get_remote_config("remote-key", "user-1")


# ═══════════════════════════════════════════════════════════════════════
# 3. FLAG AUTOCOMPLETE
#    TODO: Place cursor inside the quotes and trigger autocomplete (Ctrl+Space).
#    Should show a list of flag keys from your PostHog project.
# ═══════════════════════════════════════════════════════════════════════

posthog.get_feature_flag("", "user-1")
posthog.is_feature_enabled("", "user-1")


# ═══════════════════════════════════════════════════════════════════════
# 4. UNKNOWN FLAG DETECTION
#    TODO: The flag key should have a yellow wavy underline with
#    "⚠ not in PostHog" and a "Create Flag" quick fix (Cmd+.)
# ═══════════════════════════════════════════════════════════════════════

posthog.get_feature_flag("this-flag-does-not-exist", "user-1")


# ═══════════════════════════════════════════════════════════════════════
# 5. VARIANT HIGHLIGHTING (if/elif/else)
#    TODO: Each branch should be color-coded with the variant name,
#    rollout %, and experiment results (if linked to an experiment).
#    The else block should infer the remaining variant.
# ═══════════════════════════════════════════════════════════════════════

if flag == "control":
    print("Control group — original experience")
elif flag == "wizard-hero":
    print("Wizard hero variant — new experience")
else:
    # Should infer the remaining variant if flag has [control, wizard-hero, ...]
    print("Remaining variant")


# ═══════════════════════════════════════════════════════════════════════
# 6. BOOLEAN FLAG HIGHLIGHTING
#    TODO: if-block should show green "enabled", else should show gray "disabled"
# ═══════════════════════════════════════════════════════════════════════

if enabled:
    print("Feature is ON")
else:
    print("Feature is OFF")


# ═══════════════════════════════════════════════════════════════════════
# 7. NEGATED FLAG CHECK
#    TODO: The if-block should show "disabled" (negated), else shows "enabled"
# ═══════════════════════════════════════════════════════════════════════

if not posthog.is_feature_enabled("another-flag", "user-1"):
    print("Flag is OFF (negated check)")
else:
    print("Flag is ON")


# ═══════════════════════════════════════════════════════════════════════
# 8. INLINE FLAG COMPARISON (no variable)
#    TODO: Variant highlighting should work even without assigning to a variable.
#    Each branch colored by variant, with flag info in the label.
# ═══════════════════════════════════════════════════════════════════════

if posthog.get_feature_flag("file-engagement-v2", "user-1") == "control":
    print("Inline control")
elif posthog.get_feature_flag("file-engagement-v2", "user-1") == "red":
    print("Inline red")
else:
    print("Inline else")


# ═══════════════════════════════════════════════════════════════════════
# 9. EVENT CAPTURE — POSITIONAL ARGS
#    TODO: Each line should show inline event volume + sparkline,
#    e.g. "▁▂▃▅▆▇█ 12.3K in 7d" or "unknown event"
# ═══════════════════════════════════════════════════════════════════════

posthog.capture("user-1", "purchase_completed", properties={"amount": 42})
posthog.capture("user-1", "page_viewed")
posthog.capture("user-1", "this_event_does_not_exist")


# ═══════════════════════════════════════════════════════════════════════
# 10. EVENT CAPTURE — KEYWORD ARGS
#     TODO: Should also detect event name from the `event=` keyword argument
# ═══════════════════════════════════════════════════════════════════════

posthog.capture(distinct_id="user-1", event="signup_completed")
posthog.capture(distinct_id="user-1", event="button_clicked", properties={"button": "submit"})


# ═══════════════════════════════════════════════════════════════════════
# 11. EVENT AUTOCOMPLETE
#     TODO: Place cursor inside the quotes and trigger autocomplete.
#     Should show known event names from your PostHog project.
# ═══════════════════════════════════════════════════════════════════════

posthog.capture("user-1", "")


# ═══════════════════════════════════════════════════════════════════════
# 12. CONSTANT REFERENCES
#     TODO: Flag keys and event names defined as constants should still
#     be detected and show inline decorations.
# ═══════════════════════════════════════════════════════════════════════

FLAG_KEY = "file-engagement-v2"
const_flag = posthog.get_feature_flag(FLAG_KEY, "user-1")

EVENT_NAME = "purchase_completed"
posthog.capture("user-1", EVENT_NAME)


# ═══════════════════════════════════════════════════════════════════════
# 13. CLIENT ALIAS
#     TODO: Aliases should be detected — `ph` is recognized as a PostHog client.
#     All inline decorations should work on `ph.method()` calls.
# ═══════════════════════════════════════════════════════════════════════

ph = posthog
ph.capture("user-1", "aliased_event")
ph_flag = ph.get_feature_flag("file-engagement-v2", "user-1")


# ═══════════════════════════════════════════════════════════════════════
# 14. CONSTRUCTOR ALIAS
#     TODO: Variables assigned from Posthog() constructor should be detected.
#     `client.method()` should show decorations.
# ═══════════════════════════════════════════════════════════════════════

client.capture("user-1", "constructor_event")
client_flag = client.get_feature_flag("file-engagement-v2", "user-1")


# ═══════════════════════════════════════════════════════════════════════
# 15. CMD+CLICK / FLAG LINKS
#     TODO: Cmd+click on any flag key string should open the flag detail panel.
#     Try Cmd+clicking "file-engagement-v2" below:
# ═══════════════════════════════════════════════════════════════════════

posthog.get_feature_flag("file-engagement-v2", "user-1")


# ═══════════════════════════════════════════════════════════════════════
# 16. CODELENS
#     TODO: Above flag/capture calls, CodeLens should appear:
#     - Flag: "Feature Flag: key (enabled · 100%)" or "Experiment: name (running)"
#     - Session: "X sessions · Y users in 24h" (only if sessions > 0)
# ═══════════════════════════════════════════════════════════════════════

# (CodeLens appears above the first occurrence of each flag/event)


# ═══════════════════════════════════════════════════════════════════════
# 17. STALE FLAG DETECTION
#     TODO: Run "PostHog: Scan for Stale Flags" from the Command Palette.
#     The stale flags tree view should include references from this .py file.
# ═══════════════════════════════════════════════════════════════════════

posthog.is_feature_enabled("stale-flag-to-test", "user-1")


# ═══════════════════════════════════════════════════════════════════════
# 18. VARIANT DIAGNOSTICS
#     TODO: If you check against a value that's not a valid variant,
#     a yellow warning should appear. Try changing "control" to "invalid":
# ═══════════════════════════════════════════════════════════════════════

test_flag = posthog.get_feature_flag("file-engagement-v2", "user-1")
if test_flag == "control":
    pass
elif test_flag == "red":
    pass
# Missing "blue" — should show "Not all variants covered" info diagnostic
# (only if there's no else block)


# ═══════════════════════════════════════════════════════════════════════
# 19. CONSTANTS / ENUMS / OBJECTS — Static inference edge cases
#     TODO: Flag keys and event names stored in constants, dicts, or class
#     attributes should be resolved and show inline decorations.
# ═══════════════════════════════════════════════════════════════════════

# Simple constant — should resolve to the string value
MY_FLAG = "file-engagement-v2"
resolved_flag = posthog.get_feature_flag(MY_FLAG, "user-1")

# Constant for event name (2nd positional arg)
MY_EVENT = "purchase_completed"
posthog.capture("user-1", MY_EVENT)

# UPPER_CASE constant convention
FEATURE_TOGGLE = "beta-feature"
posthog.is_feature_enabled(FEATURE_TOGGLE, "user-1")

# Multiple constants on different lines
FLAG_A = "flag-a"
FLAG_B = "flag-b"
posthog.get_feature_flag(FLAG_A, "user-1")
posthog.get_feature_flag(FLAG_B, "user-1")

# Dict/object keys — NOT expected to work (known limitation)
FLAGS = {"checkout": "checkout-v2", "onboarding": "onboarding-flow"}
posthog.get_feature_flag(FLAGS["checkout"], "user-1")  # dynamic — won't resolve

# Class attribute — NOT expected to work (known limitation)
class Config:
    FLAG_KEY = "class-flag"
posthog.get_feature_flag(Config.FLAG_KEY, "user-1")  # dynamic — won't resolve

# f-string — NOT expected to work (known limitation)
version = "v2"
posthog.capture("user-1", f"checkout_{version}")  # dynamic — won't resolve

# Ternary / conditional — NOT expected to work (known limitation)
posthog.get_feature_flag("flag-a" if True else "flag-b", "user-1")  # dynamic


# ═══════════════════════════════════════════════════════════════════════
# SUMMARY: All extension features that should work in Python:
#
#  [  ] Init detection (Posthog constructor)
#  [  ] Inline flag decorations (● enabled / ○ inactive / ⚠ not in PostHog)
#  [  ] Flag key autocomplete
#  [  ] Unknown flag wavy underline + "Create Flag" quick fix
#  [  ] Variant highlighting (if/elif/else with color-coded branches)
#  [  ] Boolean flag highlighting (green enabled / gray disabled)
#  [  ] Negated flag check highlighting
#  [  ] Inline flag comparison highlighting
#  [  ] Event capture detection (positional 2nd arg)
#  [  ] Event capture detection (keyword event= arg)
#  [  ] Event autocomplete
#  [  ] Constant reference resolution
#  [  ] Client alias detection (ph = posthog)
#  [  ] Constructor alias detection (client = Posthog(...))
#  [  ] Cmd+click flag links
#  [  ] CodeLens (flags + sessions)
#  [  ] Stale flag scanning (.py files included)
#  [  ] Variant diagnostics (invalid variant warning, missing coverage)
# ═══════════════════════════════════════════════════════════════════════

print(flag, enabled, also_enabled, payload, remote, const_flag, ph_flag, client_flag, test_flag)
