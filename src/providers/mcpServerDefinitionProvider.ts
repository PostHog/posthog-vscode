import * as vscode from 'vscode';

/** Must match the id in package.json `contributes.mcpServerDefinitionProviders`. */
export const MCP_PROVIDER_ID = 'posthog.mcp';
export const MCP_SERVER_LABEL = 'PostHog';
export const MCP_SERVER_URL = 'https://mcp.posthog.com/mcp';
export const MCP_DEV_SERVER_URL = 'http://localhost:6767/mcp';

/**
 * Contributes the PostHog remote MCP server to VS Code's MCP integration,
 * so installing the extension makes PostHog tools available in chat without
 * any manual mcp.json setup.
 *
 * Authentication is deliberately NOT shared with the extension's session:
 * the extension's OAuth token carries a much narrower scope set than the
 * MCP server's tools need. The definition is provided without credentials
 * and VS Code's MCP client runs the server's own OAuth flow (mcp.posthog.com
 * implements the MCP authorization spec), requesting exactly the scopes the
 * server asks for.
 */
export class PostHogMcpServerDefinitionProvider implements vscode.McpServerDefinitionProvider<vscode.McpHttpServerDefinition> {
    constructor(private readonly extensionMode: vscode.ExtensionMode = vscode.ExtensionMode.Production) {}

    provideMcpServerDefinitions(): vscode.McpHttpServerDefinition[] {
        const url = this.extensionMode === vscode.ExtensionMode.Development ? MCP_DEV_SERVER_URL : MCP_SERVER_URL;
        return [new vscode.McpHttpServerDefinition(MCP_SERVER_LABEL, vscode.Uri.parse(url))];
    }
}
