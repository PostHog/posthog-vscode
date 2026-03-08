import * as vscode from 'vscode';
import { FlagCacheService } from '../services/flagCacheService';
import { ExperimentCacheService } from '../services/experimentCacheService';
import { Commands } from '../constants';

const POSTHOG_FLAG_METHODS = [
    'getFeatureFlag',
    'isFeatureEnabled',
    'getFeatureFlagPayload',
    'getFeatureFlagResult',
    'isFeatureFlagEnabled',
    'getRemoteConfig',
];

const FLAG_CALL_PATTERN = new RegExp(
    `(?:posthog|client|ph)\\.(?:${POSTHOG_FLAG_METHODS.join('|')})\\s*\\(\\s*(['"\`])([^'"\`]+)\\1`,
    'g',
);

export class FlagLinkProvider implements vscode.DocumentLinkProvider {
    constructor(
        private readonly flagCache: FlagCacheService,
        private readonly experimentCache: ExperimentCacheService,
    ) {}

    provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
        const links: vscode.DocumentLink[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            FLAG_CALL_PATTERN.lastIndex = 0;
            let match;

            while ((match = FLAG_CALL_PATTERN.exec(line.text)) !== null) {
                const flagKey = match[2];
                const keyStart = match.index + match[0].length - flagKey.length - 1;
                const keyEnd = keyStart + flagKey.length;
                const range = new vscode.Range(i, keyStart, i, keyEnd);

                const exists = this.flagCache.hasFlag(flagKey);
                const experiment = this.experimentCache.getByFlagKey(flagKey);
                const args = encodeURIComponent(JSON.stringify([flagKey]));

                let command: string;
                let tooltip: string;
                if (experiment) {
                    command = Commands.SHOW_EXPERIMENT_DETAIL;
                    tooltip = `Open experiment "${experiment.name}" in CodeHog`;
                } else if (exists) {
                    command = Commands.SHOW_FLAG_DETAIL;
                    tooltip = `Open "${flagKey}" in CodeHog`;
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
        }

        return links;
    }
}
