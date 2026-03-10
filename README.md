<p align="center">
  <img src="resources/icons/posthog.png" width="400" alt="PostHog" />
</p>

<h1 align="center">PostHog for VS Code</h1>

<p align="center">
  <strong>Your PostHog command center, inside your editor.</strong><br/>
  Feature flags, experiments, analytics, error tracking, and event intelligence — without leaving VS Code.
</p>

<p align="center">
  <a href="https://posthog.com">PostHog</a> ·
  <a href="#features">Features</a> ·
  <a href="#getting-started">Getting Started</a> ·
  <a href="#code-intelligence">Code Intelligence</a> ·
  <a href="#stale-flag-detector">Stale Flag Detector</a>
</p>

---

## Getting Started

1. Install the extension
2. Open the PostHog sidebar (hedgehog icon in the activity bar)
3. Click **Sign In with API Key** — use a [personal API key](https://posthog.com/docs/api#personal-api-keys) (`phx_...`)
4. Select your project

That's it. Your flags, experiments, events, and errors are now in your editor.

---

## Features

### Feature Flags

Manage feature flags without context-switching.

- **Inline status decorations** — see flag state (`● enabled`, `○ inactive`, rollout %, variant count) right next to your code
- **Autocomplete flag keys** — type inside `isFeatureEnabled('` and get suggestions from your PostHog project
- **Unknown flag warnings** — wavy underline on flag keys that don't exist in PostHog, with a quick-fix to create them
- **Clickable links** — flag keys become links that open detail panels
- **Create, toggle, update** — manage flags directly from VS Code
- **Copy key, open in browser** — quick actions on every flag

### Experiments

See experiment results where the code lives.

- **Inline experiment indicators** — flags linked to experiments show status (`⚗ running`, `⚗ won · variant-a 94%`)
- **Bayesian results** — chance to win, credible intervals, variant performance, and winner badges
- **Detail panels** — full experiment breakdown in an editor tab
- **Variant highlighting** — visual distinction for code paths behind experiment variants

### Event Tracking & Analytics

Your analytics layer, annotated.

- **Event name autocomplete** — suggestions from your PostHog project inside `posthog.capture('`
- **Property autocomplete** — keys, types, and top values for event properties
- **Inline volume decorations** — see event count (last 7 days) and sparkline charts next to `capture()` calls
- **Saved insights** — browse your PostHog dashboards in the sidebar with auto-refresh

### Smart Capture Insertion

Instrument code in one click.

- Place your cursor on any function, method, or arrow function
- Open the refactor menu (lightbulb) → **"Track `user_login` with PostHog"**
- Inserts `posthog.capture()` with:
  - A smart event name derived from the function (`handleUserLogin` → `user_login`, `UserProfile` → `user_profile_viewed`)
  - Function parameters as event properties (filters out noise like `e`, `event`, `ctx`)
  - `useEffect` wrapper for React components

### Error Tracking

Jump from error to source code.

- **Browse errors** in the sidebar with occurrence counts and status
- **Stack trace navigation** — click an error to jump to the exact file and line in your workspace
- **Detail panels** — full error context in an editor tab

### Stale Flag Detector

Tech debt cleanup on autopilot.

- **Scan your entire codebase** for feature flag references
- **Cross-reference with PostHog** to find flags that are:
  - **Fully rolled out** — 100% rollout, no conditions (safe to remove the check)
  - **Inactive** — flag is turned off
  - **Experiment complete** — linked experiment has ended
  - **Not in PostHog** — flag key doesn't exist in your project
- **Tree view** grouped by staleness reason, with click-to-navigate references
- **One-click cleanup** — removes the flag check and keeps the correct code branch (handles `if/else` and ternary patterns)

### HogQL Editor

Query PostHog data from your editor.

- **Syntax highlighting** for HogQL (PostHog's SQL dialect)
- **Run queries** with `Cmd+Enter` and see results in a formatted table
- **`.hogql` file support** — save and run query files

---

## Sidebar

The PostHog sidebar organizes everything into tabs:

| Tab | What's there |
|-----|-------------|
| **Analytics** | Saved insights with sparklines, funnels, retention grids |
| **Flags** | All feature flags, sorted by status, with inline actions |
| **Errors** | Error tracking issues with occurrence counts |
| **Experiments** | Experiments with status indicators and results |

Plus a **Stale Flags** tree view below the main sidebar for codebase-wide flag hygiene.

---

## Supported Languages

Code intelligence (autocomplete, decorations, code actions) works in:

- JavaScript
- TypeScript
- JSX / TSX

The HogQL editor supports `.hogql` files with full syntax highlighting.

---

## Commands

All commands are available via the Command Palette (`Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `PostHog: Sign In` | Connect with your API key |
| `PostHog: Sign Out` | Disconnect |
| `PostHog: Select Project` | Switch between projects |
| `PostHog: Refresh Feature Flags` | Re-fetch flags from PostHog |
| `PostHog: Create Feature Flag` | Create a new flag |
| `PostHog: Copy Flag Key` | Copy a flag key to clipboard |
| `PostHog: Open in PostHog` | Open flag in the PostHog dashboard |
| `PostHog: Open HogQL Editor` | Launch the query editor |
| `PostHog: Run HogQL File` | Execute the current `.hogql` file |
| `PostHog: Scan for Stale Flags` | Find stale flag references in your codebase |
| `PostHog: Clean Up Stale Flag` | Remove a stale flag check from code |
| `PostHog: Track Function with PostHog` | Insert a `capture()` call on a function |

---

## Requirements

- VS Code 1.109.0+
- A [PostHog](https://posthog.com) account with a personal API key

---

<p align="center">
  Built with 🦔 by the PostHog community
</p>
