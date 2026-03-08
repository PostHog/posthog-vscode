export function getStyles(): string {
    return /*css*/ `
:root {
    --ph-blue: #1D4AFF;
    --ph-yellow: #F9BD2B;
    --ph-orange: #F54E00;
    --ph-green: #4CBB17;
    --ph-red: #F44336;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
    overflow: hidden;
    height: 100vh;
}

html { height: 100vh; overflow: hidden; }

#main-app {
    display: flex;
    flex-direction: column;
    height: 100vh;
}

.scroll-area {
    flex: 1;
    overflow-y: auto;
    position: relative;
}

/* ── Header ── */
.header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--vscode-panel-border);
}
.header img { height: 22px; }
.header .title {
    font-size: 13px;
    font-weight: 600;
    opacity: 0.85;
}
.header .actions { margin-left: auto; display: flex; gap: 6px; }
.header .actions button {
    background: none;
    border: none;
    color: var(--vscode-foreground);
    cursor: pointer;
    opacity: 0.6;
    font-size: 14px;
    padding: 2px;
}
.header .actions button:hover { opacity: 1; }

/* ── Nav tabs ── */
.nav {
    display: flex;
    padding: 8px 12px 0;
    gap: 2px;
    border-bottom: 1px solid var(--vscode-panel-border);
}
.nav-tab {
    padding: 7px 12px;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--vscode-foreground);
    opacity: 0.55;
    cursor: pointer;
    transition: opacity 0.15s, border-color 0.15s;
}
.nav-tab:hover { opacity: 0.85; }
.nav-tab.active {
    opacity: 1;
    border-bottom-color: var(--ph-yellow);
}

/* ── Search ── */
.search-bar {
    padding: 10px 12px;
}
.search-bar input {
    width: 100%;
    padding: 6px 10px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px;
    font-size: 12px;
    outline: none;
}
.search-bar input:focus {
    border-color: var(--ph-blue);
}
.search-bar input::placeholder {
    color: var(--vscode-input-placeholderForeground);
}

/* ── Content sections ── */
.section { display: none; }
.section.active { display: block; }

/* ── Item list ── */
.item-list {
    padding: 0 4px;
}
.item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 4px;
    cursor: default;
    transition: background 0.1s;
}
.item:hover {
    background: var(--vscode-list-hoverBackground);
}
.item .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-top: 5px;
    flex-shrink: 0;
}
.item .dot.active { background: var(--ph-green); }
.item .dot.inactive { background: var(--vscode-disabledForeground); }
.item .dot.error { background: var(--ph-red); }
.item .dot.resolved { background: var(--ph-green); }
.item .dot.running { background: var(--ph-blue); }
.item .dot.draft { background: var(--ph-yellow); }
.item .dot.complete { background: var(--vscode-disabledForeground); }

.item .info { flex: 1; min-width: 0; }
.item .primary {
    font-size: 12px;
    font-weight: 500;
    font-family: var(--vscode-editor-font-family);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.item .secondary {
    font-size: 11px;
    opacity: 0.6;
    margin-top: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.item .item-actions {
    display: none;
    gap: 4px;
    margin-left: auto;
    flex-shrink: 0;
}
.item:hover .item-actions { display: flex; }
.item-actions button {
    background: none;
    border: none;
    color: var(--vscode-foreground);
    cursor: pointer;
    opacity: 0.5;
    font-size: 13px;
    padding: 2px 4px;
    border-radius: 3px;
}
.item-actions button:hover {
    opacity: 1;
    background: var(--vscode-toolbar-hoverBackground);
}

/* ── Badge ── */
.badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 8px;
    font-weight: 600;
    flex-shrink: 0;
    margin-top: 2px;
}
.badge.count {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
}

/* ── States ── */
.empty-state {
    text-align: center;
    padding: 40px 20px;
    opacity: 0.6;
}
.empty-state .icon { font-size: 32px; margin-bottom: 12px; }
.empty-state p { font-size: 12px; line-height: 1.6; }

.loading {
    text-align: center;
    padding: 32px;
    font-size: 12px;
    opacity: 0.5;
}

/* ── Welcome ── */
.welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    text-align: center;
    gap: 16px;
}
.welcome img { height: 36px; margin-bottom: 4px; }
.welcome h2 {
    font-size: 15px;
    font-weight: 600;
}
.welcome p {
    font-size: 12px;
    opacity: 0.6;
    line-height: 1.5;
}
.welcome .sign-in-btn {
    padding: 8px 24px;
    background: var(--ph-blue);
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    margin-top: 4px;
    transition: opacity 0.15s;
}
.welcome .sign-in-btn:hover { opacity: 0.85; }

/* ── Detail panel ── */
#detail-panel {
    display: none;
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: var(--vscode-sideBar-background);
    z-index: 10;
}
#detail-panel.visible { display: block; }

.detail-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
}
.detail-back {
    background: none;
    border: none;
    color: var(--vscode-foreground);
    cursor: pointer;
    font-size: 16px;
    padding: 2px 4px;
    opacity: 0.7;
    border-radius: 3px;
}
.detail-back:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
.detail-title {
    font-size: 13px;
    font-weight: 600;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.detail-body { padding: 12px; }

.detail-field {
    margin-bottom: 14px;
}
.detail-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.5;
    margin-bottom: 3px;
}
.detail-value {
    font-size: 12px;
    line-height: 1.5;
    word-break: break-word;
}
.detail-value code {
    font-family: var(--vscode-editor-font-family);
    background: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.06));
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 12px;
}

.detail-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
}

.detail-actions {
    display: flex;
    gap: 8px;
    margin-top: 16px;
    flex-wrap: wrap;
}
.detail-btn {
    padding: 6px 14px;
    border: none;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
}
.detail-btn:hover { opacity: 0.85; }
.detail-btn.primary { background: var(--ph-blue); color: #fff; }
.detail-btn.secondary {
    background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.08));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
}

.detail-desc {
    font-size: 11px;
    line-height: 1.5;
    opacity: 0.7;
    max-height: 200px;
    overflow-y: auto;
    white-space: pre-wrap;
    background: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.04));
    padding: 8px 10px;
    border-radius: 4px;
    margin-top: 3px;
}`;
}
