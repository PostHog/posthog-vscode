import { EventDefinition, EventProperty } from '../models/types';

export class EventCacheService {
    private events: EventDefinition[] = [];
    private volumes: Map<string, { count: number; days: number }> = new Map();
    private sparklines: Map<string, number[]> = new Map();
    private properties: Map<string, EventProperty[]> = new Map();
    private propertyValues: Map<string, { value: string; count: number }[]> = new Map();
    private listeners: Array<() => void> = [];
    private _lastRefreshed: Date | null = null;

    get lastRefreshed(): Date | null { return this._lastRefreshed; }

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

    getSparkline(name: string): number[] | undefined {
        return this.sparklines.get(name);
    }

    extend(events: EventDefinition[]): void {
        const existingNames = new Set(this.events.map(e => e.name));
        const newEvents = events.filter(e => !existingNames.has(e.name));
        this.update([...this.events, ...newEvents]);
    }

    update(events: EventDefinition[]): void {
        this.events = events;
        this._lastRefreshed = new Date();
        this.notify();
    }

    updateVolumes(volumes: Map<string, { count: number; days: number }>): void {
        volumes.forEach((value, key) => this.volumes.set(key, value));
        this.notify();
    }

    updateSparklines(sparklines: Map<string, number[]>): void {
        sparklines.forEach((value, key) => this.sparklines.set(key, value));
        this.notify();
    }

    onChange(listener: () => void): void {
        this.listeners.push(listener);
    }

    getProperties(eventName: string): EventProperty[] | undefined {
        return this.properties.get(eventName);
    }

    setProperties(eventName: string, props: EventProperty[]): void {
        this.properties.set(eventName, props);
    }

    getPropertyValues(eventName: string, propertyName: string): { value: string; count: number }[] | undefined {
        return this.propertyValues.get(`${eventName}::${propertyName}`);
    }

    setPropertyValues(eventName: string, propertyName: string, values: { value: string; count: number }[]): void {
        this.propertyValues.set(`${eventName}::${propertyName}`, values);
    }

    private notify(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }
}
