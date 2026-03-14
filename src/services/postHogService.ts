import { AuthService } from './authService';
import { PostHogApiError, PaginatedResponse, Project, FeatureFlag, ErrorTrackingIssue, Experiment, EventDefinition, ExceptionEntry, StackFrame, HogQLQueryResponse, ExperimentResults, Insight, EventProperty, ErrorOccurrence, SessionReplayEntry } from '../models/types';

export class PostHogService {
    constructor(private readonly authService: AuthService) {}

    private escapeHogQLString(value: string): string {
        // Escape backslashes first, then single quotes for safe embedding in HogQL string literals
        return value.replace(/\\/g, '\\\\').replace(/'/g, "''");
    }

    private async request<T>(path: string, options?: { method?: string; body?: unknown }): Promise<T> {
        const apiKey = await this.authService.getApiKey();
        if (!apiKey) {
            throw new PostHogApiError(401, 'Not authenticated');
        }

        const host = this.authService.getHost().replace(/\/+$/, '');
        const url = `${host}${path}`;

        const response = await fetch(url, {
            method: options?.method ?? 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: options?.body ? JSON.stringify(options.body) : undefined,
        });

        if (!response.ok) {
            const body = await response.text();
            throw new PostHogApiError(response.status, body || response.statusText);
        }

        return response.json() as Promise<T>;
    }

    async getProjects(): Promise<Project[]> {
        const data = await this.request<PaginatedResponse<Project>>('/api/projects/');
        return data.results;
    }

    async getFeatureFlags(projectId: number): Promise<FeatureFlag[]> {
        const flags: FeatureFlag[] = [];
        let nextPath: string | null = `/api/projects/${projectId}/feature_flags/?limit=100`;

        while (nextPath) {
            const data: PaginatedResponse<FeatureFlag> = await this.request<PaginatedResponse<FeatureFlag>>(nextPath);
            flags.push(...data.results);

            if (data.next) {
                const parsed = new URL(data.next);
                nextPath = parsed.pathname + parsed.search;
            } else {
                nextPath = null;
            }
        }

        return flags;
    }

    async createFeatureFlag(projectId: number, key: string, name?: string, active?: boolean): Promise<FeatureFlag> {
        return this.request<FeatureFlag>(`/api/projects/${projectId}/feature_flags/`, {
            method: 'POST',
            body: {
                key,
                name: name ?? key,
                active: active ?? false,
                filters: { groups: [{ properties: [], rollout_percentage: 100 }] },
            },
        });
    }

    async updateFeatureFlag(projectId: number, flagId: number, patch: Record<string, unknown>): Promise<FeatureFlag> {
        return this.request<FeatureFlag>(`/api/projects/${projectId}/feature_flags/${flagId}/`, {
            method: 'PATCH',
            body: patch,
        });
    }

    async getErrorTrackingIssues(projectId: number): Promise<ErrorTrackingIssue[]> {
        // Error tracking issues are only on the environments router
        try {
            const data = await this.request<PaginatedResponse<ErrorTrackingIssue>>(
                `/api/environments/${projectId}/error_tracking/issues/?limit=50&status=active`
            );
            return data.results;
        } catch (err) {
            console.warn('[PostHog] Failed to load error tracking issues:', err instanceof Error ? err.message : err);
            throw err;
        }
    }

    async getEventDefinitions(projectId: number): Promise<EventDefinition[]> {
        const events: EventDefinition[] = [];
        let nextPath: string | null = `/api/projects/${projectId}/event_definitions/?limit=100`;

        while (nextPath) {
            const data: PaginatedResponse<EventDefinition> = await this.request<PaginatedResponse<EventDefinition>>(nextPath);
            events.push(...data.results);

            if (data.next) {
                const parsed = new URL(data.next);
                nextPath = parsed.pathname + parsed.search;
            } else {
                nextPath = null;
            }
        }

        return events;
    }

    async getErrorStackTrace(projectId: number, issueId: string): Promise<ExceptionEntry[]> {
        const query = `SELECT properties.$exception_list FROM events WHERE $exception_issue_id = '${issueId}' ORDER BY timestamp DESC LIMIT 1`;
        const data = await this.request<HogQLQueryResponse>(
            `/api/environments/${projectId}/query/`,
            {
                method: 'POST',
                body: { query: { kind: 'HogQLQuery', query } },
            },
        );

        if (data.results && data.results.length > 0 && data.results[0][0]) {
            const raw = data.results[0][0];
            if (typeof raw === 'string') {
                return JSON.parse(raw) as ExceptionEntry[];
            }
            if (Array.isArray(raw)) {
                return raw as ExceptionEntry[];
            }
        }
        return [];
    }

    async getEventVolumes(projectId: number, eventNames: string[]): Promise<Map<string, { count: number; days: number }>> {
        const result = new Map<string, { count: number; days: number }>();
        if (eventNames.length === 0) { return result; }

        const escaped = eventNames.map(n => `'${n.replace(/'/g, "\\'")}'`).join(', ');
        const query = `SELECT event, count() as cnt FROM events WHERE event IN (${escaped}) AND timestamp > now() - INTERVAL 7 DAY GROUP BY event`;

        try {
            const data = await this.request<HogQLQueryResponse>(
                `/api/environments/${projectId}/query/`,
                {
                    method: 'POST',
                    body: { query: { kind: 'HogQLQuery', query } },
                },
            );

            for (const row of data.results) {
                const name = row[0] as string;
                const count = row[1] as number;
                result.set(name, { count, days: 7 });
            }
        } catch {
            // Silently fail — decorations just won't show volume
        }

        return result;
    }

    async getExperiments(projectId: number): Promise<Experiment[]> {
        const data = await this.request<PaginatedResponse<Experiment>>(
            `/api/projects/${projectId}/experiments/?limit=50`
        );
        return data.results;
    }

    async getInsights(projectId: number): Promise<Insight[]> {
        const data = await this.request<PaginatedResponse<Insight>>(
            `/api/projects/${projectId}/insights/?limit=50&saved=true`
        );
        return data.results;
    }

    async refreshInsight(projectId: number, insightId: number): Promise<Insight> {
        return this.request<Insight>(
            `/api/projects/${projectId}/insights/${insightId}/?refresh=blocking`
        );
    }

    async getEventProperties(projectId: number, eventName: string): Promise<EventProperty[]> {
        const encoded = encodeURIComponent(JSON.stringify([eventName]));
        const data = await this.request<PaginatedResponse<EventProperty>>(
            `/api/projects/${projectId}/property_definitions/?type=event&event_names=${encoded}&filter_by_event_names=true&limit=100`
        );
        return data.results;
    }

    async getPropertyValues(projectId: number, eventName: string, propertyName: string): Promise<{ value: string; count: number }[]> {
        const safeEvent = this.escapeHogQLString(eventName);
        const safeProp = this.escapeHogQLString(propertyName);
        const query = `SELECT properties.'${safeProp}' as val, count() as cnt FROM events WHERE event = '${safeEvent}' AND properties.'${safeProp}' IS NOT NULL GROUP BY val ORDER BY cnt DESC LIMIT 20`;

        try {
            const data = await this.request<HogQLQueryResponse>(
                `/api/environments/${projectId}/query/`,
                { method: 'POST', body: { query: { kind: 'HogQLQuery', query } } },
            );
            return data.results
                .filter(row => row[0] != null && String(row[0]).length > 0)
                .map(row => ({ value: String(row[0]), count: row[1] as number }));
        } catch {
            return [];
        }
    }

    async getExperimentResults(projectId: number, experimentId: number): Promise<ExperimentResults | null> {
        // Try /api/projects/ first, then /api/environments/
        for (const prefix of [`/api/projects/${projectId}`, `/api/environments/${projectId}`]) {
            try {
                const data = await this.request<{ metrics: ExperimentResults }>(
                    `${prefix}/experiments/${experimentId}/results/`
                );
                return data.metrics;
            } catch {
                // Try next prefix
            }
        }
        return null;
    }

    async getEventSparklines(projectId: number, eventNames: string[]): Promise<Map<string, number[]>> {
        const result = new Map<string, number[]>();
        if (eventNames.length === 0) { return result; }

        const escaped = eventNames.map(n => `'${this.escapeHogQLString(n)}'`).join(', ');
        const query = `SELECT event, toDate(timestamp) as day, count() as cnt FROM events WHERE event IN (${escaped}) AND timestamp >= toDate(now()) - INTERVAL 6 DAY GROUP BY event, day ORDER BY event, day`;

        try {
            const data = await this.request<HogQLQueryResponse>(
                `/api/environments/${projectId}/query/`,
                { method: 'POST', body: { query: { kind: 'HogQLQuery', query } } },
            );

            // Build date index for the last 7 days
            const today = new Date();
            const days: string[] = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                days.push(d.toISOString().slice(0, 10));
            }

            const byEvent = new Map<string, Map<string, number>>();
            for (const row of data.results) {
                const name = row[0] as string;
                const day = String(row[1]).slice(0, 10);
                const count = row[2] as number;
                if (!byEvent.has(name)) { byEvent.set(name, new Map()); }
                byEvent.get(name)!.set(day, count);
            }

            for (const [name, dayCounts] of byEvent) {
                result.set(name, days.map(d => dayCounts.get(d) || 0));
            }
        } catch {
            // Silently fail
        }

        return result;
    }

