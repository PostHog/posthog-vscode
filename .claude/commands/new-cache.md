Create a new cache service for this extension.

Ask me:
1. What PostHog entity does it cache?
2. What fields does the entity have? (or point me to the API response)
3. What lookups are needed? (by key, by id, list all, etc.)

Then follow these rules:

**File location**: `src/services/{name}CacheService.ts`

**Pattern** — all caches follow this exact shape:
```typescript
import { EntityType } from '../models/types';

export class XxxCacheService {
    private items: EntityType[] = [];
    private listeners: Array<() => void> = [];

    getItems(): EntityType[] { return this.items; }
    getByKey(key: string): EntityType | undefined { /* lookup */ }
    hasItem(key: string): boolean { /* exists check */ }

    update(items: EntityType[]): void {
        this.items = items;
        for (const listener of this.listeners) { listener(); }
    }

    onChange(listener: () => void): void {
        this.listeners.push(listener);
    }
}
```

**Type definition**: Add the entity interface to `models/types.ts`.

**API method**: Add the fetch method to `postHogService.ts`. Follow existing pagination pattern if paginated.

**Wiring in extension.ts**:
1. Import and construct the cache in `activate()`
2. Add startup cache load in the `if (authed)` block: `postHogService.getXxx(projectId).then(items => cache.update(items)).catch(() => {})`
3. Pass cache to any providers that need it

**Do not** add extra complexity (TTL, LRU, persistence). Caches are simple in-memory stores refreshed on startup and via sidebar actions.
