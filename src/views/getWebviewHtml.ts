import * as vscode from 'vscode';
import { getStyles } from './webview/styles';
import { getLayout } from './webview/layout';
import { getScript } from './webview/script';

export function getWebviewHtml(webview: vscode.Webview, logoUri: vscode.Uri, initialAuth = false): string {
    const nonce = getNonce();

    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">${getStyles()}</style>
</head>
<body>
${getLayout(logoUri, initialAuth)}
<script nonce="${nonce}">${getScript()}</script>
</body>
</html>`;
}

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
}
