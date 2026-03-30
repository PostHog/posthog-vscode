Add a new PostHog API method to postHogService.ts.

Ask me:
1. What endpoint? (REST path or HogQL query)
2. What parameters does it take?
3. What does it return?

Then follow these rules:

**File**: `src/services/postHogService.ts`

**For REST endpoints**:
```typescript
async getXxx(projectId: number, ...params): Promise<ReturnType> {
    return this.request<ReturnType>(`/api/projects/${projectId}/xxx/`);
}
```
- Use `/api/projects/` for most endpoints
- Use `/api/environments/` for error tracking and query endpoints
- For paginated endpoints, use the `while(nextPath)` loop pattern (see `getFeatureFlags`)

**For HogQL queries**:
```typescript
async getXxx(projectId: number, ...params): Promise<ReturnType> {
    const safeParam = this.escapeHogQLString(param);  // ALWAYS escape user input
    const query = `SELECT ... FROM events WHERE ...`;
    const data = await this.request<HogQLQueryResponse>(
        `/api/environments/${projectId}/query/`,
        { method: 'POST', body: { query: { kind: 'HogQLQuery', query } } },
    );
    // Transform data.results rows into typed return value
}
```

**Type definition**: Add response interfaces to `models/types.ts`.

**Error handling**: Use `try/catch` that returns empty results on failure, not throws. Most API methods should degrade gracefully.

**Never** construct raw SQL without `escapeHogQLString()` for any user-provided values.
