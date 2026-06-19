---
"posthog-vscode": patch
---

fix: bound the stale-flag scan so large workspaces no longer freeze the editor

The codebase-wide stale-flag scan ran an unbounded `Promise.all` over every matched file and auto-fired on every activation, which could saturate the extension-host thread and hard-freeze VS Code on large repos. The scan now uses a fixed-concurrency worker pool, caps the number of files it enumerates (configurable via the new `posthog.staleFlagMaxFiles` setting, default 5000), excludes more vendored/generated/minified trees, and only runs when explicitly triggered from the Stale Flags view instead of eagerly on startup.
