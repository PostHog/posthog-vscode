import { EventDefinition } from '../models/types';

export class EventCacheService {
    private events: EventDefinition[] = [];
    private volumes: Map<string, { count: number; days: number }> = new Map();
    private listeners: Array<() => void> = [];

    getEvents(): EventDefinition[] {
        return this.events;
    }

    getEvent(name: string): EventDefinition | undefined {
        return this.events.find(e => e.name === name);
    }

    getEventNames(): string[] {
        return this.events.filter(e => !e.hidden).map(e => e.name);
    }

    getVolume(name: string): { count: number; days: number } | undefined {
        return this.volumes.get(name);
    }

    update(events: EventDefinition[]): void {
        this.events = events;
        this.notify();
    }

    updateVolumes(volumes: Map<string, { count: number; days: number }>): void {
        this.volumes = volumes;
        this.notify();
    }

    onChange(listener: () => void): void {
        this.listeners.push(listener);
    }

    private notify(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }
}
