import * as vscode from 'vscode';
import { AuthService } from './services/authService';
import { PostHogService } from './services/postHogService';
import { FlagCacheService } from './services/flagCacheService';
import { EventCacheService } from './services/eventCacheService';
import { SidebarProvider } from './views/SidebarProvider';
import { FlagCompletionProvider } from './providers/flagCompletionProvider';
import { EventCompletionProvider } from './providers/eventCompletionProvider';
import { FlagCodeActionProvider } from './providers/flagCodeActionProvider';
import { FlagDecorationProvider } from './providers/flagDecorationProvider';
import { EventDecorationProvider } from './providers/eventDecorationProvider';
import { EventPropertyCompletionProvider } from './providers/eventPropertyCompletionProvider';
import { ExperimentCacheService } from './services/experimentCacheService';
import { registerAuthCommands } from './commands/authCommands';
import { FlagLinkProvider } from './providers/flagLinkProvider';
import { registerFeatureFlagCommands } from './commands/featureFlagCommands';
import { DetailPanelProvider } from './views/DetailPanelProvider';
import { Views, Commands, ContextKeys } from './constants';

const SUPPORTED_LANGUAGES = [
    'javascript',
    'typescript',
    'javascriptreact',
    'typescriptreact',
];

export function activate(context: vscode.ExtensionContext) {
    const authService = new AuthService(context.secrets, context.globalState);
    const postHogService = new PostHogService(authService);
    const flagCache = new FlagCacheService();
    const eventCache = new EventCacheService();
    const experimentCache = new ExperimentCacheService();

    // Detail panels (full editor tabs)
    const detailPanel = new DetailPanelProvider(
        context.extensionUri,
        authService,
        postHogService,
        flagCache,
    );

    // Sidebar webview
    const sidebarProvider = new SidebarProvider(
        context.extensionUri,
        authService,
        postHogService,
        flagCache,
        experimentCache,
        detailPanel,
    );

    // Autocomplete, code actions & inline decorations
    const completionProvider = new FlagCompletionProvider(flagCache);
    const eventCompletionProvider = new EventCompletionProvider(eventCache);
    const codeActionProvider = new FlagCodeActionProvider(flagCache);
    const flagDecorationProvider = new FlagDecorationProvider(flagCache, experimentCache);
    const eventPropertyCompletionProvider = new EventPropertyCompletionProvider(eventCache, postHogService, authService);
    const eventDecorationProvider = new EventDecorationProvider(eventCache);
    const flagLinkProvider = new FlagLinkProvider(flagCache, experimentCache);
    const languageSelector = SUPPORTED_LANGUAGES.map(lang => ({ language: lang, scheme: 'file' }));

    // Set initial auth context
    const authed = authService.isAuthenticated();
    vscode.commands.executeCommand('setContext', ContextKeys.IS_AUTHENTICATED, authed);

    // Pre-load caches on startup if authenticated
    if (authed) {
        const projectId = authService.getProjectId();
        if (projectId) {
            postHogService.getFeatureFlags(projectId).then(flags => flagCache.update(flags)).catch(() => {});
            postHogService.getEventDefinitions(projectId).then(async events => {
                eventCache.update(events);
                const names = events.filter(e => !e.hidden && !e.name.startsWith('$')).map(e => e.name);
                const volumes = await postHogService.getEventVolumes(projectId, names);
                eventCache.updateVolumes(volumes);
            }).catch(() => {});
            postHogService.getExperiments(projectId).then(async exps => {
                experimentCache.update(exps);
                // Prefetch results for running/completed experiments
                const active = exps.filter(e => e.start_date);
                await Promise.allSettled(
                    active.map(async e => {
                        const results = await postHogService.getExperimentResults(projectId, e.id);
                        if (results) { experimentCache.updateResults(e.id, results); }
                    })
                );
            }).catch(() => {});
        }
    }

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(Views.SIDEBAR, sidebarProvider),
        vscode.languages.registerCompletionItemProvider(languageSelector, completionProvider, "'", '"', '`'),
        vscode.languages.registerCompletionItemProvider(languageSelector, eventCompletionProvider, "'", '"', '`'),
        vscode.languages.registerCompletionItemProvider(languageSelector, eventPropertyCompletionProvider, "'", '"', '`', '{', ',', ' '),
        vscode.languages.registerCodeActionsProvider(languageSelector, codeActionProvider, {
            providedCodeActionKinds: FlagCodeActionProvider.providedCodeActionKinds,
        }),
        vscode.languages.registerDocumentLinkProvider(languageSelector, flagLinkProvider),
        vscode.commands.registerCommand(Commands.SHOW_FLAG_DETAIL, async (flagKey: string) => {
            const flag = flagCache.getFlag(flagKey);
            if (flag) {
                detailPanel.showFlag(flag);
            } else {
                sidebarProvider.navigateToFlag(flagKey);
            }
        }),
        vscode.commands.registerCommand(Commands.SHOW_EXPERIMENT_DETAIL, async (flagKey: string) => {
            const exp = experimentCache.getByFlagKey(flagKey);
            if (exp) {
                const results = experimentCache.getResults(exp.id);
                detailPanel.showExperiment(exp, results);
            } else {
                sidebarProvider.navigateToExperiment(flagKey);
            }
        }),
        ...registerAuthCommands(authService, postHogService, sidebarProvider),
        ...registerFeatureFlagCommands(authService, postHogService, sidebarProvider, flagCache),
        ...flagDecorationProvider.register(),
        ...eventDecorationProvider.register(),
    );
}

export function deactivate() {}
