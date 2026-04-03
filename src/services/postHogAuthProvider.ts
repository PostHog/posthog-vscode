import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { StorageKeys } from '../constants';

export const AUTH_PROVIDER_ID = 'posthog';
export const AUTH_PROVIDER_LABEL = 'PostHog';

const DEFAULT_OAUTH_AUTHORITY = 'https://oauth.posthog.com';
const CLIENT_ID = 'ih1owmVJOIWdlZYiWLMMkjr9zLR3Hik6TojNcqQN';
export const SCOPES = [
    'event_definition:read',
    'event_definition:write',
    'experiment:read',
    'experiment:write',
    'feature_flag:read',
    'feature_flag:write',
    'insight:read',
    'organization:read',
    'project:read',
    'query:read',
    'user:read',
];

const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

interface StoredSession {
    id: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    account: { id: string; label: string };
    scopes: string[];
    host: string;
    scopedTeams: number[];
}

interface PendingAuth {
    codeVerifier: string;
    resolve: (session: vscode.AuthenticationSession) => void;
    reject: (err: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

export class PostHogAuthenticationProvider implements vscode.AuthenticationProvider, vscode.UriHandler, vscode.Disposable {
    private readonly _onDidChangeSessions = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
    readonly onDidChangeSessions = this._onDidChangeSessions.event;

    private readonly pendingAuths = new Map<string, PendingAuth>();
    private cachedSession: StoredSession | null | undefined = undefined; // undefined = not yet loaded
    private oauthAuthority = DEFAULT_OAUTH_AUTHORITY;

    constructor(private readonly secretStorage: vscode.SecretStorage) {}

    /** Override the OAuth authority for dev mode (e.g. http://localhost:8010) */
    async setOAuthAuthority(authority: string): Promise<void> {
        this.oauthAuthority = authority.replace(/\/+$/, '');
    }

    dispose(): void {
        for (const pending of this.pendingAuths.values()) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Auth provider disposed'));
        }
        this.pendingAuths.clear();
        this._onDidChangeSessions.dispose();
    }

    // ── AuthenticationProvider interface ──

    // Plural name + array return required by VS Code's AuthenticationProvider interface.
    // We only ever store one session; this wraps it in a single-element array.
    async getSessions(): Promise<vscode.AuthenticationSession[]> {
        const session = await this.loadSession();
        if (!session) { return []; }

        return [{
            id: session.id,
            accessToken: session.accessToken,
            account: session.account,
            scopes: session.scopes,
        }];
    }

    async createSession(scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
        const { codeVerifier, codeChallenge } = this.generatePKCE();
        const state = crypto.randomBytes(16).toString('hex');

        const redirectUri = `${vscode.env.uriScheme}://posthog.posthog-vscode/auth/callback`;
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: CLIENT_ID,
            redirect_uri: redirectUri,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            state,
            scope: scopes.join(' '),
        });

        const authUrl = vscode.Uri.parse(`${this.oauthAuthority}/authorize?${params.toString()}`);

