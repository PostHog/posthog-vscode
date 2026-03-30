import * as vscode from 'vscode';
import { AuthService } from './services/authService';
import { PostHogService } from './services/postHogService';
import { FlagCacheService } from './services/flagCacheService';
import { EventCacheService } from './services/eventCacheService';
import { TreeSitterService, DetectionConfig } from './services/treeSitterService';
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
import { registerStaleFlagCommands } from './commands/staleFlagCommands';
import { CaptureCodeActionProvider, registerCaptureCommands } from './providers/captureCodeActionProvider';
import { StaleFlagService } from './services/staleFlagService';
import { StaleFlagTreeProvider } from './providers/staleFlagTreeProvider';
import { DetailPanelProvider } from './views/DetailPanelProvider';
import { VariantHighlightProvider } from './providers/variantHighlightProvider';
import { SessionCodeLensProvider } from './providers/sessionCodeLensProvider';
import { Views, Commands, ContextKeys } from './constants';

export function activate(context: vscode.ExtensionContext) {
    const authService = new AuthService(context.secrets, context.globalState);
    const postHogService = new PostHogService(authService);
    const flagCache = new FlagCacheService();
    const eventCache = new EventCacheService();
    const experimentCache = new ExperimentCacheService();

    // Tree-sitter powered code intelligence
    const treeSitter = new TreeSitterService();

    function loadDetectionConfig(): DetectionConfig {
        const config = vscode.workspace.getConfiguration('posthog');
        return {
            additionalClientNames: config.get<string[]>('additionalClientNames', []),
            additionalFlagFunctions: config.get<string[]>('additionalFlagFunctions', []),
            detectNestedClients: config.get<boolean>('detectNestedClients', false),
        };
    }
    treeSitter.updateConfig(loadDetectionConfig());

    treeSitter.initialize(context.extensionPath).catch(err => {
        console.warn('[PostHog] Tree-sitter initialization failed:', err);
    });

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

    // Autocomplete, code actions & inline decorations — all powered by tree-sitter
    const completionProvider = new FlagCompletionProvider(flagCache, treeSitter);
    const eventCompletionProvider = new EventCompletionProvider(eventCache, treeSitter);
    const codeActionProvider = new FlagCodeActionProvider(flagCache, treeSitter);
    const flagDecorationProvider = new FlagDecorationProvider(flagCache, experimentCache, treeSitter);
    const eventPropertyCompletionProvider = new EventPropertyCompletionProvider(eventCache, postHogService, authService, treeSitter);
    const eventDecorationProvider = new EventDecorationProvider(eventCache, treeSitter);
    const variantHighlightProvider = new VariantHighlightProvider(flagCache, experimentCache, treeSitter);
    const flagLinkProvider = new FlagLinkProvider(flagCache, experimentCache, treeSitter);
    const captureCodeActionProvider = new CaptureCodeActionProvider(treeSitter);
    const staleFlagService = new StaleFlagService(flagCache, experimentCache, treeSitter);
    const staleFlagTreeProvider = new StaleFlagTreeProvider(staleFlagService);
    const sessionCodeLensProvider = new SessionCodeLensProvider(authService, postHogService, treeSitter);

    // All languages supported by tree-sitter grammars
    const languageSelector = treeSitter.supportedLanguages.map(lang => ({ language: lang, scheme: 'file' }));

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
                const [volumes, sparklines] = await Promise.all([
                    postHogService.getEventVolumes(projectId, names),
                    postHogService.getEventSparklines(projectId, names),
                ]);
                eventCache.updateVolumes(volumes);
                eventCache.updateSparklines(sparklines);
            }).catch(() => {});
            postHogService.getExperiments(projectId).then(async exps => {
                experimentCache.update(exps);
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
        vscode.languages.registerCodeActionsProvider(languageSelector, captureCodeActionProvider, {
            providedCodeActionKinds: CaptureCodeActionProvider.providedCodeActionKinds,
        }),
        vscode.window.registerTreeDataProvider(Views.STALE_FLAGS, staleFlagTreeProvider),
        ...registerAuthCommands(authService, postHogService, sidebarProvider),
        ...registerFeatureFlagCommands(authService, postHogService, sidebarProvider, flagCache),
        ...registerStaleFlagCommands(staleFlagService),
        ...registerCaptureCommands(),
        vscode.commands.registerCommand(Commands.SHOW_SESSIONS, async (key: string, type: 'event' | 'flag') => {
            detailPanel.showSessions(key, type);
        }),
        ...flagDecorationProvider.register(),
        ...eventDecorationProvider.register(),
        ...variantHighlightProvider.register(),
        vscode.languages.registerCodeLensProvider(languageSelector, sessionCodeLensProvider),
        sessionCodeLensProvider.startAutoRefresh(),
        { dispose: () => treeSitter.dispose() },
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('posthog.additionalClientNames') ||
                e.affectsConfiguration('posthog.additionalFlagFunctions') ||
                e.affectsConfiguration('posthog.detectNestedClients')) {
                treeSitter.updateConfig(loadDetectionConfig());
            }
        }),
    );
}

export function deactivate() {}
