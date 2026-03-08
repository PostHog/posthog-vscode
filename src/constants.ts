export const Commands = {
    SIGN_IN: 'codehog.signIn',
    SIGN_OUT: 'codehog.signOut',
    SELECT_PROJECT: 'codehog.selectProject',
    REFRESH_FEATURE_FLAGS: 'codehog.refreshFeatureFlags',
    COPY_FLAG_KEY: 'codehog.copyFlagKey',
    OPEN_FLAG_IN_BROWSER: 'codehog.openFlagInBrowser',
    CREATE_FLAG: 'codehog.createFlag',
} as const;

export const Views = {
    SIDEBAR: 'codehog-sidebar',
} as const;

export const ContextKeys = {
    IS_AUTHENTICATED: 'codehog.isAuthenticated',
} as const;

export const StorageKeys = {
    API_KEY: 'codehog.apiKey',
    HOST: 'codehog.host',
    PROJECT_ID: 'codehog.projectId',
    IS_AUTHENTICATED: 'codehog.isAuthenticated',
} as const;

export const Defaults = {
    HOST: 'https://us.posthog.com',
    HOSTS: [
        { label: 'US Cloud', url: 'https://us.posthog.com' },
        { label: 'EU Cloud', url: 'https://eu.posthog.com' },
        { label: 'Self-hosted', url: '' },
    ],
} as const;
