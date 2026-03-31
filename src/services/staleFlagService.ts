import * as vscode from 'vscode';
import { FlagCacheService } from './flagCacheService';
import { ExperimentCacheService } from './experimentCacheService';
import { TreeSitterService } from './treeSitterService';
import { FeatureFlag } from '../models/types';

export type StalenessReason = 'fully_rolled_out' | 'inactive' | 'not_in_posthog' | 'experiment_complete';

export interface StaleFlagReference {
    uri: vscode.Uri;
    line: number;
    column: number;
    lineText: string;
    method: string;
    flagKey: string;
}

export interface StaleFlag {
    key: string;
    reason: StalenessReason;
    flag?: FeatureFlag;
    references: StaleFlagReference[];
}

const FLAG_METHODS = new Set([
    'getFeatureFlag', 'isFeatureEnabled', 'getFeatureFlagPayload',
    'getFeatureFlagResult', 'isFeatureFlagEnabled', 'getRemoteConfig',
]);

export class StaleFlagService {
    private _staleFlags: StaleFlag[] = [];
    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChange = this._onDidChange.event;

    constructor(
        private readonly flagCache: FlagCacheService,
        private readonly experimentCache: ExperimentCacheService,
        private readonly treeSitter: TreeSitterService,
    ) {}

    getStaleFlags(): StaleFlag[] {
        return this._staleFlags;
    }

    async scan(): Promise<StaleFlag[]> {
        const files = await vscode.workspace.findFiles(
            // Only JS/TS supported — add more extensions when WASM grammars are shipped
            '**/*.{ts,tsx,js,jsx}',
            '{**/node_modules/**,**/dist/**,**/build/**,.git/**}',
        );

        const refsByKey = new Map<string, StaleFlagReference[]>();

        await Promise.all(files.map(async (uri) => {
            try {
                const doc = await vscode.workspace.openTextDocument(uri);
                if (!this.treeSitter.isSupported(doc.languageId)) { return; }

                const calls = await this.treeSitter.findPostHogCalls(doc);
                for (const call of calls) {
                    if (!FLAG_METHODS.has(call.method)) { continue; }

                    const ref: StaleFlagReference = {
                        uri,
                        line: call.line,
                        column: call.keyStartCol,
                        lineText: doc.lineAt(call.line).text.trim(),
                        method: call.method,
                        flagKey: call.key,
                    };

                    const refs = refsByKey.get(call.key) || [];
                    refs.push(ref);
                    refsByKey.set(call.key, refs);
                }
            } catch {
                // skip unreadable files
            }
        }));

        const staleFlags: StaleFlag[] = [];

        for (const [key, references] of refsByKey) {
            const flag = this.flagCache.getFlag(key);
            const reason = this.classifyStaleness(key, flag);
            if (reason) {
                staleFlags.push({ key, reason, flag, references });
            }
        }

        const order: Record<StalenessReason, number> = {
            not_in_posthog: 0,
            inactive: 1,
            experiment_complete: 2,
            fully_rolled_out: 3,
        };
        staleFlags.sort((a, b) => order[a.reason] - order[b.reason]);

        this._staleFlags = staleFlags;
        this._onDidChange.fire();
        return staleFlags;
    }

    private classifyStaleness(key: string, flag: FeatureFlag | undefined): StalenessReason | null {
        if (!flag) {
            return 'not_in_posthog';
        }

        if (!flag.active) {
            return 'inactive';
        }

        const experiment = this.experimentCache.getByFlagKey(key);
        if (experiment?.end_date) {
            return 'experiment_complete';
        }

        if (this.isFullyRolledOut(flag)) {
            return 'fully_rolled_out';
        }

        return null;
    }

    private isFullyRolledOut(flag: FeatureFlag): boolean {
        const filters = flag.filters as Record<string, unknown> | undefined;
        if (!filters) { return false; }

        if (filters.multivariate && typeof filters.multivariate === 'object') {
            const mv = filters.multivariate as { variants?: unknown[] };
            if (mv.variants && mv.variants.length > 0) { return false; }
        }

        if (filters.groups && Array.isArray(filters.groups)) {
            const groups = filters.groups as Array<Record<string, unknown>>;
            if (groups.length === 0) { return false; }

            return groups.every(g => {
                const rollout = g.rollout_percentage;
                const props = g.properties;
                const hasConditions = Array.isArray(props) && props.length > 0;
                return rollout === 100 && !hasConditions;
            });
        }

        if (flag.rollout_percentage === 100) {
            return true;
        }

        return false;
    }

    async buildCleanupEdit(ref: StaleFlagReference, keepEnabled: boolean = true): Promise<vscode.WorkspaceEdit | null> {
        return buildCleanupEditForRef(ref, keepEnabled);
    }
}

const POSTHOG_FLAG_METHODS = [
    'getFeatureFlag', 'isFeatureEnabled', 'getFeatureFlagPayload',
    'getFeatureFlagResult', 'isFeatureFlagEnabled', 'getRemoteConfig',
];

/**
 * Analyze a document around a flag reference and produce a cleanup edit.
 * Handles common patterns:
 *   if (posthog.isFeatureEnabled('key')) { ... }
 *   if (posthog.isFeatureEnabled('key')) { ... } else { ... }
 *   posthog.isFeatureEnabled('key') ? a : b
 */
