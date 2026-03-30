---
phase: 4
slug: oauth-authentication
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-30
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compiler (tsc) + webpack + Mocha |
| **Config file** | `tsconfig.json`, `webpack.config.js` |
| **Quick run command** | `pnpm compile` |
| **Full suite command** | `pnpm compile && pnpm test && pnpm lint` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm compile`
- **After every plan wave:** Run `pnpm compile && pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. `pnpm compile` validates TypeScript correctness. Unit tests for PKCE helper functions can use existing Mocha setup.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OAuth sign-in flow completes | AUTH-02 | Requires live PostHog OAuth + browser | Click "Sign In with PostHog", complete browser flow, verify redirect |
| Tokens survive restart | AUTH-03 | Requires Extension Host restart | Sign in, restart Extension Host, verify still authenticated |
| API key fallback works | AUTH-05 | Requires Extension Host | Sign out of OAuth, sign in with API key, verify works |
| Auth method switching | AUTH-06 | Requires Extension Host | Switch between OAuth and API key, verify both work |
| State parameter rejection | AUTH-04 | Security testing | Replay an old callback URI, verify it's rejected |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
