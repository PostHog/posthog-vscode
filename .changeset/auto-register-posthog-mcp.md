---
"posthog-vscode": minor
---

Automatically register the PostHog MCP server (https://mcp.posthog.com/mcp) with VS Code's MCP integration. Installing or updating the extension now makes PostHog's MCP tools available in chat with no manual mcp.json setup. Authentication is handled by VS Code's MCP client through the server's own OAuth flow, so the MCP tools get the scopes they need independently of the extension's sign-in.
