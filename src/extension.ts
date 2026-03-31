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
import { StaleFlagService } from './services/staleFlagService';
import { StaleFlagTreeProvider } from './providers/staleFlagTreeProvider';
import { DetailPanelProvider } from './views/DetailPanelProvider';
import { VariantHighlightProvider } from './providers/variantHighlightProvider';
import { VariantCompletionProvider } from './providers/variantCompletionProvider';
import { SessionCodeLensProvider } from './providers/sessionCodeLensProvider';
import { StaleFlagCodeActionProvider } from './providers/staleFlagCodeActionProvider';
import { FlagToggleCodeActionProvider } from './providers/flagToggleCodeActionProvider';
import { EventNamingDiagnosticProvider } from './providers/eventNamingDiagnosticProvider';
import { WrapInFlagCodeActionProvider } from './providers/wrapInFlagCodeActionProvider';
import { FlagCodeLensProvider } from './providers/flagCodeLensProvider';
import { registerGenerateTypeCommand } from './commands/generateTypeCommand';
import { ConfigService } from './services/configService';
import { TelemetryService } from './services/telemetryService';
import { DebugTreeProvider } from './providers/debugTreeProvider';
import { FeatureFlag } from './models/types';
import { Views, Commands, ContextKeys } from './constants';

export function activate(context: vscode.ExtensionContext) {
    const authService = new AuthService(context.secrets, context.globalState);
    const postHogService = new PostHogService(authService);
    const flagCache = new FlagCacheService();
    const eventCache = new EventCacheService();
    const experimentCache = new ExperimentCacheService();
    const configService = new ConfigService();
    const telemetry = new TelemetryService(context.extensionMode);
    telemetry.setAuthService(authService);
    setTelemetryRef(telemetry);

    // Extension self-telemetry
    telemetry.capture('extension_activated');

    // Tree-sitter powered code intelligence
    const treeSitter = new TreeSitterService();

    const BUILTIN_FLAG_FUNCTIONS = ['useFeatureFlag', 'useFeatureFlagPayload', 'useFeatureFlagVariantKey', 'useActiveFeatureFlags'];

    function loadDetectionConfig(): DetectionConfig {
        const vsConfig = vscode.workspace.getConfiguration('posthog');
        const projectConfig = configService.getConfig();
        // Merge .posthog.json values with VS Code settings
        const additionalClientNames = [
            ...vsConfig.get<string[]>('additionalClientNames', []),
            ...(projectConfig?.additionalClientNames ?? []),
        ];
        const additionalFlagFunctions = [
            ...BUILTIN_FLAG_FUNCTIONS,
            ...vsConfig.get<string[]>('additionalFlagFunctions', []),
            ...(projectConfig?.additionalFlagFunctions ?? []),
        ];
        return {
            additionalClientNames,
            additionalFlagFunctions,
            detectNestedClients: vsConfig.get<boolean>('detectNestedClients', true),
        };
    }

    // Load workspace config (.posthog.json) and apply defaults
    configService.loadWorkspaceConfig().then(projectConfig => {
        if (projectConfig) {
            // Apply config host as default if user hasn't set one explicitly
            if (projectConfig.host && authService.getHost() === 'https://us.posthog.com') {
                authService.setHost(projectConfig.host).catch(() => {});
            }
            // Apply config projectId if user hasn't selected one yet
            if (projectConfig.projectId && !authService.getProjectId()) {
                authService.setProjectId(projectConfig.projectId).catch(() => {});
            }
            // Reload detection config with merged values
            treeSitter.updateConfig(loadDetectionConfig());
        }
    }).catch(() => {});

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
        telemetry,
    );

    // Sidebar webview
    const sidebarProvider = new SidebarProvider(
        context.extensionUri,
        authService,
        postHogService,
        flagCache,
        experimentCache,
        detailPanel,
        telemetry,
    );

    // Autocomplete, code actions & inline decorations — all powered by tree-sitter
    const completionProvider = new FlagCompletionProvider(flagCache, treeSitter, telemetry);
    const eventCompletionProvider = new EventCompletionProvider(eventCache, treeSitter, telemetry);
    const codeActionProvider = new FlagCodeActionProvider(flagCache, treeSitter);
    const flagDecorationProvider = new FlagDecorationProvider(flagCache, experimentCache, treeSitter);
    const eventPropertyCompletionProvider = new EventPropertyCompletionProvider(eventCache, postHogService, authService, treeSitter, telemetry);
    const eventDecorationProvider = new EventDecorationProvider(eventCache, treeSitter);
    const variantHighlightProvider = new VariantHighlightProvider(flagCache, experimentCache, treeSitter);
    const flagLinkProvider = new FlagLinkProvider(flagCache, experimentCache, treeSitter);
    const variantCompletionProvider = new VariantCompletionProvider(flagCache, treeSitter, telemetry);
    const staleFlagService = new StaleFlagService(flagCache, experimentCache, treeSitter);
    const staleFlagTreeProvider = new StaleFlagTreeProvider(staleFlagService);
    const staleFlagCodeActionProvider = new StaleFlagCodeActionProvider(flagCache, experimentCache, treeSitter);
    const sessionCodeLensProvider = new SessionCodeLensProvider(authService, postHogService, treeSitter, telemetry);
    const flagToggleCodeActionProvider = new FlagToggleCodeActionProvider(flagCache, treeSitter);
    const eventNamingDiagnosticProvider = new EventNamingDiagnosticProvider(eventCache, treeSitter, telemetry);
    const wrapInFlagCodeActionProvider = new WrapInFlagCodeActionProvider();
    const flagCodeLensProvider = new FlagCodeLensProvider(flagCache, experimentCache, treeSitter, telemetry);

    // All languages supported by tree-sitter grammars
    const languageSelector = treeSitter.supportedLanguages.map(lang => ({ language: lang, scheme: 'file' }));

    // Set initial auth context
    const authed = authService.isAuthenticated();
    vscode.commands.executeCommand('setContext', ContextKeys.IS_AUTHENTICATED, authed);

    // Debug tree — only visible in development mode
    const isDev = context.extensionMode !== vscode.ExtensionMode.Production;
    vscode.commands.executeCommand('setContext', 'posthog.isDevelopment', isDev);
    const debugTreeProvider = new DebugTreeProvider(authService, flagCache, eventCache, experimentCache, context.extensionMode);

    // ── Status bar ──
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    statusBar.command = Commands.SELECT_PROJECT;
    statusBar.tooltip = 'PostHog — click to switch project';

    function formatSyncAge(date: Date | null): string {
        if (!date) { return ''; }
        const seconds = Math.round((Date.now() - date.getTime()) / 1000);
        if (seconds < 60) { return `${seconds}s ago`; }
        const minutes = Math.round(seconds / 60);
        return `${minutes}m ago`;
    }

    function updateStatusBar(error?: boolean) {
        if (!authService.isAuthenticated()) {
            statusBar.hide();
            return;
        }
        const projectName = authService.getProjectName();
        if (error) {
            statusBar.text = '$(warning) PostHog: sync failed';
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            const age = formatSyncAge(flagCache.lastRefreshed);
            const host = authService.getHost();
            let hostShort: string;
            try {
                const hostname = new URL(host).hostname;
                hostShort = hostname === 'us.posthog.com' || hostname === 'us.i.posthog.com' ? 'US'
                    : hostname === 'eu.posthog.com' || hostname === 'eu.i.posthog.com' ? 'EU'
                    : hostname;
            } catch { hostShort = host; }
            const label = projectName ? `PostHog: ${projectName} [${hostShort}]` : `PostHog [${hostShort}]`;
            statusBar.text = age ? `$(cloud) ${label} (synced ${age})` : `$(cloud) ${label}`;
            statusBar.backgroundColor = undefined;
        }
        statusBar.show();
    }

    // ── Cache loading helper ──
    async function loadFlags(projectId: number): Promise<void> {
        const flags = await postHogService.getFeatureFlags(projectId);
        flagCache.update(flags);
    }

    async function loadEvents(projectId: number): Promise<void> {
        const events = await postHogService.getEventDefinitions(projectId);
        eventCache.update(events);
        const names = events.filter(e => !e.hidden && !e.name.startsWith('$')).map(e => e.name);
        const [volumes, sparklines] = await Promise.all([
            postHogService.getEventVolumes(projectId, names),
            postHogService.getEventSparklines(projectId, names),
        ]);
        eventCache.updateVolumes(volumes);
        eventCache.updateSparklines(sparklines);
    }

    async function loadExperiments(projectId: number): Promise<void> {
        const exps = await postHogService.getExperiments(projectId);
        experimentCache.update(exps);
        const active = exps.filter(e => e.start_date);
        await Promise.allSettled(
            active.map(async e => {
                const results = await postHogService.getExperimentResults(projectId, e.id);
                if (results) { experimentCache.updateResults(e.id, results); }
            })
        );
    }

    // ── Flag diff notifications ──
    function notifyFlagChanges(oldFlags: FeatureFlag[], newFlags: FeatureFlag[]): void {
        const oldMap = new Map(oldFlags.map(f => [f.key, f]));
        let count = 0;
        for (const nf of newFlags) {
            if (count >= 3) { break; }
            const of = oldMap.get(nf.key);
            if (of && of.active !== nf.active) {
                vscode.window.showInformationMessage(
                    `PostHog: Flag '${nf.key}' was ${nf.active ? 'enabled' : 'disabled'}`
                );
                count++;
            }
        }
    }

    // ── Pre-load caches on startup if authenticated ──
    if (authed) {
        telemetry.identify();
        const projectId = authService.getProjectId();
        if (projectId) {
            loadFlags(projectId).catch(() => {});
            loadEvents(projectId).catch(() => {});
            loadExperiments(projectId).catch(() => {});
        }
        updateStatusBar();
    }

    // ── Periodic refresh ──
    const REFRESH_INTERVAL_FLAGS = 60_000;       // 1 minute
    const REFRESH_INTERVAL_EVENTS = 300_000;     // 5 minutes
    const REFRESH_INTERVAL_EXPERIMENTS = 300_000; // 5 minutes

    const flagRefreshInterval = setInterval(async () => {
        if (!authService.isAuthenticated()) { return; }
        const projectId = authService.getProjectId();
        if (!projectId) { return; }
        try {
            const oldFlags = flagCache.getFlags();
            const newFlags = await postHogService.getFeatureFlags(projectId);
            notifyFlagChanges(oldFlags, newFlags);
            flagCache.update(newFlags);
            updateStatusBar();
        } catch {
            updateStatusBar(true);
        }
    }, REFRESH_INTERVAL_FLAGS);

    const eventRefreshInterval = setInterval(async () => {
        if (!authService.isAuthenticated()) { return; }
        const projectId = authService.getProjectId();
        if (!projectId) { return; }
        try {
            await loadEvents(projectId);
            updateStatusBar();
        } catch {
            updateStatusBar(true);
        }
    }, REFRESH_INTERVAL_EVENTS);

    const experimentRefreshInterval = setInterval(async () => {
        if (!authService.isAuthenticated()) { return; }
        const projectId = authService.getProjectId();
        if (!projectId) { return; }
        try {
            await loadExperiments(projectId);
            updateStatusBar();
        } catch {
            updateStatusBar(true);
        }
    }, REFRESH_INTERVAL_EXPERIMENTS);

    // Wire experiment cache changes to decoration providers
    experimentCache.onChange(() => {
        flagDecorationProvider.refresh();
        variantHighlightProvider.refresh();
        if (isDev) { debugTreeProvider.refresh(); }
    });
    flagCache.onChange(() => { if (isDev) { debugTreeProvider.refresh(); } });

    context.subscriptions.push(
        statusBar,
        { dispose: () => clearInterval(flagRefreshInterval) },
        { dispose: () => clearInterval(eventRefreshInterval) },
        { dispose: () => clearInterval(experimentRefreshInterval) },
        vscode.window.registerWebviewViewProvider(Views.SIDEBAR, sidebarProvider),
        vscode.languages.registerCompletionItemProvider(languageSelector, completionProvider, "'", '"', '`'),
        vscode.languages.registerCompletionItemProvider(languageSelector, eventCompletionProvider, "'", '"', '`'),
        vscode.languages.registerCompletionItemProvider(languageSelector, eventPropertyCompletionProvider, "'", '"', '`', '{', ',', ' '),
        vscode.languages.registerCompletionItemProvider(languageSelector, variantCompletionProvider, "'", '"', '`'),
        vscode.languages.registerCodeActionsProvider(languageSelector, codeActionProvider, {
            providedCodeActionKinds: FlagCodeActionProvider.providedCodeActionKinds,
        }),
        vscode.languages.registerCodeActionsProvider(languageSelector, staleFlagCodeActionProvider, {
            providedCodeActionKinds: StaleFlagCodeActionProvider.providedCodeActionKinds,
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
        vscode.window.registerTreeDataProvider(Views.STALE_FLAGS, staleFlagTreeProvider),
        vscode.window.registerTreeDataProvider('posthog-debug', debugTreeProvider),
        vscode.commands.registerCommand('posthog.debugCopy', (value: string) => {
            vscode.env.clipboard.writeText(value);
            vscode.window.showInformationMessage(`Copied: ${value}`);
        }),
        vscode.commands.registerCommand('posthog.debugRefresh', () => debugTreeProvider.refresh()),
        ...registerAuthCommands(authService, postHogService, sidebarProvider, telemetry),
        ...registerFeatureFlagCommands(authService, postHogService, sidebarProvider, flagCache, telemetry),
        ...registerStaleFlagCommands(staleFlagService, telemetry),
        registerGenerateTypeCommand(flagCache, treeSitter, telemetry),
        vscode.commands.registerCommand(Commands.SHOW_SESSIONS, async (key: string, type: 'event' | 'flag') => {
            detailPanel.showSessions(key, type);
        }),
        ...flagDecorationProvider.register(),
        ...eventDecorationProvider.register(),
        ...variantHighlightProvider.register(),
        vscode.languages.registerCodeLensProvider(languageSelector, sessionCodeLensProvider),
        sessionCodeLensProvider.startAutoRefresh(),
        vscode.languages.registerCodeActionsProvider(languageSelector, flagToggleCodeActionProvider, {
            providedCodeActionKinds: FlagToggleCodeActionProvider.providedCodeActionKinds,
        }),
        vscode.languages.registerCodeActionsProvider(languageSelector, wrapInFlagCodeActionProvider, {
            providedCodeActionKinds: WrapInFlagCodeActionProvider.providedCodeActionKinds,
        }),
        ...eventNamingDiagnosticProvider.register(),
        vscode.languages.registerCodeLensProvider(languageSelector, flagCodeLensProvider),
        vscode.commands.registerCommand(Commands.TOGGLE_FLAG, async (flag: FeatureFlag) => {
            const projectId = authService.getProjectId();
            if (!projectId) { return; }
            const confirm = await vscode.window.showWarningMessage(
                `Toggle flag '${flag.key}' to ${flag.active ? 'DISABLED' : 'ENABLED'}?`,
                { modal: true }, 'Confirm',
            );
            if (confirm !== 'Confirm') { return; }
            try {
                await postHogService.updateFeatureFlag(projectId, flag.id, { active: !flag.active });
                const flags = await postHogService.getFeatureFlags(projectId);
                flagCache.update(flags);
                telemetry.capture('flag_toggled', { flag_key: flag.key, new_state: !flag.active ? 'enabled' : 'disabled' });
                vscode.window.showInformationMessage(`PostHog: Flag '${flag.key}' ${!flag.active ? 'enabled' : 'disabled'}.`);
            } catch (err) {
                vscode.window.showErrorMessage(`PostHog: Failed to toggle flag. ${err instanceof Error ? err.message : ''}`);
            }
        }),
        vscode.commands.registerCommand(Commands.FIND_FLAG, async () => {
            const flags = flagCache.getFlags().filter(f => !f.deleted);
            const items = flags.map(f => ({
                label: f.key,
                description: f.active ? 'Active' : 'Inactive',
                detail: f.name !== f.key ? f.name : undefined,
                flag: f,
            }));
            const pick = await vscode.window.showQuickPick(items, {
                placeHolder: 'Search for a feature flag...',
                matchOnDescription: true,
                matchOnDetail: true,
            });
            if (pick) {
                telemetry.capture('flag_found_via_picker', { flag_key: pick.flag.key });
                vscode.commands.executeCommand(Commands.SHOW_FLAG_DETAIL, pick.flag.key);
            }
        }),
        vscode.commands.registerCommand(Commands.WRAP_IN_FLAG, async (uri: vscode.Uri, range: vscode.Range) => {
            const flags = flagCache.getFlags().filter(f => !f.deleted);
            const items = flags.map(f => ({ label: f.key, description: f.active ? 'Active' : 'Inactive' }));
            const pick = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a flag key (or type a new one)...',
                matchOnDescription: true,
            });
            const flagKey = pick?.label;
            if (!flagKey) { return; }

            const doc = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(doc);
            const selectedText = doc.getText(range);
            const startLine = doc.lineAt(range.start.line);
            const indent = startLine.text.substring(0, startLine.firstNonWhitespaceCharacterIndex);
            const innerIndent = indent + '    ';

            const indentedBody = selectedText
                .split('\n')
                .map(line => line.length > 0 ? innerIndent + line.trimStart() : line)
                .join('\n');

            const wrapped = `${indent}if (posthog.isFeatureEnabled('${flagKey}')) {\n${indentedBody}\n${indent}}`;

            await editor.edit(editBuilder => {
                editBuilder.replace(range, wrapped);
            });
            telemetry.capture('flag_wrapped_in_code', { flag_key: flagKey, language: doc.languageId });
        }),
        vscode.commands.registerCommand(Commands.FIND_FLAG_REFERENCES, async (flagKey: string) => {
            telemetry.capture('flag_references_searched', { flag_key: flagKey });
            vscode.commands.executeCommand('workbench.action.findInFiles', {
                query: flagKey,
                isRegex: false,
                triggerSearch: true,
            });
        }),
        vscode.commands.registerCommand(Commands.EXPORT_STALE_FLAGS, async () => {
            const results = staleFlagService.getStaleFlags();
            if (!results || results.length === 0) {
                vscode.window.showInformationMessage('PostHog: No stale flags found. Run a scan first.');
                return;
            }
            const lines = results.map(r => `${r.key}\t${r.reason}\t${r.references.length} references`);
            const content = ['Flag Key\tReason\tReferences', ...lines].join('\n');
            const doc = await vscode.workspace.openTextDocument({ content, language: 'plaintext' });
            await vscode.window.showTextDocument(doc);
            telemetry.capture('stale_flags_exported', { stale_count: results.length });
        }),
        { dispose: () => treeSitter.dispose() },
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('posthog.additionalClientNames') ||
                e.affectsConfiguration('posthog.additionalFlagFunctions') ||
                e.affectsConfiguration('posthog.detectNestedClients')) {
                treeSitter.updateConfig(loadDetectionConfig());
            }
            if (e.affectsConfiguration('posthog.showInlineDecorations')) {
                // Re-trigger decoration providers by firing a fake editor change
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    vscode.window.showTextDocument(editor.document, editor.viewColumn);
                }
            }
        }),
        // Multi-project awareness: detect when a file from a different workspace folder is opened
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (!editor) { return; }
            const fileUri = editor.document.uri;
            const folder = vscode.workspace.getWorkspaceFolder(fileUri);
            if (!folder) { return; }

            const folderConfig = configService.getConfigForFolder(folder.uri.toString());
            if (!folderConfig?.projectId) { return; }

            const currentProjectId = authService.getProjectId();
            if (currentProjectId && folderConfig.projectId !== currentProjectId) {
                const folderName = folder.name;
                vscode.window.showInformationMessage(
                    `This folder (${folderName}) is configured for a different PostHog project (ID: ${folderConfig.projectId}). Switch project?`,
                    'Switch', 'Ignore'
                ).then(choice => {
                    if (choice === 'Switch') {
                        authService.setProjectId(folderConfig.projectId!).then(() => {
                            if (folderConfig.host) {
                                authService.setHost(folderConfig.host).catch(() => {});
                            }
                            sidebarProvider.refresh();
                            telemetry.capture('project_switched_via_folder', { projectId: folderConfig.projectId });
                        }).catch(() => {});
                    }
                });
            }
        }),
        // Reload .posthog.json when it changes
        vscode.workspace.onDidSaveTextDocument(doc => {
            if (doc.fileName.endsWith('.posthog.json')) {
                configService.loadWorkspaceConfig().then(() => {
                    treeSitter.updateConfig(loadDetectionConfig());
                }).catch(() => {});
            }
        }),
    );
}

let _telemetry: TelemetryService | undefined;
export function setTelemetryRef(t: TelemetryService): void { _telemetry = t; }
export async function deactivate(): Promise<void> {
    if (_telemetry) { await _telemetry.shutdown(); }
}
