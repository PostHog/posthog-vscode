---
phase: 04-oauth-authentication
plan: "02"
subsystem: auth
tags: [oauth, pkce, crypto, uri-handler, commands, sidebar]
dependency_graph:
  requires: ["04-01"]
  provides: ["oauth-pkce-flow", "sign-in-oauth-command", "uri-handler", "updated-sign-out"]
  affects: ["src/services/authService.ts", "src/commands/authCommands.ts", "src/extension.ts", "src/views/SidebarProvider.ts", "package.json"]
tech_stack:
  added: []
  patterns: ["PKCE RFC 9700", "in-flight promise pattern", "vscode UriHandler", "withProgress notification"]
key_files:
  created: []
  modified:
    - src/services/authService.ts
    - src/commands/authCommands.ts
    - src/extension.ts
    - src/views/SidebarProvider.ts
    - package.json
decisions:
  - "SIGN_IN_OAUTH gated on OAuthConfig.CLIENT_ID being non-empty — gracefully degrades to API key suggestion when not yet configured"
  - "UriHandler registered as first item in context.subscriptions.push() to ensure early availability"
  - "signOut now clears ALL storage unconditionally (API key + OAuth tokens + auth method + token expiry) regardless of auth method in use"
  - "State mismatch and user cancellation rejected silently without error UI (CSRF protection + UX)"
  - "_pendingVerifier intentionally not cleared in handleOAuthCallback — needed downstream by exchangeCodeForTokens"
metrics:
  duration_seconds: 336
  completed_date: "2026-03-30"
  tasks_completed: 2
  files_modified: 5
---

# Phase 04 Plan 02: OAuth PKCE Flow Implementation Summary

**One-liner:** Complete OAuth PKCE flow with PKCE generation, UriHandler, authorization URL, token exchange, and updated sign-out clearing all auth storage.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Add PKCE helpers, in-flight promise, and UriHandler to AuthService + extension.ts | 7e82226 (prior) | Done |
| 2 | Implement SIGN_IN_OAUTH command, update sign-out, and wire SidebarProvider | e7cd033 | Done |

## What Was Built

### AuthService additions (src/services/authService.ts)
- `generatePkce()` — `crypto.randomBytes(32).toString('base64url')` verifier + SHA-256 base64url challenge
- `generateState()` — `crypto.randomBytes(16).toString('hex')` for CSRF protection
- `waitForOAuthCode(state, verifier)` — in-flight promise pattern with 5-minute timeout, supersedes prior attempts
- `handleOAuthCallback(code, state)` — validates state against `_pendingState`, rejects mismatches silently (CSRF guard)
- `exchangeCodeForTokens(code, redirectUri)` — POST to `/oauth/token` with PKCE verifier, stores tokens, sets auth method
- `getPendingVerifier()` / `clearPendingVerifier()` — accessor for post-callback token exchange

### UriHandler in extension.ts
- Registered as first subscription in `context.subscriptions.push()`
- Parses `code` and `state` from query params, delegates to `authService.handleOAuthCallback()`

### SIGN_IN_OAUTH command (src/commands/authCommands.ts)
- Full OAuth PKCE flow: host selection → PKCE generation → callback URI via `vscode.env.asExternalUri()` → authorization URL construction → browser launch → progress notification with cancel → token exchange → project selection
- Gated on `OAuthConfig.CLIENT_ID` being non-empty; shows friendly error with "Sign In with API Key" fallback when not configured
- Cancellation and state-mismatch errors handled silently

### Updated signOut
- Clears ALL auth storage unconditionally: `deleteApiKey()` + `clearOAuthTokens()` + `clearProjectId()`
- Previously only cleared API key; now also wipes OAuth tokens and auth method

### signIn update
- Calls `setAuthMethod('api_key')` immediately after storing API key, making auth method explicit from the start

### SidebarProvider wiring (src/views/SidebarProvider.ts)
- New `case 'signInOAuth'` in `handleMessage()` routes to `Commands.SIGN_IN_OAUTH`

### package.json
- `posthog.signInOAuth` command contributed with title "PostHog: Sign In with PostHog"

## Deviations from Plan

None - plan executed exactly as written.

Note: Task 1 changes were already committed in a prior execution run (commit 7e82226 labeled feat(04-03)) before this execution session began. Task 2 was newly executed and committed as e7cd033.

## Self-Check

- [x] `src/services/authService.ts` — exists and contains generatePkce, waitForOAuthCode, handleOAuthCallback, exchangeCodeForTokens
- [x] `src/commands/authCommands.ts` — exists and contains SIGN_IN_OAUTH command handler, updated signOut
- [x] `src/extension.ts` — exists and contains registerUriHandler as first subscription
- [x] `src/views/SidebarProvider.ts` — exists and contains signInOAuth message case
- [x] `package.json` — contains posthog.signInOAuth command contribution
- [x] `pnpm compile` — succeeds with zero errors
- [x] Commit e7cd033 — exists (Task 2)
