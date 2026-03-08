import * as vscode from 'vscode';
import { FlagCacheService } from '../services/flagCacheService';
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
);

export class FlagCodeActionProvider implements vscode.CodeActionProvider {
    static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

    constructor(private readonly flagCache: FlagCacheService) {}

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
    ): vscode.CodeAction[] | undefined {
        const line = document.lineAt(range.start.line).text;
        const match = FLAG_CALL_PATTERN.exec(line);
        if (!match) {
            return undefined;
        }

        const flagKey = match[2];
        if (this.flagCache.hasFlag(flagKey)) {
            return undefined;
        }

        const action = new vscode.CodeAction(
            `Create feature flag "${flagKey}" in PostHog`,
            vscode.CodeActionKind.QuickFix,
        );
        action.command = {
            command: Commands.CREATE_FLAG,
            title: 'Create Feature Flag',
            arguments: [flagKey],
        };
        action.isPreferred = true;

        return [action];
    }
}
