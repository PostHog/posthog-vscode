import * as vscode from 'vscode';
import { FlagCacheService } from '../services/flagCacheService';
import { ExperimentCacheService } from '../services/experimentCacheService';
import { TreeSitterService } from '../services/treeSitterService';
import { TelemetryService } from '../services/telemetryService';
import { FeatureFlag } from '../models/types';
import { Commands } from '../constants';

type FlagType = 'boolean' | 'multivariate' | 'remote_config';

const FLAG_METHODS = new Set([
    'getFeatureFlag', 'isFeatureEnabled', 'getFeatureFlagPayload',
    'getFeatureFlagResult', 'isFeatureFlagEnabled', 'getRemoteConfig',
    'get_feature_flag', 'is_feature_enabled', 'get_feature_flag_payload', 'get_remote_config',
    'GetFeatureFlag', 'IsFeatureEnabled', 'GetFeatureFlagPayload',
]);

export class FlagCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this._onDidChange.event;
    private lastCapture = new Map<string, number>();

    constructor(
        private readonly flagCache: FlagCacheService,
        private readonly experimentCache: ExperimentCacheService,
        private readonly treeSitter: TreeSitterService,
        private readonly telemetry: TelemetryService,
    ) {
        this.flagCache.onChange(() => this._onDidChange.fire());
    }

    async provideCodeLenses(doc: vscode.TextDocument): Promise<vscode.CodeLens[]> {
        if (!this.treeSitter.isSupported(doc.languageId)) { return []; }

        const calls = await this.treeSitter.findPostHogCalls(doc);
        const lenses: vscode.CodeLens[] = [];
        const seenFlags = new Set<string>();

        for (const call of calls) {
            if (!FLAG_METHODS.has(call.method)) { continue; }

            const flagKey = call.key;
            // Only show one lens per flag key (the first occurrence)
            if (seenFlags.has(flagKey)) { continue; }
            seenFlags.add(flagKey);

            const flag = this.flagCache.getFlag(flagKey);
            const experiment = this.experimentCache.getByFlagKey(flagKey);
            const range = new vscode.Range(call.line, 0, call.line, 0);

            // Experiment-linked multivariate flag
            if (experiment) {
                const status = this.getExperimentStatus(experiment);
                const winInfo = this.getWinInfo(experiment);
                const title = `$(beaker)  Experiment: ${experiment.name} (${status}${winInfo})`;

                lenses.push(new vscode.CodeLens(range, {
                    title,
                    command: Commands.SHOW_EXPERIMENT_DETAIL,
                    arguments: [flagKey],
                }));
                continue;
            }

            // No flag in cache — skip CodeLens (decoration handles unknown flags)
            if (!flag) { continue; }

            const flagType = this.classifyFlag(flag);

            switch (flagType) {
                case 'boolean': {
                    const rollout = this.extractRollout(flag);
                    const statusLabel = flag.active
                        ? `enabled${rollout !== null ? ` \u00b7 ${rollout}%` : ''}`
                        : 'disabled';
                    const title = `$(toggle-on)  Feature Flag: ${flagKey} (${statusLabel})`;
                    lenses.push(new vscode.CodeLens(range, {
                        title,
                        command: Commands.SHOW_FLAG_DETAIL,
                        arguments: [flagKey],
                    }));
                    break;
                }
                case 'multivariate': {
                    const variantCount = this.getVariantCount(flag);
                    const title = `$(symbol-enum)  Multivariate: ${flagKey} (${variantCount} variants)`;
                    lenses.push(new vscode.CodeLens(range, {
                        title,
                        command: Commands.SHOW_FLAG_DETAIL,
                        arguments: [flagKey],
                    }));
                    break;
                }
                case 'remote_config': {
                    const title = `$(json)  Remote Config: ${flagKey} (has payload)`;
                    lenses.push(new vscode.CodeLens(range, {
                        title,
                        command: Commands.SHOW_FLAG_DETAIL,
                        arguments: [flagKey],
                    }));
                    break;
                }
            }
        }

        if (lenses.length > 0) {
            const docKey = doc.uri.toString();
            if (Date.now() - (this.lastCapture.get(docKey) || 0) > 60_000) {
                this.lastCapture.set(docKey, Date.now());
                this.telemetry.capture('codelens_provided', { type: 'flag', count: lenses.length, language: doc.languageId });
            }
        }

        return lenses;
    }

    private classifyFlag(flag: FeatureFlag): FlagType {
        const filters = flag.filters as Record<string, unknown> | undefined;

        // Check for multivariate
        if (filters?.multivariate && typeof filters.multivariate === 'object') {
            const mv = filters.multivariate as { variants?: unknown[] };
            if (mv.variants && mv.variants.length > 0) { return 'multivariate'; }
        }

        // Check for remote config (payload without multivariate)
        if (filters?.payloads && typeof filters.payloads === 'object') {
            const payloads = filters.payloads as Record<string, unknown>;
            const hasPayload = Object.values(payloads).some(v => v !== null && v !== undefined);
            if (hasPayload) { return 'remote_config'; }
        }

        return 'boolean';
    }

    private extractRollout(flag: FeatureFlag): number | null {
        if (flag.rollout_percentage !== null && flag.rollout_percentage !== undefined) {
            return flag.rollout_percentage;
        }
        const filters = flag.filters as Record<string, unknown> | undefined;
        if (filters?.groups && Array.isArray(filters.groups)) {
            for (const group of filters.groups) {
                if (typeof group === 'object' && group !== null) {
                    const rp = (group as Record<string, unknown>).rollout_percentage;
                    if (typeof rp === 'number') { return rp; }
                }
            }
        }
        return null;
    }

    private getVariantCount(flag: FeatureFlag): number {
        const filters = flag.filters as Record<string, unknown> | undefined;
        if (filters?.multivariate && typeof filters.multivariate === 'object') {
            const mv = filters.multivariate as { variants?: unknown[] };
            return mv.variants?.length ?? 0;
        }
        return 0;
    }

    private getExperimentStatus(experiment: { start_date: string | null; end_date: string | null }): string {
        if (!experiment.start_date) { return 'draft'; }
        if (experiment.end_date) { return 'complete'; }
        return 'running';
    }

    private getWinInfo(experiment: { id: number }): string {
        const results = this.experimentCache.getResults(experiment.id);
        if (!results?.primary?.results?.[0]?.data?.variant_results) { return ''; }

        const variants = results.primary.results[0].data.variant_results;
        let best: { key: string; chance: number } | undefined;

        for (const v of variants) {
            if (!best || v.chance_to_win > best.chance) {
                best = { key: v.key, chance: v.chance_to_win };
            }
        }

        if (best) {
            const pct = Math.round(best.chance * 100);
            return ` | ${best.key} ${pct}%`;
        }

        return '';
    }
}
