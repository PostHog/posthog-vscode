import * as vscode from 'vscode';
import { StaleFlagService, StaleFlag, StaleFlagReference, StalenessReason } from '../services/staleFlagService';

type TreeItem = StaleFlagGroupItem | StaleFlagItem | StaleFlagRefItem;

const REASON_LABELS: Record<StalenessReason, { label: string; icon: string; description: string }> = {
    not_in_posthog: { label: 'Not in PostHog', icon: 'warning', description: 'Flag key not found in your PostHog project' },
    inactive: { label: 'Inactive', icon: 'circle-slash', description: 'Flag is turned off' },
    experiment_complete: { label: 'Experiment Complete', icon: 'beaker', description: 'Linked experiment has ended' },
    fully_rolled_out: { label: 'Fully Rolled Out', icon: 'check-all', description: 'Flag is at 100% with no conditions' },
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
        this.tooltip = info.description;
    }
}

class StaleFlagItem extends vscode.TreeItem {
    constructor(public readonly staleFlag: StaleFlag) {
        super(staleFlag.key, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon('symbol-key');
        this.description = `${staleFlag.references.length} ref${staleFlag.references.length === 1 ? '' : 's'}`;
        this.contextValue = 'staleFlag';
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

    constructor(private readonly service: StaleFlagService) {
        service.onDidChange(() => this._onDidChangeTreeData.fire(undefined));
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
