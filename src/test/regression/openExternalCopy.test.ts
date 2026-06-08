/**
 * Regression test for: "Copy URL" / dismissed dialog killing the OAuth flow
 *
 * Bug:    When `vscode.env.openExternal()` returns `false` — which happens
 *         both when the user chooses "Copy" in VS Code's open-link dialog
 *         AND when they simply dismiss/cancel it (the API can't tell these
 *         apart) — the code treated it as a hard browser failure: it
 *         cleared the auth timeout, deleted the pending auth state, and
 *         rejected the whole sign-in flow immediately. Users who copied
 *         the URL to paste into a browser manually had their login killed
 *         before they could finish.
 * Fix:    Show an information message with "Copy URL" / "Cancel" actions.
 *         "Copy URL" re-copies the auth URL and leaves the flow alive;
 *         dismissing the message also leaves the flow alive (the 5-minute
 *         timeout keeps running so a manual paste can still complete);
 *         only an explicit "Cancel" click cleans up and rejects with
 *         'User did not consent to login.' (a string authCommands.ts
 *         already suppresses, matching the original dialog-cancel UX).
 * Date:   2026-06-08
 *
 * This test should FAIL if the bug regresses.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { PostHogAuthenticationProvider, SCOPES } from '../../services/postHogAuthProvider';

class FakeSecrets implements vscode.SecretStorage {
    private data = new Map<string, string>();
    private emitter = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();
    onDidChange = this.emitter.event;
    async get(key: string): Promise<string | undefined> { return this.data.get(key); }
    async store(key: string, value: string): Promise<void> { this.data.set(key, value); }
    async delete(key: string): Promise<void> { this.data.delete(key); }
    async keys(): Promise<string[]> { return [...this.data.keys()]; }
}

function stubProperty<T extends object>(obj: T, key: keyof T & string, value: unknown): () => void {
    const original = Object.getOwnPropertyDescriptor(obj, key);
    Object.defineProperty(obj, key, { configurable: true, value });
    return () => {
        if (original) {
            Object.defineProperty(obj, key, original);
        } else {
            delete (obj as unknown as Record<string, unknown>)[key];
        }
    };
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

interface StubConfig {
    infoMessageChoice: string | undefined;
    onClipboardWrite?: (text: string) => void;
}

async function withOpenExternalFalseStubs<T>(config: StubConfig, fn: () => Promise<T>): Promise<T> {
    const restoreOpenExternal = stubProperty(vscode.env, 'openExternal', () => Promise.resolve(false));
    const restoreShowInfo = stubProperty(
        vscode.window,
        'showInformationMessage',
        (..._args: unknown[]) => Promise.resolve(config.infoMessageChoice),
    );
    // `vscode.env.clipboard.writeText` is a non-configurable own property on the
    // real Clipboard instance — it can't be redefined directly. Replace the whole
    // `clipboard` property on `env` with a fake instead.
    const fakeClipboard: vscode.Clipboard = {
        readText: () => Promise.resolve(''),
        writeText: (text: string) => {
            config.onClipboardWrite?.(text);
            return Promise.resolve();
        },
    };
    const restoreClipboard = stubProperty(vscode.env, 'clipboard', fakeClipboard);

    try {
        return await fn();
    } finally {
        restoreClipboard();
        restoreShowInfo();
        restoreOpenExternal();
    }
}

function getPendingAuths(provider: PostHogAuthenticationProvider): Map<string, unknown> {
    return (provider as unknown as { pendingAuths: Map<string, unknown> }).pendingAuths;
}

suite('Regression: openExternal returns false (Copy/Cancel/dismiss)', function () {
    this.timeout(20000);

    let provider: PostHogAuthenticationProvider;

    setup(() => {
        provider = new PostHogAuthenticationProvider(new FakeSecrets());
    });

    teardown(() => {
        provider.dispose();
    });

    interface Case {
        name: string;
        infoMessageChoice: string | undefined;
        expectRejection?: RegExp;
        expectedPendingSize: number;
        expectClipboardWrite: boolean;
        bugMessage: string;
    }

    const cases: Case[] = [
        {
            name: '"Copy URL" clicked: copies the auth URL and keeps the flow alive',
            infoMessageChoice: 'Copy URL',
            expectedPendingSize: 1,
            expectClipboardWrite: true,
            bugMessage: 'Bug regressed: clicking "Copy URL" should copy the auth URL to the clipboard and keep the flow alive.',
        },
        {
            name: '"Cancel" clicked: rejects with "User did not consent to login." and cleans up',
            infoMessageChoice: 'Cancel',
            expectRejection: /User did not consent to login\./,
            expectedPendingSize: 0,
            expectClipboardWrite: false,
            bugMessage: 'Bug regressed: clicking "Cancel" should reject with "User did not consent to login." (the string authCommands.ts suppresses) and clean up pending state.',
        },
        {
            name: 'Notification dismissed (no button clicked): flow stays alive, no premature rejection',
            infoMessageChoice: undefined,
            expectedPendingSize: 1,
            expectClipboardWrite: false,
            bugMessage: 'Bug regressed: dismissing the notification must NOT cancel the auth flow — the user may still paste the URL into a browser manually and complete sign-in.',
        },
    ];

    for (const tc of cases) {
        test(tc.name, async () => {
            const written: string[] = [];

            await withOpenExternalFalseStubs(
                { infoMessageChoice: tc.infoMessageChoice, onClipboardWrite: text => written.push(text) },
                async () => {
                    const sessionPromise = provider.createSession(SCOPES);
                    sessionPromise.catch(() => { /* asserted via assert.rejects below, or settled by dispose() in teardown */ });

                    if (tc.expectRejection) {
                        await assert.rejects(sessionPromise, tc.expectRejection, tc.bugMessage);
                    } else {
                        await delay(300);
                    }

                    assert.strictEqual(getPendingAuths(provider).size, tc.expectedPendingSize, tc.bugMessage);

                    if (tc.expectClipboardWrite) {
                        assert.ok(
                            written.length > 0 && written[0].includes('client_id=') && written[0].includes('/authorize?'),
                            `${tc.bugMessage} (expected the full auth URL on the clipboard, got: ${JSON.stringify(written)})`,
                        );
                    } else {
                        assert.strictEqual(written.length, 0, `Clipboard should not be written to in this scenario, got: ${JSON.stringify(written)}`);
                    }
                },
            );
        });
    }
});
