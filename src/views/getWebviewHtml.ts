import * as vscode from 'vscode';
import sidebarShell from './webview/sidebar/index.html';
import sidebarCss from './webview/sidebar/sidebar.css';
import sidebarLayout from './webview/sidebar/sidebar.html';
import sidebarScript from './webview/sidebar/sidebar.js';

export function getWebviewHtml(webview: vscode.Webview, logoUri: vscode.Uri): string {
    const nonce = getNonce();

    return sidebarShell
        .replace(/\{\{NONCE\}\}/g, nonce)
        .replace('{{CSP_SOURCE}}', webview.cspSource)
        .replace('{{STYLES}}', sidebarCss)
        .replace('{{LAYOUT}}', sidebarLayout.replace(/\{\{LOGO_URI\}\}/g, String(logoUri)))
        .replace('{{SCRIPT}}', sidebarScript);
}

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
}
