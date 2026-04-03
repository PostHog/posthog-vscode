import * as vscode from 'vscode';
import { StaleFlagService, StaleFlag, StaleFlagReference, StalenessReason } from '../services/staleFlagService';
import { Commands } from '../constants';

type TreeItem = StaleFlagGroupItem | StaleFlagItem | StaleFlagRefItem;

const REASON_LABELS: Record<StalenessReason, { label: string; icon: string; description: string; billingTip: string }> = {
    not_in_posthog: { label: 'Not in PostHog', icon: 'warning', description: 'Flag key not found in your PostHog project', billingTip: 'These calls still count as feature flag requests on your bill, but always return undefined.' },
    inactive: { label: 'Inactive', icon: 'circle-slash', description: 'Flag is turned off', billingTip: 'Disabled flags are still evaluated on every call and count toward your billing.' },
    experiment_complete: { label: 'Experiment Complete', icon: 'beaker', description: 'Linked experiment has ended', billingTip: 'The experiment is over — these flag calls are now unnecessary billing overhead.' },
    fully_rolled_out: { label: 'Fully Rolled Out', icon: 'check-all', description: 'Flag is at 100% with no conditions', billingTip: 'This flag always returns true — remove the check to save on flag evaluation costs.' },
};

class StaleFlagGroupItem extends vscode.TreeItem {
    constructor(
        public readonly reason: StalenessReason,
        public readonly flags: StaleFlag[],
    ) {
        const info = REASON_LABELS[reason];
        super(info.label, vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon(info.icon);
        this.description = `${flags.length}`;
        const md = new vscode.MarkdownString(`**${info.label}** — ${info.description}\n\n$(dollar) ${info.billingTip}`);
        md.supportThemeIcons = true;
        this.tooltip = md;
    }
}

class StaleFlagItem extends vscode.TreeItem {
    constructor(public readonly staleFlag: StaleFlag) {
        super(staleFlag.key, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon('symbol-key');
        this.description = `${staleFlag.references.length} ref${staleFlag.references.length === 1 ? '' : 's'}`;
        // Use different contextValue so "Open in PostHog" only shows for flags that exist there
        this.contextValue = staleFlag.flag ? 'staleFlagWithId' : 'staleFlag';
        const md = new vscode.MarkdownString(this.buildTooltip());
        md.supportThemeIcons = true;
        this.tooltip = md;
    }

    private buildTooltip(): string {
        const info = REASON_LABELS[this.staleFlag.reason];
        const lines: string[] = [`**${this.staleFlag.key}**`];
        lines.push(`$(${info.icon}) ${info.description}`);
        if (this.staleFlag.flag) {
            lines.push(`Created: ${new Date(this.staleFlag.flag.created_at).toLocaleDateString()}`);
            if (this.staleFlag.flag.created_by?.first_name) {
                lines.push(`By: ${this.staleFlag.flag.created_by.first_name}`);
            }
        }
        const refs = this.staleFlag.references.length;
        lines.push(`${refs} reference${refs === 1 ? '' : 's'} in code — each one is a billed flag evaluation`);
        lines.push(`---\n$(dollar) ${info.billingTip}`);
        return lines.join('\n\n');
    }
}

class StaleFlagRefItem extends vscode.TreeItem {
    constructor(public readonly ref: StaleFlagReference) {
        const fileName = ref.uri.path.split('/').pop() || ref.uri.path;
        super(`${fileName}:${ref.line + 1}`, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('go-to-file');
        this.description = ref.lineText;
        this.tooltip = ref.uri.fsPath + ':' + (ref.line + 1);
        this.command = {
            command: 'vscode.open',
            title: 'Go to reference',
            arguments: [ref.uri, { selection: new vscode.Range(ref.line, ref.column, ref.line, ref.column) }],
        };
        this.contextValue = 'staleFlagRef';
    }
}

export class StaleFlagTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private view: vscode.TreeView<TreeItem> | undefined;

    constructor(private readonly service: StaleFlagService) {
        service.onDidChange(() => {
            this._onDidChangeTreeData.fire(undefined);
            this.updateBadge();
            const staleFlags = service.getStaleFlags();
            vscode.commands.executeCommand('setContext', 'posthog.hasStaleFlagResults', staleFlags.length > 0);
            vscode.commands.executeCommand('setContext', 'posthog.hasScannedForStaleFlags', true);
        });
    }

    /** Bind to the tree view so we can update the badge */
    setView(view: vscode.TreeView<TreeItem>): void {
        this.view = view;
    }

    private updateBadge(): void {
        if (!this.view) { return; }
        const count = this.service.getStaleFlags().length;
        this.view.badge = count > 0
            ? { value: count, tooltip: `${count} stale flag${count === 1 ? '' : 's'}` }
            : undefined;
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeItem): TreeItem[] {
        if (!element) {
            // Root: group by reason
            const stale = this.service.getStaleFlags();
            if (stale.length === 0) { return []; }

            const groups = new Map<StalenessReason, StaleFlag[]>();
            for (const f of stale) {
                const list = groups.get(f.reason) || [];
                list.push(f);
                groups.set(f.reason, list);
            }
            return Array.from(groups.entries()).map(([reason, flags]) => new StaleFlagGroupItem(reason, flags));
        }

        if (element instanceof StaleFlagGroupItem) {
            return element.flags.map(f => new StaleFlagItem(f));
        }

        if (element instanceof StaleFlagItem) {
            return element.staleFlag.references.map(r => new StaleFlagRefItem(r));
        }

        return [];
    }
}
