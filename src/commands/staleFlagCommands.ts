import * as vscode from 'vscode';
import { StaleFlagService, buildCleanupEditForRef } from '../services/staleFlagService';

export function registerStaleFlagCommands(
    staleFlagService: StaleFlagService,
): vscode.Disposable[] {
    return [
        vscode.commands.registerCommand('posthog.scanStaleFlags', async () => {
            const stale = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Scanning for stale feature flags...' },
                () => staleFlagService.scan(),
            );

            const totalRefs = stale.reduce((sum, f) => sum + f.references.length, 0);
            if (stale.length === 0) {
                vscode.window.showInformationMessage('No stale feature flags found.');
            } else {
                vscode.window.showInformationMessage(
                    `Found ${stale.length} stale flag${stale.length === 1 ? '' : 's'} across ${totalRefs} reference${totalRefs === 1 ? '' : 's'}.`,
                );
            }
        }),

        vscode.commands.registerCommand('posthog.cleanupStaleFlag', async (arg: unknown) => {
            // Can receive: a tree item (with .staleFlag), a StaleFlag object, or a string key
            let key: string | undefined;
            if (typeof arg === 'string') {
                key = arg;
            } else if (arg && typeof arg === 'object') {
                if ('staleFlag' in arg) { key = (arg as { staleFlag: { key: string } }).staleFlag.key; }
                else if ('key' in arg) { key = (arg as { key: string }).key; }
            }
            const staleFlag = key ? staleFlagService.getStaleFlags().find(f => f.key === key) : undefined;

            if (!staleFlag) {
                vscode.window.showErrorMessage('Stale flag not found. Run a scan first.');
                return;
            }

            const keepEnabled = staleFlag.reason !== 'inactive';

            const action = keepEnabled ? 'keep the enabled code path' : 'remove the flag check (flag is inactive)';
            const confirm = await vscode.window.showWarningMessage(
                `Clean up "${staleFlag.key}"?\n\nThis will ${action} across ${staleFlag.references.length} file${staleFlag.references.length === 1 ? '' : 's'}.`,
                { modal: true },
                'Preview Changes',
                'Apply All',
            );

            if (!confirm) { return; }

            // Build edits for all references
            const edits: { ref: typeof staleFlag.references[0]; edit: vscode.WorkspaceEdit }[] = [];
            const failures: string[] = [];

            for (const ref of staleFlag.references) {
                const edit = await buildCleanupEditForRef(ref, keepEnabled);
                if (edit) {
                    edits.push({ ref, edit });
                } else {
                    const fileName = ref.uri.path.split('/').pop();
                    failures.push(`${fileName}:${ref.line + 1} — could not parse surrounding code`);
                }
            }

            if (edits.length === 0) {
                vscode.window.showWarningMessage(
                    'Could not auto-clean any references. The flag usage patterns are too complex for automatic cleanup.\n\nTry using "Find in Files" to review manually.',
                );
                return;
            }

            if (confirm === 'Preview Changes') {
                // Apply to first reference and show the diff
                const first = edits[0];
                const originalContent = (await vscode.workspace.openTextDocument(first.ref.uri)).getText();

                // Apply edit to get new content
                await vscode.workspace.applyEdit(first.edit);

                // Show the file so user can see changes (they can undo)
                const doc = await vscode.workspace.openTextDocument(first.ref.uri);
                await vscode.window.showTextDocument(doc);

                if (edits.length > 1) {
                    const applyRest = await vscode.window.showInformationMessage(
                        `Applied 1/${edits.length} cleanups. Apply remaining ${edits.length - 1}?`,
                        'Apply All',
                        'Stop',
                    );
                    if (applyRest === 'Apply All') {
                        for (let i = 1; i < edits.length; i++) {
                            await vscode.workspace.applyEdit(edits[i].edit);
                        }
                    }
                }
            } else {
                // Apply all
                for (const { edit } of edits) {
                    await vscode.workspace.applyEdit(edit);
                }
                vscode.window.showInformationMessage(
                    `Cleaned up ${edits.length} reference${edits.length === 1 ? '' : 's'} for "${staleFlag.key}".`,
                );
            }

            if (failures.length > 0) {
                vscode.window.showWarningMessage(
                    `Could not auto-clean ${failures.length} reference${failures.length === 1 ? '' : 's'}:\n${failures.join('\n')}`,
                );
            }

            // Re-scan to update the tree
            await staleFlagService.scan();
        }),
    ];
}
