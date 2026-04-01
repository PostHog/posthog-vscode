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

export class FlagCodeActionProvider implements vscode.CodeActionProvider {
    static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

    constructor(
        private readonly flagCache: FlagCacheService,
        private readonly treeSitter: TreeSitterService,
    ) {}

    async provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
    ): Promise<vscode.CodeAction[] | undefined> {
        if (!this.treeSitter.isSupported(document.languageId)) { return undefined; }

        const calls = await this.treeSitter.findPostHogCalls(document);
        const line = range.start.line;

        for (const call of calls) {
            if (call.line !== line) { continue; }
            if (!FLAG_METHODS.has(call.method)) { continue; }
            if (this.flagCache.hasFlag(call.key)) { continue; }

            const action = new vscode.CodeAction(
                `Create feature flag "${call.key}" in PostHog`,
                vscode.CodeActionKind.QuickFix,
            );
            action.command = {
                command: Commands.CREATE_FLAG,
                title: 'Create Feature Flag',
                arguments: [call.key],
            };
            action.isPreferred = true;
            return [action];
        }

        return undefined;
    }
}
