import { Experiment, ExperimentResults } from '../models/types';

export class ExperimentCacheService {
    private experiments: Experiment[] = [];
    private results = new Map<number, ExperimentResults>();
    private listeners: Array<() => void> = [];
    private _lastRefreshed: Date | null = null;

    get lastRefreshed(): Date | null { return this._lastRefreshed; }

    getExperiments(): Experiment[] {
        return this.experiments;
    }

    getByFlagKey(flagKey: string): Experiment | undefined {
        return this.experiments.find(e => e.feature_flag_key === flagKey);
    }

    getResults(experimentId: number): ExperimentResults | undefined {
        return this.results.get(experimentId);
    }

    update(experiments: Experiment[]): void {
        this.experiments = experiments;
        this._lastRefreshed = new Date();
        for (const listener of this.listeners) { listener(); }
    }

    updateResults(experimentId: number, results: ExperimentResults): void {
        this.results.set(experimentId, results);
        for (const listener of this.listeners) { listener(); }
    }

    onChange(listener: () => void): { dispose(): void } {
        this.listeners.push(listener);
        return {
            dispose: () => {
                const idx = this.listeners.indexOf(listener);
                if (idx >= 0) { this.listeners.splice(idx, 1); }
            },
        };
    }
}
