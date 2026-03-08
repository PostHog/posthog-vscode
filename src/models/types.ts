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

export interface ExperimentMetric {
    name: string;
    metric_type: 'funnel' | 'mean' | 'ratio' | 'retention';
    goal: 'increase' | 'decrease';
    uuid: string;
}

export interface ExperimentVariantResult {
    key: string;
    chance_to_win: number;
    credible_interval: [number, number];
    significant: boolean;
    number_of_samples: number;
    method: string;
    mean?: number;
    absolute_exposure?: number;
    delta?: number;
}

export interface ExperimentMetricResult {
    index: number;
    data: {
        baseline: { key: string; number_of_samples: number; mean?: number; absolute_exposure?: number };
        variant_results: ExperimentVariantResult[];
    };
}

export interface ExperimentResults {
    primary: { count: number; results: ExperimentMetricResult[] };
    secondary: { count: number; results: ExperimentMetricResult[] };
    variants?: { key: string; absolute_exposure: number }[];
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
    metrics?: ExperimentMetric[];
    metrics_secondary?: ExperimentMetric[];
    parameters?: {
        feature_flag_variants?: { key: string; rollout_percentage: number }[];
        recommended_sample_size?: number;
    };
    conclusion?: 'won' | 'lost' | null;
    conclusion_comment?: string | null;
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

export interface TrendResult {
    data: number[];
    labels: string[];
    days: string[];
    count: number;
    label: string;
}

export interface FunnelStep {
    action_id: string | number;
    name: string;
    custom_name: string | null;
    order: number;
    count: number;
    average_conversion_time: number | null;
    median_conversion_time: number | null;
}

export interface RetentionCohort {
    date: string;
    label: string;
    values: { count: number; label: string }[];
}

export interface Insight {
    id: number;
    short_id: string;
    name: string;
    description: string | null;
    favorited: boolean;
    saved: boolean;
    query: {
        kind: string;
        source: {
            kind: string;
            series?: { name?: string; event?: string; kind: string }[];
            interval?: string;
            dateRange?: { date_from?: string; date_to?: string };
            trendsFilter?: { display?: string };
            funnelsFilter?: { funnelVizType?: string };
        };
    };
    result: TrendResult[] | FunnelStep[] | RetentionCohort[] | null;
    last_refresh: string | null;
    created_at: string;
    updated_at: string;
}

export interface EventProperty {
    name: string;
    property_type: string | null;
    is_numerical: boolean;
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
