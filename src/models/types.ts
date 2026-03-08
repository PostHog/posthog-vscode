export interface Project {
    id: number;
    name: string;
    uuid: string;
}

export interface FeatureFlag {
    id: number;
    key: string;
    name: string;
    active: boolean;
    filters: Record<string, unknown>;
    rollout_percentage: number | null;
    created_at: string;
    created_by: { email: string; first_name: string } | null;
    deleted: boolean;
}

export interface ErrorTrackingIssue {
    id: string;
    short_id?: string;
    name: string | null;
    description: string | null;
    status: 'active' | 'resolved' | 'pending_release' | 'archived' | 'suppressed';
    occurrences?: number;
    sessions?: number;
    users?: number;
    first_seen: string;
    last_seen?: string;
    volume?: number[] | null;
}

export interface Experiment {
    id: number;
    name: string;
    description: string | null;
    start_date: string | null;
    end_date: string | null;
    feature_flag_key: string;
    created_at: string;
    created_by: { email: string; first_name: string } | null;
}

export interface EventDefinition {
    id: string;
    name: string;
    description: string | null;
    tags: string[];
    last_seen_at: string | null;
    verified: boolean;
    hidden: boolean;
}

export interface StackFrame {
    filename: string;
    lineno: number;
    colno: number;
    function: string;
    source?: string;
    in_app?: boolean;
}

export interface ExceptionEntry {
    type: string;
    value: string;
    mechanism?: { type: string };
    stack_trace?: { frames: StackFrame[] };
}

export interface HogQLQueryResponse {
    results: unknown[][];
    columns: string[];
}

export interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

export class PostHogApiError extends Error {
    constructor(
        public readonly statusCode: number,
        message: string
    ) {
        super(message);
        this.name = 'PostHogApiError';
    }
}
