import * as vscode from 'vscode';
import { AuthService } from '../services/authService';
import { PostHogService } from '../services/postHogService';
import { TreeSitterService } from '../services/treeSitterService';
import { TelemetryService } from '../services/telemetryService';
import { Commands } from '../constants';

const FLAG_METHODS = new Set([
    'getFeatureFlag', 'isFeatureEnabled', 'getFeatureFlagPayload',
    'getFeatureFlagResult', 'isFeatureFlagEnabled', 'getRemoteConfig',
    'get_feature_flag', 'is_feature_enabled', 'get_feature_flag_payload', 'get_remote_config',
    'GetFeatureFlag', 'IsFeatureEnabled', 'GetFeatureFlagPayload',
]);

const CAPTURE_METHODS = new Set(['capture', 'Capture']);

interface SessionCodeLens extends vscode.CodeLens {
    data: { key: string; type: 'event' | 'flag' };
}

export class SessionCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this._onDidChange.event;

    private cache = new Map<string, { sessions: number; users: number; ts: number }>();
    private pending = new Set<string>();
    private refreshTimer: ReturnType<typeof setTimeout> | undefined;
    private lastCapture = new Map<string, number>();

    constructor(
        private readonly authService: AuthService,
        private readonly postHogService: PostHogService,
        private readonly treeSitter: TreeSitterService,
        private readonly telemetry: TelemetryService,
    ) {}

    async provideCodeLenses(doc: vscode.TextDocument): Promise<vscode.CodeLens[]> {
        if (!this.treeSitter.isSupported(doc.languageId)) { return []; }
        if (!this.authService.isAuthenticated()) { return []; }

        const calls = await this.treeSitter.findPostHogCalls(doc);
        const lenses: SessionCodeLens[] = [];
        const needsFetch = { events: new Set<string>(), flags: new Set<string>() };

        for (const call of calls) {
            const isFlag = FLAG_METHODS.has(call.method);
            const isEvent = CAPTURE_METHODS.has(call.method);
            if (!isFlag && !isEvent) { continue; }

            const type = isEvent ? 'event' as const : 'flag' as const;
            const key = call.key;
            const range = new vscode.Range(call.line, 0, call.line, 0);

            const cached = this.cache.get(key);
            const stale = !cached || (Date.now() - cached.ts > 60_000);

            if (stale && !this.pending.has(key)) {
                if (isEvent) { needsFetch.events.add(key); }
                else { needsFetch.flags.add(key); }
            }

            const lens = new vscode.CodeLens(range) as SessionCodeLens;
            lens.data = { key, type };

            if (cached) {
                lens.command = this.buildCommand(key, type, cached.sessions, cached.users);
            }

            lenses.push(lens);
        }

        // Kick off batch fetch for uncached keys
        if (needsFetch.events.size > 0 || needsFetch.flags.size > 0) {
            this.fetchAndRefresh([...needsFetch.events], [...needsFetch.flags]);
        }

        if (lenses.length > 0) {
            const docKey = doc.uri.toString();
            if (Date.now() - (this.lastCapture.get(docKey) || 0) > 60_000) {
                this.lastCapture.set(docKey, Date.now());
                this.telemetry.capture('codelens_provided', { type: 'session', count: lenses.length, language: doc.languageId });
            }
        }

        return lenses;
    }

    resolveCodeLens(lens: vscode.CodeLens): vscode.CodeLens {
        const sessionLens = lens as SessionCodeLens;
        if (!sessionLens.data) { return lens; }

        const cached = this.cache.get(sessionLens.data.key);
        if (cached) {
            lens.command = this.buildCommand(sessionLens.data.key, sessionLens.data.type, cached.sessions, cached.users);
        } else {
            lens.command = {
                title: '$(eye)  loading sessions...',
                command: '',
            };
        }

        return lens;
    }

    private buildCommand(key: string, type: 'event' | 'flag', sessions: number, users: number): vscode.Command {
        if (sessions === 0) {
            return {
                title: '$(eye)  no sessions in 24h',
                command: Commands.SHOW_SESSIONS,
                arguments: [key, type],
            };
        }

        const sessionStr = sessions === 1 ? '1 session' : `${this.fmtNum(sessions)} sessions`;
        const userStr = users === 1 ? '1 user' : `${this.fmtNum(users)} users`;

        return {
            title: `$(eye)  ${sessionStr} · ${userStr} in 24h`,
            command: Commands.SHOW_SESSIONS,
            arguments: [key, type],
        };
    }

    private fmtNum(n: number): string {
        if (n >= 1_000_000) { return `${(n / 1_000_000).toFixed(1)}M`; }
        if (n >= 1_000) { return `${(n / 1_000).toFixed(1)}K`; }
        return String(n);
    }

    private async fetchAndRefresh(events: string[], flags: string[]) {
        const allKeys = [...events, ...flags];
        for (const k of allKeys) { this.pending.add(k); }

        const projectId = this.authService.getProjectId();
        if (!projectId) { return; }

        try {
            const counts = await this.postHogService.getSessionCounts(projectId, events, flags);

            const now = Date.now();
            for (const key of allKeys) {
                const data = counts.get(key) ?? { sessions: 0, users: 0 };
                this.cache.set(key, { ...data, ts: now });
            }
        } finally {
            for (const k of allKeys) { this.pending.delete(k); }
        }

        this._onDidChange.fire();
    }

    /** Periodically refresh all cached keys */
    startAutoRefresh(): vscode.Disposable {
        this.refreshTimer = setInterval(() => {
            if (this.cache.size > 0) {
                const events: string[] = [];
                const flags: string[] = [];

                // Re-fetch everything that's in the cache
                for (const [key, entry] of this.cache) {
                    if (Date.now() - entry.ts > 60_000) {
                        // We don't know the type from cache alone, so we'll put in events
                        // The query handles both, and misses are just zero results
                        events.push(key);
                    }
                }

                if (events.length > 0) {
                    this.fetchAndRefresh(events, flags);
                }
            }
        }, 120_000);

        return { dispose: () => { if (this.refreshTimer) { clearInterval(this.refreshTimer); } } };
    }
}
