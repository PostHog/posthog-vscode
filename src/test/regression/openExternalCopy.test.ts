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
 *         only an explicit "Cancel" or dismiss cleans up and rejects with
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

/** Returns a promise and a resolve callback — resolved when you call resolve(). */
function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>(r => { resolve = r; });
    return { promise, resolve };
}

/** Returns true if the promise is still pending (has not resolved or rejected). */
async function isPending(p: Promise<unknown>): Promise<boolean> {
    let settled = false;
    Promise.resolve(p).finally(() => { settled = true; });
    await Promise.resolve(); // flush one microtask tick
    return !settled;
}

interface StubConfig {
    infoMessageChoice: string | undefined;
    onClipboardWrite?: (text: string) => void;
    clipboardWriteError?: Error;
    onShowInputBox?: (options: vscode.InputBoxOptions | undefined) => void;
    openExternalError?: Error;
}

async function withOpenExternalFalseStubs<T>(config: StubConfig, fn: () => Promise<T>): Promise<T> {
    const restoreOpenExternal = stubProperty(vscode.env, 'openExternal', () => {
        if (config.openExternalError) {
            return Promise.reject(config.openExternalError);
        }
        return Promise.resolve(false);
    });
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
            if (config.clipboardWriteError) {
                return Promise.reject(config.clipboardWriteError);
            }
            config.onClipboardWrite?.(text);
            return Promise.resolve();
        },
    };
    const restoreClipboard = stubProperty(vscode.env, 'clipboard', fakeClipboard);
    const restoreShowInputBox = stubProperty(
        vscode.window,
        'showInputBox',
        (options?: vscode.InputBoxOptions) => {
            config.onShowInputBox?.(options);
            return Promise.resolve(undefined);
        },
    );

    try {
        return await fn();
    } finally {
        restoreShowInputBox();
        restoreClipboard();
        restoreShowInfo();
        restoreOpenExternal();
    }
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
        expectClipboardWrite: boolean;
        bugMessage: string;
    }

    const cases: Case[] = [
        {
            name: '"Copy URL" clicked: copies the auth URL and keeps the flow alive',
            infoMessageChoice: 'Copy URL',
            expectClipboardWrite: true,
            bugMessage: 'Bug regressed: clicking "Copy URL" should copy the auth URL to the clipboard and keep the flow alive.',
        },
        {
            name: '"Cancel" clicked: rejects with "User did not consent to login." and cleans up',
            infoMessageChoice: 'Cancel',
            expectRejection: /User did not consent to login\./,
            expectClipboardWrite: false,
            bugMessage: 'Bug regressed: clicking "Cancel" should reject with "User did not consent to login." (the string authCommands.ts suppresses).',
        },
        {
            name: 'Notification dismissed (no button clicked): rejects with "User did not consent to login." and cleans up',
            infoMessageChoice: undefined,
            expectRejection: /User did not consent to login\./,
            expectClipboardWrite: false,
            bugMessage: 'Bug regressed: dismissing the notification should reject with "User did not consent to login." (the string authCommands.ts suppresses).',
        },
    ];

    for (const tc of cases) {
        test(tc.name, async function () {
            this.timeout(2000);
            const written: string[] = [];
            const clipboardWritten = deferred();

            await withOpenExternalFalseStubs(
                {
                    infoMessageChoice: tc.infoMessageChoice,
                    onClipboardWrite: text => { written.push(text); clipboardWritten.resolve(); },
                },
                async () => {
                    const sessionPromise = provider.createSession(SCOPES);
                    sessionPromise.catch(() => { /* asserted via assert.rejects below, or settled by dispose() in teardown */ });

                    if (tc.expectRejection) {
                        await assert.rejects(sessionPromise, tc.expectRejection, tc.bugMessage);
                    } else {
                        // Wait deterministically for the clipboard write, then confirm the
                        // session promise is still alive (not yet resolved or rejected).
                        await clipboardWritten.promise;
                        assert.ok(await isPending(sessionPromise), tc.bugMessage);
                    }

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

    test('"Copy URL" clicked but clipboard.writeText fails: falls back to showInputBox with the URL', async function () {
        this.timeout(2000);
        let inputBoxOptions: vscode.InputBoxOptions | undefined;
        const inputBoxShown = deferred();

        await withOpenExternalFalseStubs(
            {
                infoMessageChoice: 'Copy URL',
                clipboardWriteError: new Error('clipboard unavailable'),
                onShowInputBox: options => { inputBoxOptions = options; inputBoxShown.resolve(); },
            },
            async () => {
                const sessionPromise = provider.createSession(SCOPES);
                sessionPromise.catch(() => { /* settled by dispose() in teardown */ });

                await inputBoxShown.promise;

                assert.ok(
                    inputBoxOptions !== undefined,
                    'Bug regressed: when clipboard.writeText fails, showInputBox must be shown as a manual-copy fallback.',
                );
                assert.ok(
                    !!inputBoxOptions?.value
                        && inputBoxOptions.value.includes('client_id=')
                        && inputBoxOptions.value.includes('/authorize?'),
                    `Fallback input box should be pre-filled with the full auth URL, got: ${inputBoxOptions?.value}`,
                );
                assert.ok(
                    await isPending(sessionPromise),
                    'Bug regressed: a clipboard write failure must NOT cancel the pending auth flow — ' +
                    'the user can still copy the URL manually from the fallback input box.',
                );
            },
        );
    });

    test('openExternal() itself rejects: rejects the session with that error', async function () {
        // Short per-test timeout: on regression, sessionPromise never settles (unhandled
        // rejection from openExternal), so assert.rejects hangs. Fail fast at 2s.
        this.timeout(2000);

        const openExternalError = new Error('openExternal exploded');

        await withOpenExternalFalseStubs(
            { infoMessageChoice: undefined, openExternalError },
            async () => {
                const sessionPromise = provider.createSession(SCOPES);

                await assert.rejects(
                    sessionPromise,
                    (err: Error) => err === openExternalError,
                    'Bug regressed: if openExternal() itself rejects, the session promise must reject with that same error.',
                );
            },
        );
    });

    test('createSession() called again while one is pending: supersedes the old attempt', async function () {
        this.timeout(2000);
        const firstClipboardWritten = deferred();

        await withOpenExternalFalseStubs(
            { infoMessageChoice: 'Copy URL', onClipboardWrite: () => firstClipboardWritten.resolve() },
            async () => {
                const firstSessionPromise = provider.createSession(SCOPES);
                firstSessionPromise.catch(() => { /* asserted via assert.rejects below */ });

                // Wait deterministically for the first attempt to reach its pending state.
                await firstClipboardWritten.promise;
                assert.ok(await isPending(firstSessionPromise), 'First attempt should remain pending after "Copy URL" is chosen.');

                const secondSessionPromise = provider.createSession(SCOPES);
                secondSessionPromise.catch(() => { /* settled by dispose() in teardown */ });

                await assert.rejects(
                    firstSessionPromise,
                    /Superseded by a new sign-in attempt\./,
                    'Bug regressed: starting a new sign-in attempt should reject any in-flight attempt with "Superseded by a new sign-in attempt."',
                );
                assert.ok(
                    await isPending(secondSessionPromise),
                    'Bug regressed: the second sign-in attempt should still be pending.',
                );
            },
        );
    });
});
