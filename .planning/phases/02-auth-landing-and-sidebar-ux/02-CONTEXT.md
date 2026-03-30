# Phase 2: Auth Landing and Sidebar UX - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Polish the unauthenticated landing page to be on-brand and welcoming. Ensure search/filter works correctly on flags and experiments lists. Confirm the three-tab sidebar structure (Analytics, Flags, Experiments) is clean and functional. This is a visual/UX polish phase — no new services or API integrations.

</domain>

<decisions>
## Implementation Decisions

### Auth landing page design
- Redesign the `#welcome-screen` div in layout.ts to be a polished, branded landing page
- Use PostHog logo (already passed as logoUri), PostHog blue (#1D4AFF) for primary CTA
- Clear "Sign In with API Key" button as primary action
- Brief description of what the extension does (feature flags, experiments, analytics in your editor)
- Keep it simple — one screen, one CTA, no multi-step onboarding
- The OAuth sign-in button will be added in Phase 4 — for now, API key only

### Search/filter behavior
- Real-time filtering as user types (already implemented via `filterItems()` in script.ts)
- Search filters within the current active tab only
- Clear search input when switching tabs (current behavior, keep it)
- Search matches against item name/key text content
- Ensure search works correctly for both flags list (`item` class) and experiments list (`item` class) and analytics (`insight-card` class)

### Tab structure
- Three tabs: Analytics, Flags, Experiments (already exists in layout.ts)
- Analytics tab loads on startup as default (current behavior)
- Lazy load tab data on first switch (current behavior via `loadedTabs` set)
- Active tab highlighted with PostHog blue border-bottom (current implementation)

### Claude's Discretion
- Exact copy/wording on the landing page
- Spacing, padding, and typography details
- Whether to add subtle animations or transitions
- Empty state messaging refinements

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Webview templates (files to modify)
- `src/views/webview/layout.ts` — HTML structure including `#welcome-screen` and tab/section structure
- `src/views/webview/styles.ts` — CSS including `.welcome`, `.nav-tab`, `.search-bar`, `.item-list` styles
- `src/views/webview/script.ts` — JS including `switchTab()`, `filterItems()`, tab lazy-loading

### Brand reference
- `CLAUDE.md` — PostHog brand colors (#1D4AFF blue, #F9BD2B yellow, #F54E00 orange, #4CBB17 green)

### Requirements
- `.planning/REQUIREMENTS.md` — AUTH-01, SIDE-01, SIDE-02, SIDE-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `#welcome-screen` div in layout.ts: existing welcome screen structure, just needs visual polish
- `filterItems()` in script.ts: search/filter already implemented, filters by text content
- `.nav-tab` CSS in styles.ts: tab styling already exists with active state
- `switchTab()` in script.ts: tab switching with lazy loading already works
- Logo URI passed via `getLayout(logoUri)` — already available in the welcome screen

### Established Patterns
- All webview HTML is template literals in layout.ts, CSS in styles.ts, JS in script.ts
- VS Code theme variables used throughout (--vscode-foreground, --vscode-sideBar-background, etc.)
- PostHog CSS variables defined (--ph-blue, --ph-yellow, etc.)
- Communication via `vscode.postMessage()` ↔ `webview.onDidReceiveMessage()`

### Integration Points
- `SidebarProvider.ts` handles message passing — no changes needed for this phase
- `getWebviewHtml.ts` composes styles + layout + script with CSP nonce — no changes needed
- Search input already wired with `input` event listener calling `filterItems()`

</code_context>

<specifics>
## Specific Ideas

- Landing page should feel premium — PostHog is a well-known brand, the extension should match that quality
- "Best-looking VS Code extension possible" is a project design principle (from CLAUDE.md)
- The welcome screen currently says "Your PostHog command center" — keep or refine this messaging

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-auth-landing-and-sidebar-ux*
*Context gathered: 2026-03-30*
