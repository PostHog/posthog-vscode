import * as vscode from 'vscode';
import { AuthService } from '../services/authService';
import { FlagCacheService } from '../services/flagCacheService';
import { EventCacheService } from '../services/eventCacheService';
import { ExperimentCacheService } from '../services/experimentCacheService';

interface DebugEntry {
    label: string;
    value: string;
    copyable?: boolean;
}

export class DebugTreeProvider implements vscode.TreeDataProvider<DebugEntry> {
    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChange.event;

    constructor(
        private readonly authService: AuthService,
        private readonly flagCache: FlagCacheService,
        private readonly eventCache: EventCacheService,
        private readonly experimentCache: ExperimentCacheService,
        private readonly extensionMode: vscode.ExtensionMode,
    ) {}

    refresh(): void {
        this._onDidChange.fire();
    }

    getTreeItem(entry: DebugEntry): vscode.TreeItem {
        const item = new vscode.TreeItem(`${entry.label}: ${entry.value}`, vscode.TreeItemCollapsibleState.None);
        item.tooltip = `${entry.label}: ${entry.value}`;
        if (entry.copyable) {
            item.contextValue = 'copyable';
            item.command = {
                command: 'posthog.debugCopy',
                title: 'Copy',
                arguments: [entry.value],
            };
        }
        return item;
    }

    getChildren(): DebugEntry[] {
        const entries: DebugEntry[] = [];
        const authed = this.authService.isAuthenticated();

        // Extension
        const ext = vscode.extensions.getExtension('PostHog.posthog-vscode');
        const version = ext?.packageJSON?.version ?? 'unknown';
        const modeLabel = this.extensionMode === vscode.ExtensionMode.Development ? 'Development'
            : this.extensionMode === vscode.ExtensionMode.Test ? 'Test' : 'Production';
        entries.push({ label: 'Extension Version', value: version });
        entries.push({ label: 'Extension Mode', value: modeLabel });
        entries.push({ label: 'VS Code Version', value: vscode.version });
        entries.push({ label: 'Platform', value: process.platform });
        entries.push({ label: 'Machine ID', value: vscode.env.machineId.slice(0, 8) + '...', copyable: true });
        entries.push({ label: 'Telemetry Enabled', value: String(vscode.env.isTelemetryEnabled) });

        // Auth
        entries.push({ label: '─── Auth', value: '───' });
        entries.push({ label: 'Authenticated', value: String(authed) });
        entries.push({ label: 'Host', value: this.authService.getHost(), copyable: true });
        entries.push({ label: 'Project ID', value: String(this.authService.getProjectId() ?? 'none'), copyable: true });
        entries.push({ label: 'Project Name', value: this.authService.getProjectName() ?? 'none' });
        entries.push({ label: 'Can Write', value: String(this.authService.getCanWrite()) });

        // Caches
        entries.push({ label: '─── Caches', value: '───' });
        entries.push({ label: 'Flags', value: `${this.flagCache.getFlags().filter(f => !f.deleted).length} loaded` });
        entries.push({ label: 'Flag Keys', value: `${this.flagCache.getFlagKeys().length} active` });
        entries.push({ label: 'Flags Last Refresh', value: this.flagCache.lastRefreshed?.toLocaleTimeString() ?? 'never' });
        entries.push({ label: 'Events', value: `${this.eventCache.getEvents().length} loaded` });
        entries.push({ label: 'Events Last Refresh', value: this.eventCache.lastRefreshed?.toLocaleTimeString() ?? 'never' });
        entries.push({ label: 'Experiments', value: `${this.experimentCache.getExperiments().length} loaded` });
        entries.push({ label: 'Experiments Last Refresh', value: this.experimentCache.lastRefreshed?.toLocaleTimeString() ?? 'never' });

        // Flag values
        const allFlags = this.flagCache.getFlags().filter(f => !f.deleted);
        if (allFlags.length > 0) {
            entries.push({ label: '─── Flags', value: '───' });
            for (const flag of allFlags) {
                entries.push({ label: flag.key, value: flag.active ? 'ACTIVE' : 'inactive', copyable: true });
            }
        }

        // Config
        const config = vscode.workspace.getConfiguration('posthog');
        entries.push({ label: '─── Settings', value: '───' });
        entries.push({ label: 'Additional Clients', value: JSON.stringify(config.get('additionalClientNames', [])) });
        entries.push({ label: 'Additional Flag Fns', value: JSON.stringify(config.get('additionalFlagFunctions', [])) });
        entries.push({ label: 'Nested Clients', value: String(config.get('detectNestedClients', true)) });
        entries.push({ label: 'Inline Decorations', value: String(config.get('showInlineDecorations', true)) });
        entries.push({ label: 'Stale Flag Age (days)', value: String(config.get('staleFlagAgeDays', 30)) });

        return entries;
    }
}