    async getErrorOccurrences(projectId: number): Promise<ErrorOccurrence[]> {
        const issues = await this.getErrorTrackingIssues(projectId);
        const activeIssues = issues.filter(i => i.status === 'active');
        if (activeIssues.length === 0) { return []; }

        const occurrences: ErrorOccurrence[] = [];

        // Fetch stack traces in parallel, bounded to avoid overwhelming the API
        const BATCH_SIZE = 10;
        for (let i = 0; i < activeIssues.length; i += BATCH_SIZE) {
            const batch = activeIssues.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
                batch.map(issue => this.getErrorStackTrace(projectId, issue.id))
            );

            for (let j = 0; j < batch.length; j++) {
                const issue = batch[j];
                const result = results[j];
                if (result.status !== 'fulfilled' || result.value.length === 0) { continue; }

                const frame = this.findFirstInAppFrame(result.value);
                if (!frame) { continue; }

                occurrences.push({
                    issueId: issue.id,
                    title: issue.name || result.value[0]?.type || 'Unknown error',
                    description: issue.description || result.value[0]?.value || null,
                    status: issue.status,
                    occurrences: issue.occurrences ?? 0,
                    firstSeen: issue.first_seen,
                    lastSeen: issue.last_seen ?? null,
                    filePath: frame.filename,
                    line: frame.lineno,
                    column: frame.colno || null,
                    functionName: frame.function || null,
                });
            }
        }

