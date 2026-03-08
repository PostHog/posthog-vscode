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
import { ExperimentCacheService } from './services/experimentCacheService';
import { registerAuthCommands } from './commands/authCommands';
import { registerFeatureFlagCommands } from './commands/featureFlagCommands';
import { Views, ContextKeys } from './constants';

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

    // Sidebar webview
    const sidebarProvider = new SidebarProvider(
        context.extensionUri,
        authService,
        postHogService,
        flagCache,
    );

    // Autocomplete, code actions & inline decorations
    const completionProvider = new FlagCompletionProvider(flagCache);
    const eventCompletionProvider = new EventCompletionProvider(eventCache);
    const codeActionProvider = new FlagCodeActionProvider(flagCache);
    const flagDecorationProvider = new FlagDecorationProvider(flagCache, experimentCache);
    const eventDecorationProvider = new EventDecorationProvider(eventCache);
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
            postHogService.getExperiments(projectId).then(exps => experimentCache.update(exps)).catch(() => {});
        }
    }

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(Views.SIDEBAR, sidebarProvider),
        vscode.languages.registerCompletionItemProvider(languageSelector, completionProvider, "'", '"', '`'),
        vscode.languages.registerCompletionItemProvider(languageSelector, eventCompletionProvider, "'", '"', '`'),
        vscode.languages.registerCodeActionsProvider(languageSelector, codeActionProvider, {
            providedCodeActionKinds: FlagCodeActionProvider.providedCodeActionKinds,
        }),
        ...registerAuthCommands(authService, postHogService, sidebarProvider),
        ...registerFeatureFlagCommands(authService, postHogService, sidebarProvider),
        ...flagDecorationProvider.register(),
        ...eventDecorationProvider.register(),
    );
}

export function deactivate() {}
