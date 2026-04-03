# Changelog

## 0.5.1

### Patch Changes

- 1c2ddcf: Release new version to launch new release process

## 0.5.1

### Patch Changes

- a0dcc8e: Release new minor version to test new release process

All notable changes to the PostHog VS Code extension will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.2.0] - 2026-03-31

### Added

#### Inline Code Intelligence

- Flag decorations: rollout percentage, variant count, and experiment status shown inline after feature flag calls
- Event decorations: 7-day sparkline and volume count shown inline after `capture()` calls
- Session CodeLens: "X sessions / Y users in 24h" lens above event and flag calls with auto-refresh
- Flag CodeLens: flag type, status, and quick-action links (toggle, detail, references) above flag calls
- Variant highlighting: detect switch/if blocks gating on flag variants and show rollout percentages per branch
- Cmd+click navigation: document links on flag keys open flag or experiment detail panels
- Event naming diagnostics: warn on typos and close matches in `capture()` event names via Levenshtein distance

#### Autocomplete

- Flag key autocomplete inside `isFeatureEnabled()`, `getFeatureFlag()`, and related methods
- Event name autocomplete inside `capture()` calls
- Event property name and top value autocomplete inside capture properties
- Variant key autocomplete for multivariate flags

#### Code Actions and Quick Fixes

- "Create flag in PostHog" quick fix when a flag key is not found in the project
- "Toggle flag" quick fix to enable/disable a flag directly from the editor
- "Clean up stale flag" quick fix to remove references to fully-rolled-out or inactive flags
- "Wrap in feature flag" refactor action to wrap selected code in an `isFeatureEnabled` guard

#### Commands

- `PostHog: Sign In` / `Sign Out` / `Sign In with PostHog` (OAuth)
- `PostHog: Select Project` for multi-project switching
- `PostHog: Refresh Feature Flags` to force a cache refresh
- `PostHog: Find Flag` with quick pick search across all flags
- `PostHog: Toggle Flag` to enable/disable a flag with confirmation
- `PostHog: Copy Flag Key` and `Open in PostHog` (browser)
- `PostHog: Create Feature Flag` from the editor
- `PostHog: Wrap in Flag` to wrap selected code in a feature flag guard
- `PostHog: Find Flag References` to search the workspace for a flag key
- `PostHog: Generate Flag Types` to generate TypeScript type definitions from flag payloads
- `PostHog: Generate Type` via editor context menu
- `PostHog: Scan for Stale Flags` to scan the codebase for flags that are fully rolled out, inactive, or experiment-complete
- `PostHog: Clean Up Stale Flag` to remove a single stale flag reference
- `PostHog: Export Stale Flags` to export stale flag scan results as a report
- `PostHog: Watch Sessions` to open a session replay panel for a given event or flag
- `PostHog: Show Flag Detail` / `Show Experiment Detail` in editor-tab panels
- `PostHog: Launch Experiment` / `Stop Experiment`

#### Sidebar and Detail Views

- Branded welcome screen with PostHog logo and dual sign-in (API key + OAuth)
- Sidebar with Flags, Experiments, and Analytics tabs with search and filter
- No-results feedback message when search returns empty
- Tabs default to Flags on first open
- Feature flag detail panel (full editor tab) with status, rollout, and variants
- Experiment detail panel with Bayesian results visualization
- Session replay panel showing sessions related to a flag or event
- Analytics tab with skeleton loading cards and shimmer animation
- Chart theme support with light/dark CSS overrides and automatic theme detection

#### Stale Flag Detection

- Codebase-wide scan for flags that are fully rolled out, inactive, or experiment-complete
- Stale flags tree view in the sidebar with per-flag references
- Single flag cleanup with regex-based code removal
- Batch cleanup of all stale flags
- Stale flag report export
- Scan glob limited to actually supported languages (JS/TS only)

#### Team Configuration

- `.posthog.json` workspace config for shared team settings (host, projectId, client names, flag functions)
- Multi-project support: detects when a file belongs to a different project and offers to switch
- Configurable additional client names (e.g., `toolbarPosthogJS`, `telemetry`)
- Configurable additional flag functions (e.g., `useFeatureFlag`)
- React hooks (`useFeatureFlag`, `useFeatureFlagPayload`, `useFeatureFlagVariantKey`, `useActiveFeatureFlags`) detected automatically
- `detectNestedClients` setting for calls like `window.posthog?.capture()`
- `showInlineDecorations` toggle to enable/disable inline decorations
- `multiProjectNotifications` toggle

#### Code Generation

- `generateFlagTypes` pure function to generate TypeScript interfaces from flag payloads
- Recursive type inference with safe property name quoting
- Generate Flag Types command with guards and auto-open of generated file

#### Authentication

- API key authentication with SecretStorage
- OAuth PKCE flow with `posthog.signInOAuth` command
- Dual sign-in buttons on the welcome screen (API key and OAuth)
- OAuth token storage in AuthService
- Proactive token refresh in PostHogService
- RBAC-aware: stores `canWrite` permission from API

#### Infrastructure

- Tree-sitter powered code intelligence via web-tree-sitter (JS/TS grammars)
- In-memory caches with onChange listener pattern for flags, events, and experiments
- Periodic cache refresh: flags every 1 min, events and experiments every 5 min
- Flag diff notifications: shows info message when a flag is toggled externally
- Status bar showing project name, host region (US/EU), and last sync time
- Extension self-telemetry via PostHog (respects VS Code telemetry setting, disabled in dev mode)
- Debug tree view (visible only in development mode) for inspecting cache state
- HogQL query support with `escapeHogQLString()` for safe interpolation
- GitHub Actions CI workflow for tests
- GitHub Actions publish workflow with conventional-commit version bumping

### Fixed

- HogQL escaping bug in `getEventVolumes` (CodeQL alert)
- Incomplete URL substring sanitization (CodeQL alert)
- `buildCleanupEdit` returning null on edge cases
- `detectNestedClients` default mismatch between config schema and code
- Volume and sparkline time windows now both use 7 days consistently
- Stale flag cleanup regex reads `additionalClientNames` from config
- Stale flag scan glob limited to actually supported languages (JS/TS)

### Changed

- React hooks detected automatically without requiring manual configuration
- ExperimentCacheService now follows the onChange listener pattern (consistent with other caches)
- Flag methods in stale flag service scoped to JS/TS only

### Removed

- HogQL editor feature (`.hogql` language, `HogQLEditorProvider`)
- Error tracking feature (`errorCacheService`, `errorDecorationProvider`)
- Smart capture insertion (`captureCodeActionProvider`)
- Python, Go, and Ruby tree-sitter language support (focused on JS/TS for v1)

## [0.1.0] - 2025-03-08

### Added

- Feature flag sidebar with search and detail panels
- Event tracking with autocomplete
- Experiment monitoring with Bayesian results
- Session replay integration
- Tree-sitter powered code intelligence
- Stale flag detection and auto-cleanup
- VS Code Marketplace publishing via GitHub Actions
