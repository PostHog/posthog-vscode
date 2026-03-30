# Phase 2: Auth Landing and Sidebar UX - Research

**Researched:** 2026-03-30
**Domain:** VS Code webview UI — template literals, CSS theming, search/filter UX
**Confidence:** HIGH

## Summary

This is a pure UI polish phase. All three files that need changes (`layout.ts`, `styles.ts`, `script.ts`) are template-literal string generators — no external build pipeline, no new dependencies, no API integrations. The implementation scope is tightly bounded: redesign the `#welcome-screen` div, verify search/filter correctness, and confirm tab structure is clean.

The existing code already implements the functional requirements. `filterItems()` in `script.ts` already filters `.item` and `.insight-card` elements by text content. `switchTab()` already clears the search input on tab change. The three-tab nav already exists in `layout.ts` with active-state CSS. What is missing is visual quality on the unauthenticated landing screen.

The primary risk in this phase is the CSP: `getWebviewHtml.ts` uses `default-src 'none'` with nonce-scoped styles and scripts. Any inline `style=` attributes in the HTML template are allowed (they are not blocked by `style-src 'nonce-…'`), but no external fonts or external image sources may be loaded. All styles must remain in the `<style nonce="…">` block in `styles.ts`. The logo is already served via `webview.asWebviewUri` which is covered by the `img-src ${webview.cspSource}` directive.

