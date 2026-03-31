import * as vscode from 'vscode';
import { PostHog } from 'posthog-node';
import { AuthService } from './authService';

const POSTHOG_API_KEY = 'phc_ujnMQ8TXJNp44BW7djHwYEtjAJfGqxNwb3eWuS7fzvs7';
const POSTHOG_HOST = 'https://us.i.posthog.com';

export class TelemetryService {
    private client: PostHog;
    private enabled: boolean;
    private isDev: boolean;
    private distinctId: string;
    private authService: AuthService | null = null;
    private extensionVersion: string;
    private identified = false;

    constructor(extensionMode: vscode.ExtensionMode) {
        this.isDev = extensionMode !== vscode.ExtensionMode.Production;
        this.enabled = vscode.env.isTelemetryEnabled && !this.isDev;
        this.distinctId = vscode.env.machineId;
        this.extensionVersion = vscode.extensions.getExtension('PostHog.posthog-vscode')?.packageJSON?.version ?? 'unknown';

        this.client = new PostHog(POSTHOG_API_KEY, {
            host: POSTHOG_HOST,
            flushAt: 10,
            flushInterval: 30_000,
            disableGeoip: false,
        });

        vscode.env.onDidChangeTelemetryEnabled(enabled => {
            this.enabled = enabled && !this.isDev;
        });
    }

    setAuthService(authService: AuthService): void {
        this.authService = authService;
    }

    capture(event: string, properties?: Record<string, unknown>): void {
        if (!this.enabled) { return; }

        this.client.capture({
            distinctId: this.distinctId,
            event,
            properties: {
                ...this.getSuperProperties(),
                ...properties,
            },
        });
    }

    identify(email?: string): void {
        if (!this.enabled) { return; }
        if (this.identified && !email) { return; }

        const personProperties: Record<string, unknown> = {
            extension_version: this.extensionVersion,
            vscode_version: vscode.version,
            os: process.platform,
        };

        if (email) {
            personProperties['$email'] = email;
        }

        if (this.authService) {
            personProperties['posthog_host'] = this.getHostType();
            personProperties['project_id'] = this.authService.getProjectId() ?? null;
            personProperties['project_name'] = this.authService.getProjectName() ?? null;
        }

        this.client.identify({
            distinctId: this.distinctId,
            properties: personProperties,
        });

        this.identified = true;
    }

    group(groupType: string, groupKey: string, properties?: Record<string, unknown>): void {
        if (!this.enabled) { return; }

        this.client.groupIdentify({
            groupType,
            groupKey,
            properties,
        });
    }

    reset(): void {
        this.identified = false;
    }

    async shutdown(): Promise<void> {
        await this.client.shutdown();
    }

    private getSuperProperties(): Record<string, unknown> {
        const props: Record<string, unknown> = {
            extension_version: this.extensionVersion,
            vscode_version: vscode.version,
            os: process.platform,
        };

        if (this.authService) {
            props['host_type'] = this.getHostType();
            props['project_id'] = this.authService.getProjectId() ?? null;
            props['is_authenticated'] = this.authService.isAuthenticated();
        }

        return props;
    }

    private getHostType(): string {
        if (!this.authService) { return 'unknown'; }
        const host = this.authService.getHost();
        if (host.includes('us.posthog.com')) { return 'us_cloud'; }
        if (host.includes('eu.posthog.com')) { return 'eu_cloud'; }
        return 'self_hosted';
    }
}
