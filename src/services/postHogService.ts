import { AuthService } from './authService';
import { PostHogApiError, PaginatedResponse, Project, FeatureFlag, ErrorTrackingIssue, Experiment, EventDefinition, ExceptionEntry, HogQLQueryResponse, ExperimentResults, Insight, EventProperty } from '../models/types';

export class PostHogService {
    constructor(private readonly authService: AuthService) {}

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
        // Try /api/environments/ first (newer PostHog), fall back to /api/projects/
        try {
            const data = await this.request<PaginatedResponse<ErrorTrackingIssue>>(
                `/api/environments/${projectId}/error_tracking/issues/?limit=50`
            );
            return data.results;
        } catch {
            const data = await this.request<PaginatedResponse<ErrorTrackingIssue>>(
                `/api/projects/${projectId}/error_tracking/issues/?limit=50`
            );
            return data.results;
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
        const safeEvent = eventName.replace(/'/g, "\\'");
        const safeProp = propertyName.replace(/'/g, "\\'");
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
}
