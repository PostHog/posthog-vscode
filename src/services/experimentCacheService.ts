import { Experiment, ExperimentResults } from '../models/types';

export class ExperimentCacheService {
    private experiments: Experiment[] = [];
    private results = new Map<number, ExperimentResults>();

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
    }

    updateResults(experimentId: number, results: ExperimentResults): void {
        this.results.set(experimentId, results);
    }
}
