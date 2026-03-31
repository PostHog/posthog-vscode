import * as vscode from 'vscode';
import { Commands } from '../constants';

export class WrapInFlagCodeActionProvider implements vscode.CodeActionProvider {
    static readonly providedCodeActionKinds = [vscode.CodeActionKind.Refactor];

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
    ): vscode.CodeAction[] {
        if (range.isEmpty) { return []; }

        const action = new vscode.CodeAction(
            'Wrap in feature flag',
            vscode.CodeActionKind.Refactor,
        );
        action.command = {
            command: Commands.WRAP_IN_FLAG,
            title: 'Wrap in Feature Flag',
            arguments: [document.uri, range],
        };

        return [action];
    }
}
