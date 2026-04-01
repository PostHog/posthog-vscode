import * as vscode from 'vscode';
import { FlagCacheService } from '../services/flagCacheService';
import { ExperimentCacheService } from '../services/experimentCacheService';
import { TreeSitterService } from '../services/treeSitterService';
import { Commands } from '../constants';

const FLAG_METHODS = new Set([
    'getFeatureFlag', 'isFeatureEnabled', 'getFeatureFlagPayload',
    'getFeatureFlagResult', 'isFeatureFlagEnabled', 'getRemoteConfig',
    'get_feature_flag', 'is_feature_enabled', 'get_feature_flag_payload', 'get_remote_config',
    'GetFeatureFlag', 'IsFeatureEnabled', 'GetFeatureFlagPayload',
    'useFeatureFlag', 'useFeatureFlagPayload', 'useFeatureFlagVariantKey', 'useActiveFeatureFlags',
]);

export class StaleFlagCodeActionProvider implements vscode.CodeActionProvider {
    static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

    constructor(
        private readonly flagCache: FlagCacheService,
        private readonly experimentCache: ExperimentCacheService,
        private readonly treeSitter: TreeSitterService,
    ) {}

    async provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
    ): Promise<vscode.CodeAction[] | undefined> {
        if (!this.treeSitter.isSupported(document.languageId)) { return undefined; }

        const calls = await this.treeSitter.findPostHogCalls(document);
        const line = range.start.line;
        const actions: vscode.CodeAction[] = [];

        for (const call of calls) {
            if (call.line !== line) { continue; }
            if (!FLAG_METHODS.has(call.method)) { continue; }

            const flag = this.flagCache.getFlag(call.key);
            if (!flag) { continue; }

            const isInactive = !flag.active;
            const experiment = this.experimentCache.getByFlagKey(call.key);
            const isExperimentComplete = experiment?.end_date !== undefined && experiment?.end_date !== null;

            // Check fully rolled out
            let isFullyRolledOut = false;
            if (flag.active && !isExperimentComplete) {
                const filters = flag.filters as Record<string, unknown> | undefined;
                if (filters?.groups && Array.isArray(filters.groups)) {
                    const groups = filters.groups as Array<Record<string, unknown>>;
                    if (groups.length > 0) {
                        isFullyRolledOut = groups.every(g => {
                            const rollout = g.rollout_percentage;
                            const props = g.properties;
                            const hasConditions = Array.isArray(props) && props.length > 0;
                            return rollout === 100 && !hasConditions;
                        });
                    }
                } else if (flag.rollout_percentage === 100) {
                    isFullyRolledOut = true;
                }
            }

            if (!isInactive && !isExperimentComplete && !isFullyRolledOut) { continue; }

            const reason = isInactive ? 'inactive' : isExperimentComplete ? 'experiment complete' : 'fully rolled out';

            const ref = {
                key: call.key,
                uri: document.uri,
                line: call.line,
                column: call.keyStartCol,
                lineText: document.lineAt(call.line).text.trim(),
                method: call.method,
                flagKey: call.key,
            };

            const keepEnabledAction = new vscode.CodeAction(
                `Remove stale flag '${call.key}' (keep enabled branch) — ${reason}`,
                vscode.CodeActionKind.QuickFix,
            );
            keepEnabledAction.isPreferred = true;
            keepEnabledAction.command = {
                command: Commands.CLEANUP_STALE_FLAG,
                title: 'Cleanup',
                arguments: [ref, true],
            };
            actions.push(keepEnabledAction);

            const keepDisabledAction = new vscode.CodeAction(
                `Remove stale flag '${call.key}' (keep disabled branch)`,
                vscode.CodeActionKind.QuickFix,
            );
            keepDisabledAction.command = {
                command: Commands.CLEANUP_STALE_FLAG,
                title: 'Cleanup',
                arguments: [ref, false],
            };
            actions.push(keepDisabledAction);
        }

        return actions.length > 0 ? actions : undefined;
    }
}
