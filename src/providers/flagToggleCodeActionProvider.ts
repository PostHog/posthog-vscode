import * as vscode from 'vscode';
import { FlagCacheService } from '../services/flagCacheService';
import { TreeSitterService } from '../services/treeSitterService';
import { Commands } from '../constants';

const FLAG_METHODS = new Set([
    'getFeatureFlag', 'isFeatureEnabled', 'getFeatureFlagPayload',
    'getFeatureFlagResult', 'isFeatureFlagEnabled', 'getRemoteConfig',
    'get_feature_flag', 'is_feature_enabled', 'get_feature_flag_payload', 'get_remote_config',
    'GetFeatureFlag', 'IsFeatureEnabled', 'GetFeatureFlagPayload',
    'useFeatureFlag', 'useFeatureFlagPayload', 'useFeatureFlagVariantKey', 'useActiveFeatureFlags',
]);

export class FlagToggleCodeActionProvider implements vscode.CodeActionProvider {
    static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

    constructor(
        private readonly flagCache: FlagCacheService,
        private readonly treeSitter: TreeSitterService,
    ) {}

    async provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
    ): Promise<vscode.CodeAction[]> {
        if (!this.treeSitter.isSupported(document.languageId)) { return []; }

        const calls = await this.treeSitter.findPostHogCalls(document);
        const actions: vscode.CodeAction[] = [];

        for (const call of calls) {
            if (call.line !== range.start.line) { continue; }
            if (!FLAG_METHODS.has(call.method)) { continue; }

            const flag = this.flagCache.getFlag(call.key);
            if (!flag) { continue; }

            const action = new vscode.CodeAction(
                `Toggle flag '${call.key}' (currently ${flag.active ? 'enabled' : 'disabled'})`,
                vscode.CodeActionKind.QuickFix,
            );
            action.command = {
                command: Commands.TOGGLE_FLAG,
                title: 'Toggle Flag',
                arguments: [flag],
            };
            actions.push(action);
        }

        return actions;
    }
}
