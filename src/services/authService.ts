import * as vscode from 'vscode';
import { StorageKeys, Defaults, OAuthConfig } from '../constants';

export class AuthService {
    constructor(
        private readonly secretStorage: vscode.SecretStorage,
        private readonly globalState: vscode.Memento
    ) {}

    async getApiKey(): Promise<string | undefined> {
        const method = this.getAuthMethod();
        if (method === 'oauth') {
            return this.secretStorage.get(StorageKeys.OAUTH_ACCESS_TOKEN);
        }
        return this.secretStorage.get(StorageKeys.API_KEY);
    }

    async setApiKey(key: string): Promise<void> {
        await this.secretStorage.store(StorageKeys.API_KEY, key);
    }

    async deleteApiKey(): Promise<void> {
        await this.secretStorage.delete(StorageKeys.API_KEY);
    }

    getHost(): string {
        return this.globalState.get<string>(StorageKeys.HOST) ?? Defaults.HOST;
    }

    async setHost(host: string): Promise<void> {
        await this.globalState.update(StorageKeys.HOST, host);
    }

    getProjectId(): number | undefined {
        return this.globalState.get<number>(StorageKeys.PROJECT_ID);
    }

    async setProjectId(id: number): Promise<void> {
        await this.globalState.update(StorageKeys.PROJECT_ID, id);
    }

    async clearProjectId(): Promise<void> {
        await this.globalState.update(StorageKeys.PROJECT_ID, undefined);
    }

    isAuthenticated(): boolean {
        return this.globalState.get<boolean>(StorageKeys.IS_AUTHENTICATED) ?? false;
    }

    async setAuthenticated(value: boolean): Promise<void> {
        await this.globalState.update(StorageKeys.IS_AUTHENTICATED, value);
    }

    // OAuth token storage
    async setOAuthTokens(accessToken: string, refreshToken: string, expiresIn: number): Promise<void> {
        await this.secretStorage.store(StorageKeys.OAUTH_ACCESS_TOKEN, accessToken);
        await this.secretStorage.store(StorageKeys.OAUTH_REFRESH_TOKEN, refreshToken);
        const expiry = new Date(Date.now() + expiresIn * 1000).toISOString();
        await this.globalState.update(StorageKeys.TOKEN_EXPIRY, expiry);
    }

    async getOAuthAccessToken(): Promise<string | undefined> {
        return this.secretStorage.get(StorageKeys.OAUTH_ACCESS_TOKEN);
    }

    async getOAuthRefreshToken(): Promise<string | undefined> {
        return this.secretStorage.get(StorageKeys.OAUTH_REFRESH_TOKEN);
    }

    // Auth method tracking
    getAuthMethod(): 'api_key' | 'oauth' | undefined {
        return this.globalState.get<'api_key' | 'oauth'>(StorageKeys.AUTH_METHOD);
    }

    async setAuthMethod(method: 'api_key' | 'oauth'): Promise<void> {
        await this.globalState.update(StorageKeys.AUTH_METHOD, method);
    }

    // Token expiry
    getTokenExpiry(): string | undefined {
        return this.globalState.get<string>(StorageKeys.TOKEN_EXPIRY);
    }

    isTokenExpired(): boolean {
        const expiry = this.getTokenExpiry();
        if (!expiry) return true;
        // Consider expired 60 seconds early to avoid clock-skew failures
        return Date.now() > new Date(expiry).getTime() - 60_000;
    }

    // Token refresh (HTTP call to PostHog token endpoint)
    async refreshOAuthToken(): Promise<void> {
        const refreshToken = await this.getOAuthRefreshToken();
        if (!refreshToken) {
            throw new Error('No refresh token available');
        }

        const host = this.getHost().replace(/\/+$/, '');
        const response = await fetch(`${host}${OAuthConfig.TOKEN_PATH}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: OAuthConfig.CLIENT_ID,
                refresh_token: refreshToken,
            }),
        });

        if (!response.ok) {
            throw new Error(`Token refresh failed: ${response.status}`);
        }

        const data = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
        await this.setOAuthTokens(
            data.access_token,
            data.refresh_token ?? refreshToken, // Keep old refresh token if server doesn't rotate
            data.expires_in
        );
    }

    // Clear all OAuth storage (for sign-out)
    async clearOAuthTokens(): Promise<void> {
        await this.secretStorage.delete(StorageKeys.OAUTH_ACCESS_TOKEN);
        await this.secretStorage.delete(StorageKeys.OAUTH_REFRESH_TOKEN);
        await this.globalState.update(StorageKeys.AUTH_METHOD, undefined);
        await this.globalState.update(StorageKeys.TOKEN_EXPIRY, undefined);
    }
}