**Primary recommendation:** Make surgical, targeted changes to `#welcome-screen` HTML in `layout.ts` and its CSS in `styles.ts`. Do not touch `script.ts` for the welcome screen — it is already correct. For search/filter, read `filterItems()` and the `authState` message handler carefully before declaring anything broken — the functionality exists and may only need a minor fix to the analytics section selector.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Redesign the `#welcome-screen` div in layout.ts to be a polished, branded landing page
- Use PostHog logo (already passed as logoUri), PostHog blue (#1D4AFF) for primary CTA
- Clear "Sign In with API Key" button as primary action
- Brief description of what the extension does (feature flags, experiments, analytics in your editor)
- Keep it simple — one screen, one CTA, no multi-step onboarding
- The OAuth sign-in button will be added in Phase 4 — for now, API key only
- Real-time filtering as user types (already implemented via `filterItems()` in script.ts)
- Search filters within the current active tab only
- Clear search input when switching tabs (current behavior, keep it)
- Search matches against item name/key text content
- Ensure search works correctly for both flags list (`item` class) and experiments list (`item` class) and analytics (`insight-card` class)
- Three tabs: Analytics, Flags, Experiments (already exists in layout.ts)
- Analytics tab loads on startup as default (current behavior)
- Lazy load tab data on first switch (current behavior via `loadedTabs` set)
- Active tab highlighted with PostHog blue border-bottom (current implementation)

### Claude's Discretion
- Exact copy/wording on the landing page
- Spacing, padding, and typography details
- Whether to add subtle animations or transitions
- Empty state messaging refinements

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | User sees a polished landing page in the sidebar when not authenticated | Welcome screen HTML/CSS redesign in layout.ts + styles.ts; PostHog brand colors already available via CSS variables |
| SIDE-01 | User can search/filter feature flags list by name | `filterItems()` already exists; flags use `.item` selector; verify empty-state visibility during filtered results |
| SIDE-02 | User can search/filter experiments list by name | Same `filterItems()` covers experiments (also `.item`); same verification needed |
| SIDE-03 | Sidebar tabs: Flags, Experiments, Analytics (saved insights) | Three-tab nav exists; verify tab order matches requirement (currently: Analytics, Flags, Experiments) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| VS Code Webview API | built-in | Renders sandboxed HTML/CSS/JS in sidebar | No alternative — this is the extension's webview host |
| Template literals (TypeScript) | N/A | Generates HTML/CSS/JS as strings | Project-established pattern; see CLAUDE.md |
| VS Code CSS variables | built-in | Theme-adaptive colors | Required for light/dark mode compatibility |
| PostHog CSS variables (`--ph-*`) | project-defined | Brand colors | Already declared in `:root` block in styles.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vscode.Uri.joinPath` + `asWebviewUri` | built-in | Serve local images through webview | Already used for `posthog-logo-white.svg` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline CSS in styles.ts | External stylesheet | External stylesheets not allowed by CSP (`style-src 'nonce-…'`); must keep styles in the nonce-tagged `<style>` block |
| CSS variables for color | Hardcoded hex | Variables are already declared; hardcoded hex bypasses theme adaptability |
| `posthog-logo-white.svg` | `posthog.svg` or `codehog.svg` | White variant is correct for dark sidebar backgrounds; `posthog.svg` is monochrome dark |

**Installation:** No new packages needed for this phase.

## Architecture Patterns

### Recommended Project Structure
No structural changes — all changes happen within existing files:
```
src/views/webview/
├── layout.ts    ← modify #welcome-screen HTML
├── styles.ts    ← modify .welcome CSS block
└── script.ts    ← READ-ONLY for this phase (no changes needed)
```

### Pattern 1: Webview Template Literal Modification
**What:** Each file exports a single `getXxx(): string` function returning a template literal. Changes are ordinary string edits.
**When to use:** Any UI change — add HTML elements to `layout.ts`, add/update CSS rules to `styles.ts`.
**Example:**
```typescript
// layout.ts — current welcome screen (minimal)
<div id="welcome-screen" class="welcome" style="display:none;">
    <img src="${logoUri}" alt="PostHog" />
    <h2>Welcome to PostHog</h2>
    <p>Your PostHog command center.<br>Connect your account to get started.</p>
    <button class="sign-in-btn" id="btn-sign-in">Sign In with API Key</button>
</div>

// Pattern: enhance HTML structure, add CSS classes, keep existing IDs intact
// IDs (#welcome-screen, #btn-sign-in) are wired to script.ts — must not change
```

### Pattern 2: CSS Variable Usage for Theming
**What:** Use `var(--vscode-*)` for structural chrome, `var(--ph-*)` for brand accent, hardcoded `#fff` only where text overlays a guaranteed-dark background.
**When to use:** All color values in styles.ts.
**Example:**
```css
/* Source: existing styles.ts pattern */
.welcome .sign-in-btn {
    background: var(--ph-blue);  /* #1D4AFF — brand CTA */
    color: #fff;                  /* safe: overlays --ph-blue which is always dark */
    border: none;
    border-radius: 6px;
}
/* Foreground text uses theme variable so it adapts to light/dark */
.welcome p { color: var(--vscode-foreground); opacity: 0.6; }
```

### Pattern 3: CSS Transitions (safe in VS Code webview)
**What:** VS Code webviews run in Electron's Chromium-based renderer. CSS `transition` and `opacity`/`transform` animations are fully supported.
**When to use:** Subtle hover states, button press feedback. Avoid layout-affecting animations (width/height transitions cause reflow jank in the narrow sidebar).
**Confidence:** HIGH — existing code already uses `transition: opacity 0.15s` and `transition: background 0.1s` throughout styles.ts.

### Pattern 4: Search Filter — Existing Implementation
**What:** `filterItems()` queries `document.getElementById(currentTab + '-list')` then selects children by `.insight-card` (analytics) or `.item` (flags/experiments). Visibility is toggled via `item.style.display`.
**When to use:** No modification needed. The implementation is correct for all three tabs.
**Critical detail:** The empty-state divs (`#flags-empty`, `#experiments-empty`, `#analytics-empty`) are only hidden/shown by `renderSection()` during initial load — they do NOT dynamically respond to search filtering. When a search yields zero results, all `.item` elements are `display:none` but the empty-state remains hidden. This is a known minor gap but is NOT a bug by the locked decisions (search behavior spec says filter items, not manage empty state).

### Pattern 5: Tab Order Verification
**What:** Current layout has tabs in order: Analytics → Flags → Experiments. SIDE-03 requirement specifies: "Flags, Experiments, Analytics". These differ.
**Action:** Confirm with requirement text — SIDE-03 says "Sidebar tabs: Flags, Experiments, Analytics (saved insights)". The current order has Analytics first. This needs resolution during planning: either reorder the tabs in layout.ts or confirm Analytics-first is acceptable.
**Note:** The `switchTab()` function and `loadedTabs` lazy-loading logic are tab-name-agnostic — reordering tabs in the HTML has no logic impact.

### Anti-Patterns to Avoid
- **Changing `#welcome-screen` or `#btn-sign-in` IDs:** These are hardwired in `script.ts` `authState` handler. Rename = broken auth display.
- **Adding `<style>` tags inside layout.ts:** The CSP allows only one nonce-tagged style block (in `getWebviewHtml.ts`). Inline style blocks without nonce are blocked.
- **Loading external fonts (Google Fonts, etc.):** CSP `default-src 'none'` blocks external resources. Use `var(--vscode-font-family)`.
- **Adding new message types to script.ts:** This phase is visual only. Any new `send()` calls require matching handler in `SidebarProvider.ts` — out of scope.
- **Using `@keyframes` for entry animations:** Works technically, but VS Code UX guidelines discourage attention-grabbing animations in sidebar views. Stick to `transition` on hover/active states.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Brand-consistent colors | Custom color picker / new palette | Existing `--ph-*` CSS variables in `:root` | Already defined, consistent with CLAUDE.md spec |
| Themed backgrounds | Custom dark/light detection JS | `var(--vscode-sideBar-background)`, `var(--vscode-input-background)` | VS Code injects these automatically for active theme |
| SVG icon rendering | Embed raw SVG in template | `<img src="${logoUri}">` already works | Logo URI is already resolved and CSP-approved |
| Search debounce | Custom debounce wrapper | `filterItems()` is called on `input` event — this is fine for filter (no API call, DOM-only) | No debounce needed for pure DOM filtering |

**Key insight:** This phase is entirely within three template-literal files. There is no new infrastructure to build. The risk is in over-engineering — adding complexity to what is essentially a string-editing task.

## Common Pitfalls

### Pitfall 1: Breaking the authState Display Toggle
**What goes wrong:** Changing `#welcome-screen` or `#main-app` IDs causes the sidebar to show a blank screen after sign-in.
**Why it happens:** `script.ts` line ~901 directly accesses these IDs: `document.getElementById('welcome-screen').style.display`.
**How to avoid:** Only modify content *inside* the `#welcome-screen` div, never the ID or its direct `display:none` style attribute (which is the initial hidden state).
**Warning signs:** After modifying layout.ts, open Extension Development Host (F5) and verify sign-in shows the main app, sign-out shows the welcome screen.

### Pitfall 2: CSP Violation for External Resources
**What goes wrong:** Adding `<link rel="stylesheet" href="...">` or `background-image: url('https://...')` silently fails — no visual error, just missing styles.
**Why it happens:** CSP is `default-src 'none'`; only nonce-scoped inline styles and scripts are allowed. External origins are blocked.
**How to avoid:** All styles in `styles.ts` (the nonce-tagged block). All images must be served via `asWebviewUri`.
**Warning signs:** Open DevTools in Extension Development Host (Help > Toggle Developer Tools), check Console for CSP violation messages.

### Pitfall 3: Tab Order Mismatch with SIDE-03
**What goes wrong:** Planner implements SIDE-03 without noticing current tab order (Analytics, Flags, Experiments) differs from requirement wording (Flags, Experiments, Analytics).
**Why it happens:** REQUIREMENTS.md says "Sidebar tabs: Flags, Experiments, Analytics" but the existing default is Analytics-first.
**How to avoid:** During planning, explicitly decide whether to reorder tabs or accept Analytics-first as the canonical default (which may be better UX since it loads on startup).
**Warning signs:** If tabs are reordered, verify `switchTab('analytics')` is still called on initial auth — it is hardcoded in `sendAuthState()` → `loadInsights()` flow.

### Pitfall 4: Search Not Showing "No Results" State
**What goes wrong:** User types a search term that matches nothing — all items are hidden but the empty-state div stays hidden (it was hidden by `renderSection()` once data loaded). The section appears completely blank with no feedback.
**Why it happens:** `filterItems()` only toggles `item.style.display`; it does not show/hide the empty-state element.
**How to avoid:** The locked decisions do not require fixing this gap. However, the planner may choose to enhance `filterItems()` to show a "no results" message. If so, this requires a change to `script.ts` — a single condition after the `forEach`.
**Warning signs:** Type a nonsense string in search. If the section goes blank with no "no results" message, this is the pitfall.

### Pitfall 5: Active Tab Color Decision
**What goes wrong:** Current CSS uses `border-bottom-color: var(--ph-yellow)` for active tab, but CONTEXT.md says "Active tab highlighted with PostHog blue border-bottom (current implementation)". There is a mismatch.
**Why it happens:** The CONTEXT.md description says "PostHog blue" but the actual code in `styles.ts` line 92 uses `var(--ph-yellow)`. One of these is wrong.
**How to avoid:** Check `styles.ts` line 92 and decide. The locked decision says "blue". The implementation says "yellow". Plan should explicitly update `.nav-tab.active { border-bottom-color: var(--ph-blue); }` to match the locked decision.
**Warning signs:** Visual inspection during testing — yellow border vs. blue border.

## Code Examples

Verified patterns from official sources (all from actual project files):

### Welcome Screen Structure (current — read before modifying)
```html
<!-- Source: src/views/webview/layout.ts -->
<div id="welcome-screen" class="welcome" style="display:none;">
    <img src="${logoUri}" alt="PostHog" />
    <h2>Welcome to PostHog</h2>
    <p>Your PostHog command center.<br>Connect your account to get started.</p>
    <button class="sign-in-btn" id="btn-sign-in">Sign In with API Key</button>
</div>
```

### Auth State Display Toggle (DO NOT BREAK)
```javascript
// Source: src/views/webview/script.ts ~line 900
case 'authState':
    document.getElementById('welcome-screen').style.display = msg.authenticated ? 'none' : '';
    document.getElementById('main-app').style.display = msg.authenticated ? '' : 'none';
```

### filterItems() — Current Implementation
```javascript
// Source: src/views/webview/script.ts
function filterItems() {
    const q = document.getElementById('search').value.toLowerCase();
    const list = document.getElementById(currentTab + '-list');
    const selector = currentTab === 'analytics' ? '.insight-card' : '.item';
    list.querySelectorAll(selector).forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(q) ? '' : 'none';
    });
}
```

### Active Tab CSS (discrepancy to resolve)
```css
/* Source: src/views/webview/styles.ts line 90-93 */
/* Current: yellow — locked decision says blue */
.nav-tab.active {
    opacity: 1;
    border-bottom-color: var(--ph-yellow);  /* CHANGE to var(--ph-blue) per decision */
}
```

### CSP Context (constraint reference)
```html
<!-- Source: src/views/getWebviewHtml.ts -->
<!-- img-src: webview local resources only -->
<!-- style-src: nonce-tagged inline only — NO external stylesheets -->
<!-- script-src: nonce-tagged inline only — NO external scripts -->
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource};
               style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Webview UI Toolkit (Microsoft) | Plain HTML/CSS/JS template literals | Toolkit deprecated Jan 2025 | Project already uses plain approach — correct |
| Separate CSS files | Inline nonce-tagged styles | Extension model | CSP requires nonce; no external stylesheet |

**Deprecated/outdated:**
- `@vscode/webview-ui-toolkit`: Deprecated January 1, 2025. Project correctly does not use it.

## Open Questions

1. **Tab order: Analytics-first vs. Flags-first**
   - What we know: REQUIREMENTS.md SIDE-03 says "Flags, Experiments, Analytics"; existing code has Analytics first and loads it on startup
   - What's unclear: Is Analytics-first actually the intended default (better UX, since it starts loading), or does SIDE-03 literally require Flags as the first/default tab?
   - Recommendation: Plan should decide explicitly. Analytics-first is better UX (it auto-loads on startup). If the tab order in the nav bar must match "Flags, Experiments, Analytics" visually but Analytics remains the default, the HTML order can be changed without changing the startup behavior.

2. **"No results" state during search**
   - What we know: `filterItems()` hides items but does not show an empty-state message
   - What's unclear: Is the blank-on-no-results acceptable per the locked decisions?
   - Recommendation: Locked decisions say "search matches against item name/key text content" — they do not require a no-results state. Leave as-is unless planner decides it is a usability gap worth closing (small `script.ts` change).

3. **Welcome screen copy**
   - What we know: "Exact copy/wording" is Claude's Discretion
   - What's unclear: Whether to preserve "Your PostHog command center" or replace with feature-list copy
   - Recommendation: Replace with a feature bullet list (flags, experiments, analytics) — this is more informative than a tagline for a tool users are evaluating. Keep headline short.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Mocha via `@vscode/test-cli` + `@vscode/test-electron` |
| Config file | `.vscode-test.mjs` (conventional location) or detected from `package.json` `"test": "vscode-test"` |
| Quick run command | `pnpm compile-tests && pnpm test` (requires Extension Development Host — not headless) |
| Full suite command | same |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Welcome screen renders with logo, CTA button, and description | manual-only | Visual inspection in Extension Development Host (F5) | N/A — webview rendering not unit-testable without DOM |
| SIDE-01 | Flags search filters by name | manual-only | Type in search box on Flags tab; verify `.item` visibility toggling | N/A |
| SIDE-02 | Experiments search filters by name | manual-only | Type in search box on Experiments tab; verify `.item` visibility toggling | N/A |
| SIDE-03 | Three tabs present and functional | manual-only | Click each tab; verify section shows and lazy-load fires | N/A |

**Manual-only justification:** All four requirements in this phase are webview UI behaviors. VS Code webview content cannot be unit tested with Mocha/Node — it requires a live VS Code renderer (Electron). The test framework (`vscode-test`) launches a full Extension Development Host which is appropriate for integration smoke testing but is not automated CI-friendly for visual regression. No automated test additions are required or practical for this phase.

### Sampling Rate
- **Per task commit:** Manual smoke in Extension Development Host (F5 → open sidebar)
- **Per wave merge:** Same
- **Phase gate:** Visual inspection of all four requirements before `/gsd:verify-work`

### Wave 0 Gaps
None — no new test files needed. Existing `src/test/extension.test.ts` is a placeholder stub and is not relevant to this phase.

## Sources

### Primary (HIGH confidence)
- Direct file read: `src/views/webview/layout.ts` — complete welcome screen and tab HTML
- Direct file read: `src/views/webview/styles.ts` — complete CSS including `.welcome`, `.nav-tab`, `.search-bar`
- Direct file read: `src/views/webview/script.ts` (lines 1–250) — `filterItems()`, `switchTab()`, `authState` handler
- Direct file read: `src/views/getWebviewHtml.ts` — CSP configuration and nonce pattern
- Direct file read: `src/views/SidebarProvider.ts` — message routing, `sendAuthState()`, data loaders
- Direct file read: `CLAUDE.md` — brand colors, design principles, architecture

### Secondary (MEDIUM confidence)
- VS Code official docs (WebFetch): webview UX guidelines — theming, accessibility, CSS support
- WebSearch: confirmed Webview UI Toolkit deprecated Jan 2025 (official GitHub)

### Tertiary (LOW confidence)
- WebSearch: VS Code webview CSS animation support — no specific documented limitations found; Electron/Chromium supports standard CSS transitions/animations (inferred from existing codebase usage)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all files read directly from codebase
- Architecture: HIGH — all patterns derived from reading actual source files
- Pitfalls: HIGH — identified from direct code inspection (especially the yellow vs. blue tab discrepancy, CSP constraint, and auth ID binding)
- Test mapping: HIGH — framework confirmed in package.json; manual-only classification is accurate for webview UI

**Research date:** 2026-03-30
**Valid until:** Stable — this phase has no external dependencies. Valid until codebase changes.
