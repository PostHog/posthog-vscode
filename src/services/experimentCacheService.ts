import { Experiment } from '../models/types';

export class ExperimentCacheService {
    private experiments: Experiment[] = [];

    getExperiments(): Experiment[] {
        return this.experiments;
    }

    getByFlagKey(flagKey: string): Experiment | undefined {
        return this.experiments.find(e => e.feature_flag_key === flagKey);
    }

    update(experiments: Experiment[]): void {
        this.experiments = experiments;
    }
}