export async function buildCleanupEditForRef(
    ref: StaleFlagReference,
    keepEnabled: boolean,
    additionalClientNames?: string[],
): Promise<vscode.WorkspaceEdit | null> {
    const doc = await vscode.workspace.openTextDocument(ref.uri);
    const text = doc.getText();

    const lineText = doc.lineAt(ref.line).text;

    const clientNames = ['posthog', 'client', 'ph', ...(additionalClientNames || [])];
    const clientPattern = clientNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

    // Pattern 1: Ternary — expr ? a : b
    const ternaryMatch = lineText.match(
        new RegExp(`(?:${clientPattern})\\.(?:${POSTHOG_FLAG_METHODS.join('|')})\\s*\\([^)]+\\)\\s*\\?\\s*(.+?)\\s*:\\s*(.+?)(?:;|,|\\)|$)`)
    );
    if (ternaryMatch) {
        const replacement = keepEnabled ? ternaryMatch[1].trim() : ternaryMatch[2].trim().replace(/;$/, '');
        const fullMatch = ternaryMatch[0];
        const startCol = lineText.indexOf(fullMatch);
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            ref.uri,
            new vscode.Range(ref.line, startCol, ref.line, startCol + fullMatch.length),
            replacement + (fullMatch.endsWith(';') ? ';' : ''),
        );
        return edit;
    }

    // Pattern 2: if-statement
    const beforeFlag = text.substring(0, doc.offsetAt(new vscode.Position(ref.line, ref.column)));
    const ifMatch = beforeFlag.match(/if\s*\(\s*!?\s*$/);
    if (!ifMatch) {
        const sameLineMatch = lineText.match(/^(\s*)if\s*\(/);
        if (!sameLineMatch) {
            return null;
        }
    }

    const ifLineMatch = lineText.match(/^(\s*)if\s*\(/);
    if (!ifLineMatch && ref.line > 0) {
        return null;
    }

    const indent = ifLineMatch ? ifLineMatch[1] : '';
    const negated = lineText.includes('!') && lineText.indexOf('!') < lineText.indexOf(POSTHOG_FLAG_METHODS.find(m => lineText.includes(m)) || '');

    let braceStart = -1;
    let searchLine = ref.line;
    for (let i = searchLine; i < Math.min(searchLine + 3, doc.lineCount); i++) {
        const idx = doc.lineAt(i).text.indexOf('{');
        if (idx >= 0) {
            braceStart = doc.offsetAt(new vscode.Position(i, idx));
            break;
        }
    }
    if (braceStart === -1) { return null; }

    const ifBlockEnd = findMatchingBrace(text, braceStart);
    if (ifBlockEnd === -1) { return null; }

    const afterIfBlock = text.substring(ifBlockEnd + 1).match(/^\s*else\s*\{/);
    let elseBlockEnd = -1;
    if (afterIfBlock) {
        const elseOpenBrace = ifBlockEnd + 1 + afterIfBlock[0].length - 1;
        elseBlockEnd = findMatchingBrace(text, elseOpenBrace);
    }

    const ifBody = text.substring(braceStart + 1, ifBlockEnd).trim();
    const elseBody = elseBlockEnd !== -1
        ? text.substring(text.indexOf('{', ifBlockEnd + 1) + 1, elseBlockEnd).trim()
        : null;

    const effectiveKeep = negated ? !keepEnabled : keepEnabled;
    const bodyToKeep = effectiveKeep ? ifBody : (elseBody || '');

    if (!bodyToKeep) { return null; }

    const dedented = dedentBlock(bodyToKeep, indent);

    const edit = new vscode.WorkspaceEdit();
    const ifStartLine = ifLineMatch ? ref.line : ref.line - 1;
    const ifStartPos = new vscode.Position(ifStartLine, 0);

    const endOffset = elseBlockEnd !== -1 ? elseBlockEnd + 1 : ifBlockEnd + 1;
    const endPos = doc.positionAt(endOffset);
    const endLine = endPos.line < doc.lineCount - 1 ? endPos.line + 1 : endPos.line;

    edit.replace(
        ref.uri,
        new vscode.Range(ifStartPos, new vscode.Position(endLine, 0)),
        dedented + '\n',
    );

    return edit;
}

function findMatchingBrace(text: string, openIndex: number): number {
    let depth = 0;
    for (let i = openIndex; i < text.length; i++) {
        if (text[i] === '{') { depth++; }
        else if (text[i] === '}') {
            depth--;
            if (depth === 0) { return i; }
        }
    }
    return -1;
}

function dedentBlock(block: string, baseIndent: string): string {
    const lines = block.split('\n');
    let minIndent = Infinity;
    for (const line of lines) {
        if (line.trim().length === 0) { continue; }
        const leadingSpaces = line.match(/^(\s*)/)?.[1].length || 0;
        minIndent = Math.min(minIndent, leadingSpaces);
    }
    if (minIndent === Infinity) { minIndent = 0; }

    return lines
        .map(line => {
            if (line.trim().length === 0) { return ''; }
            return baseIndent + line.substring(minIndent);
        })
        .join('\n');
}
