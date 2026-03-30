export const Commands = {
    SIGN_IN: 'posthog.signIn',
    SIGN_OUT: 'posthog.signOut',
    SELECT_PROJECT: 'posthog.selectProject',
    REFRESH_FEATURE_FLAGS: 'posthog.refreshFeatureFlags',
    COPY_FLAG_KEY: 'posthog.copyFlagKey',
    OPEN_FLAG_IN_BROWSER: 'posthog.openFlagInBrowser',
    CREATE_FLAG: 'posthog.createFlag',
    SHOW_FLAG_DETAIL: 'posthog.showFlagDetail',
    SHOW_EXPERIMENT_DETAIL: 'posthog.showExperimentDetail',
    SCAN_STALE_FLAGS: 'posthog.scanStaleFlags',
    CLEANUP_STALE_FLAG: 'posthog.cleanupStaleFlag',
    SHOW_SESSIONS: 'posthog.showSessions',
} as const;

export const Views = {
    SIDEBAR: 'posthog-sidebar',
    STALE_FLAGS: 'posthog-stale-flags',
} as const;

export const ContextKeys = {
    IS_AUTHENTICATED: 'posthog.isAuthenticated',
} as const;

export const StorageKeys = {
    API_KEY: 'posthog.apiKey',
    HOST: 'posthog.host',
    PROJECT_ID: 'posthog.projectId',
    IS_AUTHENTICATED: 'posthog.isAuthenticated',
} as const;

export const Defaults = {
    HOST: 'https://us.posthog.com',
    HOSTS: [
        { label: 'US Cloud', url: 'https://us.posthog.com' },
        { label: 'EU Cloud', url: 'https://eu.posthog.com' },
        { label: 'Self-hosted', url: '' },
    ],
} as const;
