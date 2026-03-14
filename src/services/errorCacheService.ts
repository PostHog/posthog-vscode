import { ErrorOccurrence } from '../models/types';

export class ErrorCacheService {
    private occurrences: ErrorOccurrence[] = [];
    private byFile: Map<string, ErrorOccurrence[]> = new Map();
    private listeners: Array<() => void> = [];

    getForFile(relativePath: string): ErrorOccurrence[] {
        // Try exact match first, then suffix match for path flexibility
        const exact = this.byFile.get(relativePath);
        if (exact) { return exact; }

        for (const [key, value] of this.byFile) {
            if (key.endsWith(relativePath) || relativePath.endsWith(key)) {
                return value;
            }
        }

        return [];
    }

    getAll(): ErrorOccurrence[] {
        return this.occurrences;
    }

    update(occurrences: ErrorOccurrence[]): void {
        this.occurrences = occurrences;
        this.byFile = new Map();

        for (const occ of occurrences) {
            const key = occ.filePath;
            const existing = this.byFile.get(key);
            if (existing) {
                existing.push(occ);
            } else {
                this.byFile.set(key, [occ]);
            }
        }

        for (const listener of this.listeners) {
            listener();
        }
    }

    onChange(listener: () => void): void {
        this.listeners.push(listener);
    }
}
