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
    GENERATE_FLAG_TYPES: 'posthog.generateFlagTypes',
    LAUNCH_EXPERIMENT: 'posthog.launchExperiment',
    STOP_EXPERIMENT: 'posthog.stopExperiment',
    CLEANUP_ALL_STALE_FLAGS: 'posthog.cleanupAllStaleFlags',
    EXPORT_STALE_FLAGS: 'posthog.exportStaleFlags',
    TOGGLE_FLAG: 'posthog.toggleFlag',
    FIND_FLAG: 'posthog.findFlag',
    WRAP_IN_FLAG: 'posthog.wrapInFlag',
    FIND_FLAG_REFERENCES: 'posthog.findFlagReferences',
    GENERATE_TYPE: 'posthog.generateType',
} as const;

export const Views = {
    SIDEBAR: 'posthog-sidebar',
    STALE_FLAGS: 'posthog-stale-flags',
} as const;

export const ContextKeys = {
    IS_AUTHENTICATED: 'posthog.isAuthenticated',
} as const;

export const StorageKeys = {
    OAUTH_SESSION: 'posthog.oauth.session',
    HOST: 'posthog.host',
    PROJECT_ID: 'posthog.projectId',
    PROJECT_NAME: 'posthog.projectName',
    IS_AUTHENTICATED: 'posthog.isAuthenticated',
    CAN_WRITE: 'posthog.canWrite',
} as const;

export const Defaults = {
    HOST: 'https://us.posthog.com',
} as const;