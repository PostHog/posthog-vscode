---
"posthog-vscode": patch
---

fix: prevent extension-host freeze on large/minified files and large workspaces

Tree-sitter parsing runs synchronously on the extension-host thread, and ~8 providers re-parse the active document on every edit. Opening a large or minified file, or auto-scanning a large monorepo for stale flags, could block the host hard enough to require a restart. The parser now skips documents above byte/line/line-length thresholds, and the stale-flag scan is bounded by a concurrency limit and a file-count cap.