        return occurrences;
    }

    private findFirstInAppFrame(exceptions: ExceptionEntry[]): StackFrame | null {
        for (const ex of exceptions) {
            const frames = ex.stack_trace?.frames;
            if (!frames || frames.length === 0) { continue; }

            // Frames are typically ordered bottom-to-top; the last in-app frame
            // is the most relevant (closest to the throw site).
            for (let i = frames.length - 1; i >= 0; i--) {
                const f = frames[i];
                if (f.in_app !== false && f.filename && f.lineno > 0) {
                    return f;
                }
            }

            // Fallback: any frame with a filename and line
            for (let i = frames.length - 1; i >= 0; i--) {
                const f = frames[i];
                if (f.filename && f.lineno > 0) {
                    return f;
                }
            }
        }
        return null;
    }

    async getRecentSessions(projectId: number, eventName: string): Promise<SessionReplayEntry[]> {
        const safeEvent = this.escapeHogQLString(eventName);
        const query = `SELECT
            e.$session_id,
            e.distinct_id,
            max(e.timestamp) as latest_ts,
            argMax(e.properties.$current_url, e.timestamp),
            argMax(e.properties.$browser, e.timestamp),
            argMax(e.properties.$os, e.timestamp),
            argMax(e.properties.$device_type, e.timestamp)
        FROM events e
        INNER JOIN session_replay_events sr ON sr.session_id = e.$session_id
        WHERE e.event = '${safeEvent}'
            AND e.$session_id IS NOT NULL
            AND e.$session_id != ''
            AND e.timestamp > now() - INTERVAL 7 DAY
        GROUP BY e.$session_id, e.distinct_id
        ORDER BY latest_ts DESC
        LIMIT 10`;

        try {
            const data = await this.request<HogQLQueryResponse>(
                `/api/environments/${projectId}/query/`,
                { method: 'POST', body: { query: { kind: 'HogQLQuery', query } } },
            );

            return data.results.map(row => ({
                sessionId: String(row[0]),
                distinctId: String(row[1]),
                timestamp: String(row[2]),
                currentUrl: row[3] ? String(row[3]) : null,
                browser: row[4] ? String(row[4]) : null,
                os: row[5] ? String(row[5]) : null,
                deviceType: row[6] ? String(row[6]) : null,
            }));
        } catch {
            return [];
        }
    }

    async getRecentSessionsForFlag(projectId: number, flagKey: string): Promise<SessionReplayEntry[]> {
        const safeKey = this.escapeHogQLString(flagKey);
        const query = `SELECT
            e.$session_id,
            e.distinct_id,
            max(e.timestamp) as latest_ts,
            argMax(e.properties.$current_url, e.timestamp),
            argMax(e.properties.$browser, e.timestamp),
            argMax(e.properties.$os, e.timestamp),
            argMax(e.properties.$device_type, e.timestamp)
        FROM events e
        INNER JOIN session_replay_events sr ON sr.session_id = e.$session_id
        WHERE (
            (e.event = '$feature_flag_called' AND e.properties.$feature_flag = '${safeKey}')
            OR e.properties.$feature.${safeKey} IS NOT NULL
        )
            AND e.$session_id IS NOT NULL
            AND e.$session_id != ''
            AND e.timestamp > now() - INTERVAL 7 DAY
        GROUP BY e.$session_id, e.distinct_id
        ORDER BY latest_ts DESC
        LIMIT 10`;

        try {
            const data = await this.request<HogQLQueryResponse>(
                `/api/environments/${projectId}/query/`,
                { method: 'POST', body: { query: { kind: 'HogQLQuery', query } } },
            );

            return data.results.map(row => ({
                sessionId: String(row[0]),
                distinctId: String(row[1]),
                timestamp: String(row[2]),
                currentUrl: row[3] ? String(row[3]) : null,
                browser: row[4] ? String(row[4]) : null,
                os: row[5] ? String(row[5]) : null,
                deviceType: row[6] ? String(row[6]) : null,
            }));
        } catch {
            return [];
        }
    }

    async getSessionSharingUrl(projectId: number, sessionId: string): Promise<string | null> {
        const host = this.authService.getHost().replace(/\/+$/, '');
        const basePath = `/api/projects/${projectId}/session_recordings/${sessionId}/sharing`;
        try {
            // Enable sharing via PATCH (creates config if needed, or updates existing)
            const result = await this.request<{ enabled: boolean; access_token: string }>(basePath, {
                method: 'PATCH',
                body: { enabled: true },
            });
            if (result.access_token) {
                return `${host}/embedded/${result.access_token}`;
            }
        } catch {
            // Sharing API may not be available (e.g., older self-hosted)
        }
        return null;
    }

    async getSessionCounts(projectId: number, eventNames: string[], flagKeys: string[]): Promise<Map<string, { sessions: number; users: number }>> {
        const result = new Map<string, { sessions: number; users: number }>();
        const parts: string[] = [];

        if (eventNames.length > 0) {
            const escaped = eventNames.map(n => `'${this.escapeHogQLString(n)}'`).join(', ');
            parts.push(`SELECT
                event as key,
                count(DISTINCT $session_id) as sessions,
                count(DISTINCT distinct_id) as users
            FROM events
            WHERE event IN (${escaped})
                AND $session_id IS NOT NULL
                AND $session_id != ''
                AND timestamp > now() - INTERVAL 1 DAY
            GROUP BY event`);
        }

        if (flagKeys.length > 0) {
            const escaped = flagKeys.map(k => `'${this.escapeHogQLString(k)}'`).join(', ');
            parts.push(`SELECT
                properties.$feature_flag as key,
                count(DISTINCT $session_id) as sessions,
                count(DISTINCT distinct_id) as users
            FROM events
            WHERE event = '$feature_flag_called'
                AND properties.$feature_flag IN (${escaped})
                AND $session_id IS NOT NULL
                AND $session_id != ''
                AND timestamp > now() - INTERVAL 1 DAY
            GROUP BY properties.$feature_flag`);
        }

        if (parts.length === 0) { return result; }

        const query = parts.join(' UNION ALL ');

        try {
            const data = await this.request<HogQLQueryResponse>(
                `/api/environments/${projectId}/query/`,
                { method: 'POST', body: { query: { kind: 'HogQLQuery', query } } },
            );

            for (const row of data.results) {
                result.set(String(row[0]), {
                    sessions: row[1] as number,
                    users: row[2] as number,
                });
            }
        } catch {
            // Silently fail
        }

        return result;
    }

    async runHogQLQuery(projectId: number, query: string): Promise<HogQLQueryResponse> {
        return this.request<HogQLQueryResponse>(
            `/api/environments/${projectId}/query/`,
            { method: 'POST', body: { query: { kind: 'HogQLQuery', query } } },
        );
    }
}
