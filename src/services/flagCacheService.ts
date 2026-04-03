import { FeatureFlag } from '../models/types';

export class FlagCacheService {
    private flags: FeatureFlag[] = [];
    private flagsByKey: Map<string, FeatureFlag> = new Map();
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
        return this.flagsByKey.has(key);
    }

    getFlag(key: string): FeatureFlag | undefined {
        return this.flagsByKey.get(key);
    }

    update(flags: FeatureFlag[]): void {
        this.flags = flags;
        this.flagsByKey = new Map();
        for (const f of flags) {
            if (!f.deleted) {
                this.flagsByKey.set(f.key, f);
            }
        }
        this._lastRefreshed = new Date();
        for (const listener of this.listeners) {
            listener();
        }
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
