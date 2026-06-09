import * as assert from 'assert';
import * as vscode from 'vscode';
import {
    PostHogMcpServerDefinitionProvider,
    MCP_SERVER_LABEL,
    MCP_SERVER_URL,
    MCP_PROVIDER_ID,
} from '../../providers/mcpServerDefinitionProvider';

suite('PostHogMcpServerDefinitionProvider', () => {
    test('provider id matches the package.json contribution', () => {
        const pkg = vscode.extensions.getExtension('PostHog.posthog-vscode')?.packageJSON as
            | { contributes?: { mcpServerDefinitionProviders?: Array<{ id: string }> } }
            | undefined;
        // Only verifiable when running inside the packaged extension host
        if (pkg?.contributes?.mcpServerDefinitionProviders) {
            assert.ok(
                pkg.contributes.mcpServerDefinitionProviders.some(p => p.id === MCP_PROVIDER_ID),
                `package.json must declare an mcpServerDefinitionProviders entry with id '${MCP_PROVIDER_ID}', ` +
                'otherwise registerMcpServerDefinitionProvider throws at activation'
            );
        }
    });

    test('provides the PostHog MCP server definition', () => {
        const defs = new PostHogMcpServerDefinitionProvider().provideMcpServerDefinitions();
        assert.strictEqual(defs.length, 1);
        assert.strictEqual(defs[0].label, MCP_SERVER_LABEL);
        assert.strictEqual(defs[0].uri.toString(), MCP_SERVER_URL);
    });

    test('server URL points at the official PostHog MCP host', () => {
        const hostname = new URL(MCP_SERVER_URL).hostname;
        assert.strictEqual(hostname, 'mcp.posthog.com');
    });

    test('definition carries no extension credentials', () => {
        // The extension's OAuth token has narrower scopes than the MCP tools
        // need — auth must be left to the MCP server's own OAuth flow.
        const [def] = new PostHogMcpServerDefinitionProvider().provideMcpServerDefinitions();
        assert.deepStrictEqual(def.headers, {});
    });
});
