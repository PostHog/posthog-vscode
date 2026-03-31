import { FeatureFlag } from '../models/types';

export class FlagCacheService {
    private flags: FeatureFlag[] = [];
    private listeners: Array<() => void> = [];
    private _lastRefreshed: Date | null = null;

    get lastRefreshed(): Date | null { return this._lastRefreshed; }

    getFlags(): FeatureFlag[] {
        return this.flags;
    }

    getFlagKeys(): string[] {
        return this.flags.filter(f => !f.deleted).map(f => f.key);
    }

    hasFlag(key: string): boolean {
        return this.flags.some(f => f.key === key && !f.deleted);
    }

    getFlag(key: string): FeatureFlag | undefined {
        return this.flags.find(f => f.key === key && !f.deleted);
    }

    update(flags: FeatureFlag[]): void {
        this.flags = flags;
        this._lastRefreshed = new Date();
        for (const listener of this.listeners) {
            listener();
        }
    }

    onChange(listener: () => void): void {
        this.listeners.push(listener);
    }
}
