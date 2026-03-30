# Codehog v1 Roadmap

We are refactoring toward a focused v1. **JS/TS only.** Every feature must answer: "what problem does this solve for the developer?"

## v1 Features

### Inline code intelligence (providers/)
- Event decorations: sparkline + volume (7d) after `capture()` calls
- Flag decorations: rollout %, variant count, experiment status after flag calls
- Session CodeLens: "X sessions / Y users in 24h" above event and flag calls
- Autocomplete: event names, event property names, event property top values, flag keys
- Code action: auto-create flag in PostHog when flag key doesn't exist
- Cmd+click: navigate to flag/experiment detail view via document links
- Variant highlighting: detect switch/if blocks and show rollout percentages
- Stale flag detection: scan codebase for flags that are fully rolled out, inactive, or experiment-complete

### Sidebar (views/)
- Auth: better landing page, OAuth support (new)
- Tabs: Analytics (saved insights), Flags, Experiments
- List views with search/filter

### Detail views (views/)
- Feature flag detail panel
- Experiment detail panel with Bayesian results

### New for v1
- Code generation for flag payload types
- OAuth auth flow

## Dropped from v1
- Error tracking (errorCacheService, errorDecorationProvider)
- HogQL editor (HogQLEditorProvider, .hogql language)
- Smart capture insertion (captureCodeActionProvider)
- Python, Go, Ruby language support
