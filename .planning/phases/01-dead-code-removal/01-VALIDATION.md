---
phase: 1
slug: dead-code-removal
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 1 — Validation Strategy

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
| 01-01 | 01 | 1 | CLEAN-02 | compile | `pnpm compile` | N/A | pending |
| 01-02 | 02 | 1 | CLEAN-01 | compile | `pnpm compile` | N/A | pending |
| 01-03 | 03 | 1 | CLEAN-03 | compile | `pnpm compile` | N/A | pending |
| 01-04 | 04 | 1 | CLEAN-04 | compile | `pnpm compile` | N/A | pending |
| 01-05 | 05 | 1 | CLEAN-05 | compile+audit | `pnpm compile && pnpm package` | N/A | pending |

*Status: pending*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. `pnpm compile` validates TypeScript correctness after each removal.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No ghost commands in Command Palette | CLEAN-05 | Requires Extension Development Host | Open Command Palette, search "PostHog", verify no HogQL/capture/error commands |
| No error tab in sidebar | CLEAN-01 | Requires Extension Development Host | Open PostHog sidebar, verify no error tracking UI |
| Bundle size reduced | CLEAN-04 | Requires .vsix build comparison | Run `pnpm package`, compare .vsix size before/after |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
