import { AuthService } from './authService';
import { PostHogApiError, PaginatedResponse, Project, FeatureFlag, ErrorTrackingIssue, Experiment, EventDefinition, ExceptionEntry, HogQLQueryResponse } from '../models/types';

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

    async createFeatureFlag(projectId: number, key: string, name?: string): Promise<FeatureFlag> {
        return this.request<FeatureFlag>(`/api/projects/${projectId}/feature_flags/`, {
            method: 'POST',
            body: {
                key,
                name: name ?? key,
                filters: {},
            },
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
}
