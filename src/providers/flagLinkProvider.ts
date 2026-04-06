import * as vscode from 'vscode';
import { FlagCacheService } from '../services/flagCacheService';
import { ExperimentCacheService } from '../services/experimentCacheService';
import { TreeSitterService } from '../services/treeSitterService';
import { Commands } from '../constants';

const FLAG_METHODS = new Set([
    'getFeatureFlag', 'isFeatureEnabled', 'getFeatureFlagPayload',
    'getFeatureFlagResult', 'isFeatureFlagEnabled', 'getRemoteConfig',
    'feature_enabled', 'get_feature_flag', 'is_feature_enabled', 'get_feature_flag_payload', 'get_remote_config', 'get_remote_config_payload',
    'GetFeatureFlag', 'IsFeatureEnabled', 'GetFeatureFlagPayload',
    'useFeatureFlag', 'useFeatureFlagPayload', 'useFeatureFlagVariantKey', 'useActiveFeatureFlags',
]);

export class FlagLinkProvider implements vscode.DocumentLinkProvider {
    constructor(
        private readonly flagCache: FlagCacheService,
        private readonly experimentCache: ExperimentCacheService,
        private readonly treeSitter: TreeSitterService,
    ) {}

    async provideDocumentLinks(document: vscode.TextDocument): Promise<vscode.DocumentLink[]> {
        if (!this.treeSitter.isSupported(document.languageId)) { return []; }

        const calls = await this.treeSitter.findPostHogCalls(document);
        const links: vscode.DocumentLink[] = [];

        for (const call of calls) {
            if (!FLAG_METHODS.has(call.method)) { continue; }

            const flagKey = call.key;
            const range = new vscode.Range(call.line, call.keyStartCol, call.line, call.keyEndCol);

            const exists = this.flagCache.hasFlag(flagKey);
            const experiment = this.experimentCache.getByFlagKey(flagKey);
            const args = encodeURIComponent(JSON.stringify([flagKey]));

            let command: string;
            let tooltip: string;
            if (experiment) {
                command = Commands.SHOW_EXPERIMENT_DETAIL;
                tooltip = `Open experiment "${experiment.name}" in PostHog`;
            } else if (exists) {
                command = Commands.SHOW_FLAG_DETAIL;
                tooltip = `Open "${flagKey}" in PostHog`;
            } else {
                command = Commands.CREATE_FLAG;
                tooltip = `Create "${flagKey}" in PostHog`;
            }

            const link = new vscode.DocumentLink(
                range,
                vscode.Uri.parse(`command:${command}?${args}`),
            );
            link.tooltip = tooltip;
            links.push(link);
        }

        return links;
    }
}
