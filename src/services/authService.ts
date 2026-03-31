import * as vscode from 'vscode';
import { StorageKeys, Defaults } from '../constants';

export class AuthService {
    constructor(
        private readonly secretStorage: vscode.SecretStorage,
        private readonly globalState: vscode.Memento
    ) {}

    async getApiKey(): Promise<string | undefined> {
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

    getProjectName(): string | undefined {
        return this.globalState.get<string>(StorageKeys.PROJECT_NAME);
    }

    async setProjectName(name: string): Promise<void> {
        await this.globalState.update(StorageKeys.PROJECT_NAME, name);
    }

    async clearProjectName(): Promise<void> {
        await this.globalState.update(StorageKeys.PROJECT_NAME, undefined);
    }

    getCanWrite(): boolean {
        return this.globalState.get<boolean>(StorageKeys.CAN_WRITE) ?? true;
    }

    async setCanWrite(value: boolean): Promise<void> {
        await this.globalState.update(StorageKeys.CAN_WRITE, value);
    }

    isAuthenticated(): boolean {
        return this.globalState.get<boolean>(StorageKeys.IS_AUTHENTICATED) ?? false;
    }

    async setAuthenticated(value: boolean): Promise<void> {
        await this.globalState.update(StorageKeys.IS_AUTHENTICATED, value);
    }
}
