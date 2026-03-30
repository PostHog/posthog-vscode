---
phase: 2
slug: auth-landing-and-sidebar-ux
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-30
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compiler (tsc) + webpack |
| **Config file** | `tsconfig.json`, `webpack.config.js` |
| **Quick run command** | `pnpm compile` |
| **Full suite command** | `pnpm compile && pnpm lint` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm compile`
- **After every plan wave:** Run `pnpm compile && pnpm lint`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-T1 | 01 | 1 | AUTH-01 | compile+grep | `pnpm compile` | N/A | pending |
| 02-02-T1 | 02 | 1 | SIDE-01, SIDE-02, SIDE-03 | compile+grep | `pnpm compile` | N/A | pending |

*Status: pending*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. `pnpm compile` validates TypeScript correctness. Visual changes verified manually in Extension Development Host.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Landing page looks polished and branded | AUTH-01 | Visual/design quality | Open sidebar unauthenticated, verify PostHog branding, logo, CTA button |
| Search filters flags in real time | SIDE-01 | Webview interaction | Sign in, load 50+ flags, type in search, verify list filters |
| Search filters experiments in real time | SIDE-02 | Webview interaction | Switch to experiments tab, type in search, verify list filters |
| Three tabs visible and switchable | SIDE-03 | Webview interaction | Verify Analytics/Flags/Experiments tabs exist and switch correctly |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
