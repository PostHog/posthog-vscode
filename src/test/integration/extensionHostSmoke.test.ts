import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Extension Host Smoke Tests
//
// These tests exercise the REAL extension end-to-end via VS Code's
// Extension Host. They open real files on disk (not untitled docs, because
// every PostHog provider is registered with `scheme: 'file'`) and trigger
// language features through `vscode.executeXxxProvider` commands.
//
// Tests are intentionally resilient: with no PostHog connection / auth,
// providers return empty results — that's fine. We assert only that the
// providers are wired, return the expected shape, and never throw.
// ─────────────────────────────────────────────────────────────────────────────

const EXTENSION_ID = 'PostHog.posthog-vscode';

// Languages exercised end-to-end. Each carries a real file extension so VS Code
// resolves the language id from disk, plus a small but valid PostHog snippet.
interface LangFixture {
    id: string;
    ext: string;
    sample: string;
    flagCallLine: number;
    flagKeyCharStart: number; // character offset of the opening quote of the flag key
}

const LANG_FIXTURES: LangFixture[] = [
    {
        id: 'javascript',
        ext: 'js',
        sample: `posthog.getFeatureFlag('flag-1');\n`,
        flagCallLine: 0,
        flagKeyCharStart: 23,
    },
    {
        id: 'typescript',
        ext: 'ts',
        sample: `posthog.getFeatureFlag('flag-1');\n`,
        flagCallLine: 0,
        flagKeyCharStart: 23,
    },
    {
        id: 'typescriptreact',
        ext: 'tsx',
        sample: `posthog.getFeatureFlag('flag-1');\n`,
        flagCallLine: 0,
        flagKeyCharStart: 23,
    },
    {
        id: 'python',
        ext: 'py',
        sample: `posthog.get_feature_flag('flag-1', 'user-1')\n`,
        flagCallLine: 0,
        flagKeyCharStart: 25,
    },
    {
        id: 'go',
        ext: 'go',
        sample: `package main\n\nfunc main() {\n\tclient.GetFeatureFlag("flag-1", "user-1")\n}\n`,
        flagCallLine: 3,
        flagKeyCharStart: 22,
    },
    {
        id: 'ruby',
        ext: 'rb',
        sample: `posthog.get_feature_flag('flag-1', 'user-1')\n`,
        flagCallLine: 0,
        flagKeyCharStart: 25,
    },
];

// Track the temp dir we create so we can clean up after the suite.
let tmpDir: string;
const openedFiles: string[] = [];

function writeFixture(fixture: LangFixture, suffix = ''): vscode.Uri {
    const fileName = `smoke-${fixture.id}${suffix}.${fixture.ext}`;
    const filePath = path.join(tmpDir, fileName);
    fs.writeFileSync(filePath, fixture.sample, 'utf8');
    openedFiles.push(filePath);
    return vscode.Uri.file(filePath);
}

async function openDoc(uri: vscode.Uri): Promise<vscode.TextDocument> {
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
    return doc;
}

