import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { StaleFlagService } from '../../services/staleFlagService';
import { FlagCacheService } from '../../services/flagCacheService';
import { ExperimentCacheService } from '../../services/experimentCacheService';
import { TreeSitterService } from '../../services/treeSitterService';

// ---------------------------------------------------------------------------
// Stale flag scan is bounded (regression — ticket #1801)
// ---------------------------------------------------------------------------
//
// A customer on a large workspace had their entire editor frozen so hard the
// only escape was a machine restart. The cause was `staleFlagService.scan()`:
// it ran an unbounded `Promise.all` over every matched file (no concurrency
// limit, no file-count cap, narrow excludes), opening and tree-sitter-parsing
// every document on the single extension-host thread at once. It was also
// auto-fired on every activation, so even MCP-only users paid the cost.
//
// This test locks in three guarantees so the freeze cannot regress:
//   1. findFiles is called with a maxResults ceiling.
//   2. The default exclude globs cover vendored/generated/minified trees.
//   3. The scan never opens more than a small fixed number of documents at
//      once (fixed-concurrency worker pool, not unbounded Promise.all).
//   4. The eager auto-scan was removed from extension.ts activation.
// ---------------------------------------------------------------------------

function makeService(): StaleFlagService {
    const treeSitter = {
        isSupported: () => true,
        findPostHogCalls: async () => [],
    } as unknown as TreeSitterService;
    return new StaleFlagService(
        new FlagCacheService(),
        new ExperimentCacheService(),
        treeSitter,
    );
}

suite('Stale flag scan is bounded (regression #1801)', () => {
    let originalFindFiles: typeof vscode.workspace.findFiles;
    let originalOpen: typeof vscode.workspace.openTextDocument;

    setup(() => {
        originalFindFiles = vscode.workspace.findFiles;
        originalOpen = vscode.workspace.openTextDocument;
    });

    teardown(() => {
        Object.defineProperty(vscode.workspace, 'findFiles', { value: originalFindFiles, configurable: true });
        Object.defineProperty(vscode.workspace, 'openTextDocument', { value: originalOpen, configurable: true });
    });

    test('findFiles is called with a maxResults ceiling and broad excludes', async () => {
        let capturedExclude: string | undefined;
        let capturedMaxResults: number | undefined;
        Object.defineProperty(vscode.workspace, 'findFiles', {
            configurable: true,
            value: async (_include: string, exclude?: string, maxResults?: number) => {
                capturedExclude = exclude;
                capturedMaxResults = maxResults;
                return [];
            },
        });

        await makeService().scan();

        assert.ok(
            typeof capturedMaxResults === 'number' && capturedMaxResults > 0,
            'findFiles must receive a positive maxResults ceiling so a huge repo cannot enumerate unbounded files',
        );
        for (const glob of ['**/node_modules/**', '**/vendor/**', '**/.next/**', '**/__pycache__/**', '**/coverage/**', '**/*.min.js']) {
            assert.ok(
                capturedExclude?.includes(glob),
                `default exclude pattern must contain ${glob} so vendored/generated/minified trees are not parsed`,
            );
        }
    });

    test('never opens more documents concurrently than the worker-pool limit', async () => {
        const FILE_COUNT = 200;
        const uris = Array.from({ length: FILE_COUNT }, (_, i) => vscode.Uri.file(`/repo/file${i}.ts`));

        Object.defineProperty(vscode.workspace, 'findFiles', {
            configurable: true,
            value: async () => uris,
        });

        let inFlight = 0;
        let peak = 0;
        Object.defineProperty(vscode.workspace, 'openTextDocument', {
            configurable: true,
            value: async () => {
                inFlight++;
                peak = Math.max(peak, inFlight);
                // Yield so other queued opens can pile up if concurrency is unbounded.
                await new Promise((r) => setTimeout(r, 1));
                inFlight--;
                return { languageId: 'typescript', lineAt: () => ({ text: '' }) } as unknown as vscode.TextDocument;
            },
        });

        await makeService().scan();

        assert.ok(
            peak > 0 && peak <= 16,
            `scan opened ${peak} documents at once over ${FILE_COUNT} files — it must use a small fixed-concurrency worker pool, not an unbounded Promise.all`,
        );
    });

    test('extension.ts does not auto-scan stale flags on activation', () => {
        const repoRoot = path.resolve(__dirname, '..', '..', '..');
        const source = fs.readFileSync(path.join(repoRoot, 'src', 'extension.ts'), 'utf8');
        assert.ok(
            !/staleFlagService\.scan\(\)/.test(source),
            'extension.ts must not eagerly call staleFlagService.scan() on activation — the scan is heavy and must be gated behind explicit user action (the Stale Flags view button / command)',
        );
    });
});
