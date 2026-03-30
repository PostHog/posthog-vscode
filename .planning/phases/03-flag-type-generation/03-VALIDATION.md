---
phase: 3
slug: flag-type-generation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-30
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compiler (tsc) + webpack + Mocha (@vscode/test-cli) |
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

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 03-01-T1 | 01 | 1 | CGEN-01 | compile+grep | `pnpm compile` | pending |
| 03-01-T2 | 01 | 1 | CGEN-02, CGEN-03 | compile+grep | `pnpm compile` | pending |

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. `pnpm compile` validates TypeScript correctness. Unit tests for `codegenService.ts` can use existing Mocha setup.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Command appears in Command Palette | CGEN-01 | Requires Extension Development Host | Open Command Palette, search "Generate Flag Types" |
| Generated .d.ts is valid TypeScript | CGEN-02 | Requires running with real flag data | Run command with authenticated session, verify output compiles |
| Generated types match flag payloads | CGEN-03 | Requires live PostHog data | Compare generated types against PostHog UI payload shapes |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