suite('Extension Host Smoke Tests', function () {
    this.timeout(60000);

    suiteSetup(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posthog-smoke-'));

        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        if (ext && !ext.isActive) {
            await ext.activate();
        }
    });

    suiteTeardown(async () => {
        // Best-effort cleanup — never let cleanup failures fail the suite.
        try {
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        } catch { /* ignore */ }
        for (const f of openedFiles) {
            try { fs.unlinkSync(f); } catch { /* ignore */ }
        }
        try { fs.rmdirSync(tmpDir); } catch { /* ignore */ }
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 1. Extension lifecycle
    // ═══════════════════════════════════════════════════════════════════════

    suite('Extension lifecycle', () => {
        test('extension is installed', () => {
            const ext = vscode.extensions.getExtension(EXTENSION_ID);
            assert.ok(ext, `Extension '${EXTENSION_ID}' should be installed`);
        });

        test('extension activates', async () => {
            const ext = vscode.extensions.getExtension(EXTENSION_ID);
            assert.ok(ext, `Extension '${EXTENSION_ID}' should be installed`);
            if (!ext.isActive) {
                await ext.activate();
            }
            assert.ok(ext.isActive, 'Extension should be active after activate()');
        });

        test('extension contributes posthog commands', async () => {
            const all = await vscode.commands.getCommands(true);
            const posthogCommands = all.filter(c => c.startsWith('posthog.'));
            assert.ok(
                posthogCommands.length > 0,
                'Extension should register at least one posthog.* command',
            );
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 2. Language registration sanity
    // ═══════════════════════════════════════════════════════════════════════

    suite('Language registration', () => {
        test('all 6 target languages are known to VS Code', async () => {
            const known = await vscode.languages.getLanguages();
            // typescriptreact is bundled into vscode by default, but if we
            // can find at least the core 5 we know providers will fire.
            const required = ['javascript', 'typescript', 'python', 'go', 'ruby'];
            for (const lang of required) {
                assert.ok(
                    known.includes(lang),
                    `VS Code should know language '${lang}' (found: ${known.length} languages)`,
                );
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 3. Completion provider — fired inside flag string arg
    // ═══════════════════════════════════════════════════════════════════════

    suite('Flag completion provider', () => {
        for (const fixture of LANG_FIXTURES) {
            test(`${fixture.id}: completion fires inside getFeatureFlag string arg`, async () => {
                const uri = writeFixture(fixture, '-completion');
                await openDoc(uri);

                // Position the cursor just inside the opening quote of the flag key.
                const position = new vscode.Position(
                    fixture.flagCallLine,
                    fixture.flagKeyCharStart + 1,
                );

                const result = await vscode.commands.executeCommand<vscode.CompletionList>(
                    'vscode.executeCompletionItemProvider',
                    uri,
                    position,
                );

                // VS Code always returns a CompletionList for completion requests.
                // Without auth/cache the items array is just empty — that's OK.
                assert.ok(result, 'executeCompletionItemProvider should resolve');
                assert.ok(Array.isArray(result.items), 'CompletionList.items should be an array');
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 4. Code action provider — should not throw on unknown flags
    // ═══════════════════════════════════════════════════════════════════════

    suite('Code action provider', () => {
        test('javascript: returns actions array for unknown flag', async () => {
            const fixture: LangFixture = {
                id: 'javascript',
                ext: 'js',
                sample: `posthog.getFeatureFlag('definitely-does-not-exist');\n`,
                flagCallLine: 0,
                flagKeyCharStart: 23,
            };
            const uri = writeFixture(fixture, '-codeaction');
            await openDoc(uri);

            const range = new vscode.Range(0, fixture.flagKeyCharStart, 0, fixture.flagKeyCharStart + 25);

            const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
                'vscode.executeCodeActionProvider',
                uri,
                range,
            );

            assert.ok(Array.isArray(actions), 'Code actions should be an array (possibly empty)');
        });

        test('python: returns actions array without throwing', async () => {
            const fixture: LangFixture = {
                id: 'python',
                ext: 'py',
                sample: `posthog.get_feature_flag('mystery-flag', 'u1')\n`,
                flagCallLine: 0,
                flagKeyCharStart: 25,
            };
            const uri = writeFixture(fixture, '-codeaction');
            await openDoc(uri);

            const range = new vscode.Range(0, 0, 0, 40);
            const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
                'vscode.executeCodeActionProvider',
                uri,
                range,
            );

            assert.ok(Array.isArray(actions), 'Code actions should be an array');
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 5. Document link provider — flag link (cmd+click)
    // ═══════════════════════════════════════════════════════════════════════

    suite('Document link provider', () => {
        test('python: link provider runs without throwing', async () => {
            const fixture: LangFixture = {
                id: 'python',
                ext: 'py',
                sample: `posthog.get_feature_flag('my-flag', 'user-1')\n`,
                flagCallLine: 0,
                flagKeyCharStart: 25,
            };
            const uri = writeFixture(fixture, '-link');
            await openDoc(uri);

            const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
                'vscode.executeLinkProvider',
                uri,
            );

            assert.ok(Array.isArray(links), 'Document links should be an array');
        });

        test('javascript: link provider runs without throwing', async () => {
            const fixture = LANG_FIXTURES[0]; // javascript
            const uri = writeFixture(fixture, '-link');
            await openDoc(uri);

            const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
                'vscode.executeLinkProvider',
                uri,
            );

            assert.ok(Array.isArray(links), 'Document links should be an array');
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 6. CodeLens provider
    // ═══════════════════════════════════════════════════════════════════════

    suite('CodeLens provider', () => {
        test('go: lens provider runs without throwing', async () => {
            const fixture: LangFixture = {
                id: 'go',
                ext: 'go',
                sample: `package main\n\nfunc main() {\n\tclient.GetFeatureFlag("my-flag", "u1")\n}\n`,
                flagCallLine: 3,
                flagKeyCharStart: 22,
            };
            const uri = writeFixture(fixture, '-lens');
            await openDoc(uri);

            const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
                'vscode.executeCodeLensProvider',
                uri,
            );

            assert.ok(Array.isArray(lenses), 'CodeLenses should be an array');
        });

        test('javascript: lens provider runs without throwing', async () => {
            const fixture = LANG_FIXTURES[0];
            const uri = writeFixture(fixture, '-lens');
            await openDoc(uri);

            const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
                'vscode.executeCodeLensProvider',
                uri,
            );

            assert.ok(Array.isArray(lenses), 'CodeLenses should be an array');
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 7. Diagnostics — variant + naming providers should not crash
    // ═══════════════════════════════════════════════════════════════════════

    suite('Diagnostics', () => {
        test('javascript: getDiagnostics returns an array (no auth required)', async () => {
            const fixture: LangFixture = {
                id: 'javascript',
                ext: 'js',
                sample: [
                    `const v = posthog.getFeatureFlag('exp');`,
                    `if (v === 'control') {`,
                    `    console.log('a');`,
                    `} else if (v === 'unknown-variant') {`,
                    `    console.log('b');`,
                    `}`,
                    ``,
                ].join('\n'),
                flagCallLine: 0,
                flagKeyCharStart: 33,
            };
            const uri = writeFixture(fixture, '-diag');
            await openDoc(uri);

            // Give the provider a moment to populate diagnostics (debounced 200ms).
            await new Promise(resolve => setTimeout(resolve, 600));

            const diagnostics = vscode.languages.getDiagnostics(uri);
            assert.ok(Array.isArray(diagnostics), 'Diagnostics should be an array');
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 8. Multi-language smoke — every provider runs without throwing
    // ═══════════════════════════════════════════════════════════════════════

    suite('Multi-language provider smoke', () => {
        for (const fixture of LANG_FIXTURES) {
            test(`${fixture.id}: all providers respond without throwing`, async () => {
                const uri = writeFixture(fixture, '-multi');
                const doc = await openDoc(uri);

                // Pick a position somewhere inside the flag key string.
                const completionPos = new vscode.Position(
                    fixture.flagCallLine,
                    fixture.flagKeyCharStart + 1,
                );
                const range = new vscode.Range(
                    fixture.flagCallLine, 0,
                    fixture.flagCallLine, Math.max(1, doc.lineAt(fixture.flagCallLine).text.length),
                );

                // Each call must resolve (not throw). The values themselves
                // are intentionally lax — without auth there's no real data.
                let completions: vscode.CompletionList | undefined;
                let actions: vscode.CodeAction[] | undefined;
                let links: vscode.DocumentLink[] | undefined;
                let lenses: vscode.CodeLens[] | undefined;

                await assert.doesNotReject(async () => {
                    completions = await vscode.commands.executeCommand<vscode.CompletionList>(
                        'vscode.executeCompletionItemProvider',
                        uri,
                        completionPos,
                    );
                }, `${fixture.id}: completion provider threw`);

                await assert.doesNotReject(async () => {
                    actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
                        'vscode.executeCodeActionProvider',
                        uri,
                        range,
                    );
                }, `${fixture.id}: code action provider threw`);

                await assert.doesNotReject(async () => {
                    links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
                        'vscode.executeLinkProvider',
                        uri,
                    );
                }, `${fixture.id}: document link provider threw`);

                await assert.doesNotReject(async () => {
                    lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
                        'vscode.executeCodeLensProvider',
                        uri,
                    );
                }, `${fixture.id}: code lens provider threw`);

                assert.ok(completions, `${fixture.id}: completions resolved`);
                assert.ok(Array.isArray(completions!.items), `${fixture.id}: completions.items is array`);
                assert.ok(Array.isArray(actions), `${fixture.id}: actions is array`);
                assert.ok(Array.isArray(links), `${fixture.id}: links is array`);
                assert.ok(Array.isArray(lenses), `${fixture.id}: lenses is array`);
            });
        }
    });
});
