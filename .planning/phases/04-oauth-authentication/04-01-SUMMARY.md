---
phase: 04-oauth-authentication
plan: 01
subsystem: auth
tags: [oauth, pkce, secrets, token-refresh, vscode-secretstorage]

# Dependency graph
requires: []
provides:
  - OAuth storage keys in constants.ts (OAUTH_ACCESS_TOKEN, OAUTH_REFRESH_TOKEN, AUTH_METHOD, TOKEN_EXPIRY)
  - SIGN_IN_OAUTH command constant
  - OAuthConfig constant with CLIENT_ID placeholder, scopes, endpoint paths, timeout
  - AuthService.getApiKey() transparent — returns OAuth access token when auth method is 'oauth'
  - AuthService OAuth methods: setOAuthTokens, getOAuthAccessToken, getOAuthRefreshToken, getAuthMethod, setAuthMethod, getTokenExpiry, isTokenExpired, refreshOAuthToken, clearOAuthTokens
  - PostHogService.ensureFreshToken() — proactive token refresh before every API call
affects:
  - 04-02 (OAuth sign-in command and UriHandler — builds on AuthService OAuth contract)
  - 04-03 (OAuth webview UI — uses SIGN_IN_OAUTH command)
  - 04-04 (sign-out — uses clearOAuthTokens)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Transparent getApiKey() delegates to OAuth or API key based on authMethod state
    - Proactive token refresh in PostHogService.request() before each API call
    - Token expiry stored as ISO timestamp in globalState; access/refresh tokens in SecretStorage

key-files:
  created: []
  modified:
    - src/constants.ts
    - src/services/authService.ts
    - src/services/postHogService.ts

key-decisions:
  - "getApiKey() made transparent: auth callers need no changes when switching between api_key and oauth methods"
  - "Token refresh uses 60-second early buffer to avoid clock-skew failures on expiry edge"
  - "CLIENT_ID left as empty string placeholder until PostHog OAuth app registration is confirmed"
  - "ensureFreshToken() catches and logs refresh failures rather than throwing — request proceeds and fails with 401 naturally"

patterns-established:
  - "Pattern: transparent getApiKey() — checks authMethod first, returns appropriate token without caller changes"
  - "Pattern: proactive expiry check — ensureFreshToken() at top of request() rather than lazy 401 retry"

requirements-completed:
  - AUTH-03
  - AUTH-05

# Metrics
duration: 3min
completed: 2026-03-30
---

# Phase 04 Plan 01: OAuth Auth Foundation Summary

**OAuth token storage contract established: transparent getApiKey() and proactive token refresh wired into PostHogService without changing any caller code**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-30T17:21:30Z
- **Completed:** 2026-03-30T17:24:16Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Extended `constants.ts` with 4 new StorageKeys (OAUTH_ACCESS_TOKEN, OAUTH_REFRESH_TOKEN, AUTH_METHOD, TOKEN_EXPIRY), SIGN_IN_OAUTH command, and OAuthConfig constant
- Extended `authService.ts` with 9 new OAuth methods and a transparent `getApiKey()` that returns the correct token for either auth method
- Added `ensureFreshToken()` to `postHogService.ts` — called as first line of every `request()` to proactively refresh expiring OAuth tokens

## Task Commits

Each task was committed atomically:

1. **Task 1: Add OAuth constants and extend AuthService with token storage methods** - `287483a` (feat)
2. **Task 2: Add proactive token refresh to PostHogService** - `5e5cee0` (feat)

## Files Created/Modified
- `src/constants.ts` - Added SIGN_IN_OAUTH command, OAuth StorageKeys (4 new keys), OAuthConfig export
- `src/services/authService.ts` - Transparent getApiKey(), 9 new OAuth token/method/expiry methods
- `src/services/postHogService.ts` - ensureFreshToken() private method + call at top of request()

## Decisions Made
- `getApiKey()` made transparent — delegates to OAuth access token when `authMethod === 'oauth'`, otherwise falls back to personal API key. Zero changes needed to PostHogService or any other caller.
- Token expiry check uses 60-second early buffer to avoid race conditions near expiry edge.
- `CLIENT_ID` stored as empty string placeholder in `OAuthConfig` — filled in after PostHog OAuth app registration is confirmed.
- `ensureFreshToken()` swallows refresh failures with `console.warn` rather than throwing — the subsequent API request fails with 401 naturally, keeping the error handling flow simple.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Auth foundation contract is complete. Plans 04-02 through 04-04 can now build on top of this:
  - `AuthService.setOAuthTokens()` ready for the token exchange step (04-02)
  - `AuthService.clearOAuthTokens()` ready for the sign-out extension (04-04)
  - `SIGN_IN_OAUTH` command constant ready for registration in extension.ts and authCommands.ts
- Remaining blocker: PostHog OAuth app registration must be confirmed before the full flow can complete (CLIENT_ID is a placeholder).

---
*Phase: 04-oauth-authentication*
*Completed: 2026-03-30*