        return new Promise<vscode.AuthenticationSession>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingAuths.delete(state);
                reject(new Error('Authentication timed out'));
            }, AUTH_TIMEOUT_MS);

            this.pendingAuths.set(state, { codeVerifier, resolve, reject, timeout });

            vscode.env.openExternal(authUrl).then(opened => {
                if (!opened) {
                    clearTimeout(timeout);
                    this.pendingAuths.delete(state);
                    reject(new Error('Failed to open browser for authentication'));
                }
            });
        });
    }

    async removeSession(): Promise<void> {
        const session = await this.loadSession();
        await this.storeSession(null);

        if (session) {
            this._onDidChangeSessions.fire({
                added: [],
                removed: [{ id: session.id, accessToken: session.accessToken, account: session.account, scopes: session.scopes }],
                changed: [],
            });
        }
    }

    // ── UriHandler interface ──

    async handleUri(uri: vscode.Uri): Promise<void> {
        const params = new URLSearchParams(uri.query);
        const code = params.get('code');
        const state = params.get('state');
        const error = params.get('error');

        if (error) {
            const pending = state ? this.pendingAuths.get(state) : undefined;
            if (pending) {
                clearTimeout(pending.timeout);
                this.pendingAuths.delete(state!);
                pending.reject(new Error(`OAuth error: ${error}`));
            }
            return;
        }

        if (!code || !state) { return; }

        const pending = this.pendingAuths.get(state);
        if (!pending) { return; }

        clearTimeout(pending.timeout);
        this.pendingAuths.delete(state);

        try {
            const session = await this.exchangeCodeForSession(code, pending.codeVerifier);
            pending.resolve(session);
        } catch (err) {
            pending.reject(err instanceof Error ? err : new Error(String(err)));
        }
    }

    // ── Token management ──

    async getValidAccessToken(): Promise<string> {
        const session = await this.loadSession();
        if (!session) {
            throw new Error('Not authenticated');
        }

        if (session.expiresAt - Date.now() < REFRESH_BUFFER_MS) {
            return this.refreshSession(session);
        }

        return session.accessToken;
    }

    async forceRefresh(): Promise<string> {
        const session = await this.loadSession();
        if (!session) {
            throw new Error('Not authenticated');
        }
        return this.refreshSession(session);
    }

    async getSessionHost(): Promise<string | undefined> {
        const session = await this.loadSession();
        return session?.host;
    }

    async getScopedTeams(): Promise<number[]> {
        const session = await this.loadSession();
        return session?.scopedTeams ?? [];
    }

    // ── Private helpers ──

    private async exchangeCodeForSession(code: string, codeVerifier: string): Promise<vscode.AuthenticationSession> {
        const redirectUri = `${vscode.env.uriScheme}://posthog.posthog-vscode/auth/callback`;

        const tokenResponse = await fetch(`${this.oauthAuthority}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: CLIENT_ID,
                code,
                redirect_uri: redirectUri,
                code_verifier: codeVerifier,
            }).toString(),
        });

        if (!tokenResponse.ok) {
            const body = await tokenResponse.text();
            throw new Error(`Token exchange failed: ${body}`);
        }

        const tokens = await tokenResponse.json() as {
            access_token: string;
            refresh_token: string;
            expires_in: number;
            posthog_base_url: string;
            scoped_teams?: number[];
        };

        const host = tokens.posthog_base_url.replace(/\/+$/, '');
        const userInfo = await this.fetchUserInfo(host, tokens.access_token);

        const stored: StoredSession = {
            id: crypto.randomUUID(),
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: Date.now() + tokens.expires_in * 1000,
            account: {
                id: userInfo?.uuid ?? 'unknown',
                label: userInfo?.email ?? userInfo?.first_name ?? 'PostHog User',
            },
            scopes: SCOPES,
            host,
            scopedTeams: tokens.scoped_teams ?? [],
        };

        await this.storeSession(stored);

        const authSession: vscode.AuthenticationSession = {
            id: stored.id,
            accessToken: stored.accessToken,
            account: stored.account,
            scopes: stored.scopes,
        };

        this._onDidChangeSessions.fire({ added: [authSession], removed: [], changed: [] });
        return authSession;
    }

    private async refreshSession(session: StoredSession): Promise<string> {
        let tokenResponse: Response;
        try {
            tokenResponse = await fetch(`${this.oauthAuthority}/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    client_id: CLIENT_ID,
                    refresh_token: session.refreshToken,
                }).toString(),
            });
        } catch {
            throw new Error('Token refresh failed: network error');
        }

        if (!tokenResponse.ok) {
            await this.removeSession();
            throw new Error('Token refresh failed');
        }

        const tokens = await tokenResponse.json() as {
            access_token: string;
            refresh_token?: string;
            expires_in: number;
        };

        const updated: StoredSession = {
            ...session,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token ?? session.refreshToken,
            expiresAt: Date.now() + tokens.expires_in * 1000,
        };

        await this.storeSession(updated);

        this._onDidChangeSessions.fire({
            added: [],
            removed: [],
            changed: [{ id: updated.id, accessToken: updated.accessToken, account: updated.account, scopes: updated.scopes }],
        });

        return updated.accessToken;
    }

    private async fetchUserInfo(host: string, accessToken: string): Promise<{ uuid?: string; email?: string; first_name?: string } | null> {
        try {
            const res = await fetch(`${host}/api/users/@me/`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (res.ok) {
                return await res.json() as { uuid?: string; email?: string; first_name?: string };
            }
        } catch {
            // Fall through
        }
        return null;
    }

    private generatePKCE(): { codeVerifier: string; codeChallenge: string } {
        const codeVerifier = crypto.randomBytes(32).toString('base64url');
        const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
        return { codeVerifier, codeChallenge };
    }

    private async loadSession(): Promise<StoredSession | null> {
        if (this.cachedSession !== undefined) { return this.cachedSession; }
        const raw = await this.secretStorage.get(StorageKeys.OAUTH_SESSION);
        if (!raw) {
            this.cachedSession = null;
            return null;
        }
        try {
            const session = JSON.parse(raw) as StoredSession;
            this.cachedSession = session;
            return session;
        } catch {
            this.cachedSession = null;
            return null;
        }
    }

    private async storeSession(session: StoredSession | null): Promise<void> {
        this.cachedSession = session;
        if (session) {
            await this.secretStorage.store(StorageKeys.OAUTH_SESSION, JSON.stringify(session));
        } else {
            await this.secretStorage.delete(StorageKeys.OAUTH_SESSION);
        }
    }
}
