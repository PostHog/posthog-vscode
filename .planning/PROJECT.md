# Codehog — PostHog for VS Code

## What This Is

A VS Code extension that brings PostHog into the editor: feature flags, experiments, event analytics, and session replay — all inline in your code. JS/TS only for v1. Every feature must answer: "what problem does this solve for the developer?"

## Core Value

Developers can see PostHog data (flags, events, experiments, sessions) inline in their code without leaving the editor.

## Requirements

### Validated

- ✓ Authentication via API key with project selection — existing
- ✓ Feature flag autocomplete in string literals — existing
- ✓ Event name autocomplete in capture calls — existing
- ✓ Event property name + top values autocomplete — existing
- ✓ Inline flag decorations (rollout %, variant count, experiment status) — existing
- ✓ Inline event decorations (sparkline + 7d volume) — existing
- ✓ Flag code action (auto-create flag in PostHog) — existing
- ✓ Cmd+click navigation to flag/experiment detail — existing
- ✓ Variant highlighting with rollout percentages — existing
- ✓ Session CodeLens ("X sessions / Y users in 24h") — existing
- ✓ Stale flag detection (fully rolled out, inactive, experiment-complete) — existing
- ✓ Sidebar with feature flags list — existing
- ✓ Sidebar with experiments list — existing
- ✓ Feature flag detail panel — existing
- ✓ Experiment detail panel with Bayesian results — existing
- ✓ Tree-sitter AST parsing for JS/TS — existing

### Active

- [ ] Better auth landing page in sidebar
- [ ] OAuth authentication flow
- [ ] Sidebar Analytics tab (saved insights)
- [ ] Sidebar search/filter on list views
- [ ] Code generation for flag payload types
- [ ] Remove error tracking (errorCacheService, errorDecorationProvider)
- [ ] Remove HogQL editor (HogQLEditorProvider, .hogql language)
- [ ] Remove smart capture insertion (captureCodeActionProvider)
- [ ] Remove Python, Go, Ruby language support

### Out of Scope

- Error tracking — dropped from v1 (complexity, not core to dev workflow)
- HogQL editor — dropped from v1 (niche feature, low usage)
- Smart capture insertion — dropped from v1 (too magical, unclear value)
- Python/Go/Ruby support — JS/TS only for v1

## Context

Brownfield VS Code extension with existing codebase. Architecture follows VS Code patterns: services for data, providers for language features, views for webview panels. Uses tree-sitter for AST parsing. Built with pnpm + webpack.

Current state: working extension with flag/event decorations, autocomplete, code actions, session CodeLens, stale flag detection, sidebar, and detail panels. Needs refactoring to remove dropped features and add new v1 features (OAuth, analytics tab, code generation, better auth UX).

## Constraints

- **Tech stack**: VS Code Extension API, TypeScript, webpack, pnpm, web-tree-sitter
- **Language scope**: JS/TS only for v1
- **Brand**: Must follow PostHog visual language (#1D4AFF blue, #F9BD2B yellow, #F54E00 orange)
- **Distribution**: VS Code Marketplace via GitHub Actions
- **Design**: Must be the best-looking VS Code extension possible

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| JS/TS only for v1 | Focus effort, ship faster, validate before expanding | — Pending |
| Drop error tracking | Not core to developer workflow, high complexity | — Pending |
| Drop HogQL editor | Niche feature, low expected usage | — Pending |
| Drop smart capture insertion | Too magical, unclear value proposition | — Pending |
| Add OAuth | Better auth UX, standard flow, enables future features | — Pending |
| Add flag payload type codegen | Unique differentiator, solves real typing problem | — Pending |

---
*Last updated: 2026-03-30 after initialization*
