import * as vscode from 'vscode';
import { FlagCacheService } from '../services/flagCacheService';
import { TreeSitterService } from '../services/treeSitterService';
import { TelemetryService } from '../services/telemetryService';
import { inferType, extractPayloadValue } from '../services/codegenService';
import { FeatureFlag } from '../models/types';
import { Commands } from '../constants';

const FLAG_METHODS = new Set([
    'getFeatureFlag', 'isFeatureEnabled', 'getFeatureFlagPayload',
    'getFeatureFlagResult', 'isFeatureFlagEnabled', 'getRemoteConfig',
    // React hooks
    'useFeatureFlag', 'useFeatureFlagPayload', 'useFeatureFlagVariantKey',
]);

/** Methods that return a variant key string */
const VARIANT_METHODS = new Set(['getFeatureFlag', 'useFeatureFlag', 'useFeatureFlagVariantKey']);

/** Methods that return a payload */
const PAYLOAD_METHODS = new Set(['getFeatureFlagPayload', 'getRemoteConfig', 'useFeatureFlagPayload']);

/** Methods that return boolean */
const BOOLEAN_METHODS = new Set(['isFeatureEnabled', 'isFeatureFlagEnabled']);

const TS_LANGUAGES = new Set(['typescript', 'typescriptreact']);

export function registerGenerateTypeCommand(
    flagCache: FlagCacheService,
    treeSitter: TreeSitterService,
    telemetry: TelemetryService,
): vscode.Disposable {
    return vscode.commands.registerCommand(Commands.GENERATE_TYPE, async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const doc = editor.document;
        if (!treeSitter.isSupported(doc.languageId)) {
            vscode.window.showWarningMessage('PostHog: Generate Type is not supported for this file type.');
            return;
        }

        const line = editor.selection.active.line;
        const calls = await treeSitter.findPostHogCalls(doc);

        // Also accept user-configured additional flag functions
        const additionalFns = new Set(vscode.workspace.getConfiguration('posthog').get<string[]>('additionalFlagFunctions', []));

        // Find a flag call on the cursor line
        const call = calls.find(c => c.line === line && (FLAG_METHODS.has(c.method) || additionalFns.has(c.method)));
        if (!call) {
            vscode.window.showWarningMessage('PostHog: Place your cursor on a line with a PostHog flag call.');
            return;
        }

        // Check the line has a variable assignment: const/let/var name = ...
        const lineText = doc.lineAt(line).text;
        const assignMatch = lineText.match(/^\s*(?:const|let|var)\s+(\w+)\s*=\s*/);
        if (!assignMatch) {
            vscode.window.showWarningMessage('PostHog: Place your cursor on a variable assignment (e.g. const flag = posthog.getFeatureFlag(...))');
            return;
        }

        const varName = assignMatch[1];
        const flag = flagCache.getFlag(call.key);
        const typeStr = inferFlagTypeForMethod(call.method, call.key, flag);
        const isTS = TS_LANGUAGES.has(doc.languageId);

        if (isTS) {
            // TypeScript: insert `: type` after the variable name
            const alreadyTyped = lineText.match(/^\s*(?:const|let|var)\s+\w+\s*:/);
            if (alreadyTyped) {
                vscode.window.showInformationMessage('PostHog: This variable already has a type annotation.');
                return;
            }

            const varNameIndex = lineText.indexOf(varName, lineText.indexOf(varName.charAt(0)));
            const insertPos = new vscode.Position(line, varNameIndex + varName.length);

            await editor.edit(editBuilder => {
                editBuilder.insert(insertPos, `: ${typeStr}`);
            });
        } else {
            // JavaScript: insert /** @type {X} */ comment above the line
            const indent = lineText.match(/^(\s*)/)?.[1] ?? '';

            // Check if there's already a JSDoc @type above
            if (line > 0) {
                const prevLine = doc.lineAt(line - 1).text.trim();
                if (prevLine.includes('@type')) {
                    vscode.window.showInformationMessage('PostHog: This variable already has a @type annotation.');
                    return;
                }
            }

            await editor.edit(editBuilder => {
                editBuilder.insert(
                    new vscode.Position(line, 0),
                    `${indent}/** @type {${typeStr}} */\n`,
                );
            });
        }

        telemetry.capture('type_generated', { flag_key: call.key, method: call.method, language: doc.languageId, mode: isTS ? 'annotation' : 'jsdoc' });
    });
}

export function inferFlagTypeForMethod(method: string, flagKey: string, flag: FeatureFlag | undefined): string {
    if (BOOLEAN_METHODS.has(method)) {
        return 'boolean';
    }

    if (!flag) {
        if (VARIANT_METHODS.has(method)) { return 'boolean | undefined'; }
        if (PAYLOAD_METHODS.has(method)) { return 'unknown'; }
        return 'boolean';
    }

    if (PAYLOAD_METHODS.has(method)) {
        return inferPayloadType(flag);
    }

    if (VARIANT_METHODS.has(method)) {
        return inferVariantReturnType(flag);
    }

    if (method === 'getRemoteConfig') {
        return inferPayloadType(flag);
    }

    return 'boolean';
}

/**
 * For getFeatureFlag() / useFeatureFlag(): type based on actual flag values.
 */
export function inferVariantReturnType(flag: FeatureFlag): string {
    const filters = flag.filters as Record<string, unknown> | undefined;
    if (filters?.multivariate && typeof filters.multivariate === 'object') {
        const mv = filters.multivariate as { variants?: { key: string }[] };
        if (mv.variants && mv.variants.length > 0) {
            const keys = mv.variants.map(v => `'${v.key}'`);
            return `${keys.join(' | ')} | undefined`;
        }
    }
    return 'boolean | undefined';
}

/**
 * For getFeatureFlagPayload() / getRemoteConfig() / useFeatureFlagPayload(): type from payload.
 */
export function inferPayloadType(flag: FeatureFlag): string {
    const filters = flag.filters as Record<string, unknown> | undefined;
    const payloads = filters?.payloads as Record<string, unknown> | undefined | null;

    if (!payloads || typeof payloads !== 'object') {
        return 'unknown';
    }

    const keys = Object.keys(payloads);
    if (keys.length === 0) {
        return 'unknown';
    }

    const types: string[] = [];
    for (const key of keys) {
        const raw = payloads[key];
        const { parsed, ok } = extractPayloadValue(raw);
        if (ok) {
            types.push(inferType(parsed));
        }
    }

    if (types.length === 0) {
        return 'unknown';
    }

    const unique = [...new Set(types)];
    return `${unique.join(' | ')} | null`;
}
