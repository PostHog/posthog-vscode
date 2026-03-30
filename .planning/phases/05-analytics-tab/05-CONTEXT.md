# Phase 5: Analytics Tab - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Polish the Analytics sidebar tab with loading skeleton states and improved chart visualizations. The analytics tab already renders insight cards with SVG sparklines, funnels, retention grids, and lifecycle charts. This phase adds skeleton loading placeholders and enhances chart rendering.

</domain>

<decisions>
## Implementation Decisions

### Loading skeletons
- Replace "Loading insights..." text with animated skeleton placeholder cards
- Show 3 skeleton cards that match the insight-card dimensions
- Use CSS animation (shimmer effect) — no JS needed for the animation
- Skeleton disappears when real data renders

### Chart rendering approach
- Keep existing SVG-based sparklines for trends (already working well, no CDN dependency)
- Enhance with Chart.js bundled locally (not CDN — CSP blocks external scripts)
- If bundling Chart.js is too complex for the webview CSP, enhance existing SVG renderers instead
- Charts must work in both light and dark VS Code themes

### Claude's Discretion
- Whether to bundle Chart.js or enhance SVG renderers
- Exact skeleton card dimensions and animation timing
- Chart color schemes for dark/light themes
- Whether to add loading states per-card on refresh

</decisions>
