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
    padding: 8px 8px 0;
    gap: 0;
    border-bottom: 1px solid var(--vscode-panel-border);
}
.nav-tab {
    flex: 1 1 0;
    min-width: 0;
    padding: 7px 4px;
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--vscode-foreground);
    opacity: 0.55;
    cursor: pointer;
    transition: opacity 0.15s, border-color 0.15s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
}
.nav-tab:hover { opacity: 0.85; }
.nav-tab.active {
    opacity: 1;
    border-bottom-color: var(--ph-blue);
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
    padding: 40px 20px;
    text-align: center;
    gap: 0;
    min-height: 100vh;
}
.welcome-logo { height: 40px; margin-bottom: 16px; }
.welcome-title {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 6px;
}
.welcome-subtitle {
    font-size: 12px;
    opacity: 0.6;
    line-height: 1.5;
    max-width: 240px;
    margin-bottom: 24px;
}
.welcome-features {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    max-width: 260px;
    margin-bottom: 28px;
    text-align: left;
}
.welcome-feature {
    display: flex;
    align-items: flex-start;
    gap: 10px;
}
.welcome-feature-icon {
    font-size: 16px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: rgba(29, 74, 255, 0.1);
    flex-shrink: 0;
}
.welcome-feature-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding-top: 2px;
}
.welcome-feature-name {
    font-size: 12px;
    font-weight: 600;
}
.welcome-feature-desc {
    font-size: 11px;
    opacity: 0.5;
    line-height: 1.4;
}
.welcome .sign-in-btn {
    padding: 10px 32px;
    background: var(--ph-blue);
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
    letter-spacing: 0.2px;
}
.welcome .sign-in-btn:hover { opacity: 0.85; }
.welcome-hint {
    font-size: 11px;
    opacity: 0.4;
    margin-top: 12px;
}

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

/* ── Flag management controls ── */
.flag-toggle-row {
    display: flex;
    align-items: center;
    gap: 10px;
}
.flag-toggle {
    width: 36px;
    height: 20px;
    border-radius: 10px;
    border: none;
    background: var(--vscode-input-background, #3c3c3c);
    cursor: pointer;
    position: relative;
    transition: background 0.2s;
    padding: 0;
    flex-shrink: 0;
}
.flag-toggle.active { background: #4CBB17; }
.flag-toggle-knob {
    display: block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    position: absolute;
    top: 3px;
    left: 3px;
    transition: transform 0.2s;
}
.flag-toggle.active .flag-toggle-knob { transform: translateX(16px); }
.flag-toggle-label { font-size: 12px; font-weight: 500; }

.flag-rollout-row {
    display: flex;
    align-items: center;
    gap: 8px;
}
.flag-rollout-slider {
    flex: 1;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--vscode-input-background, #3c3c3c);
    border-radius: 2px;
    outline: none;
}
.flag-rollout-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--ph-blue);
    cursor: pointer;
}
.flag-rollout-num {
    width: 48px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    padding: 3px 6px;
    font-size: 12px;
    text-align: right;
}
.flag-variant-pct-sign { font-size: 12px; opacity: 0.5; }

.flag-variants { display: flex; flex-direction: column; gap: 6px; }
.flag-variant-row {
    display: flex;
    align-items: center;
    gap: 6px;
}
.flag-variant-key {
    flex: 1;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    padding: 4px 8px;
    font-size: 12px;
    font-family: var(--vscode-editor-font-family);
}
.flag-variant-pct {
    width: 48px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    padding: 4px 6px;
    font-size: 12px;
    text-align: right;
}
.flag-variant-remove {
    background: none;
    border: none;
    color: var(--vscode-errorForeground, #f44);
    cursor: pointer;
    font-size: 16px;
    padding: 0 4px;
    opacity: 0.6;
    line-height: 1;
}
.flag-variant-remove:hover { opacity: 1; }
.flag-add-variant {
    background: none;
    border: 1px dashed var(--vscode-input-border, rgba(255,255,255,0.15));
    color: var(--vscode-foreground);
    padding: 5px 10px;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    margin-top: 6px;
    opacity: 0.6;
    transition: opacity 0.15s;
}
.flag-add-variant:hover { opacity: 1; }

.flag-payload-block { margin-bottom: 8px; }
.flag-payload-variant-label {
    font-size: 10px;
    font-family: var(--vscode-editor-font-family);
    opacity: 0.5;
    margin-bottom: 3px;
}
.flag-payload-editor {
    width: 100%;
    min-height: 60px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px;
    padding: 8px;
    font-size: 12px;
    font-family: var(--vscode-editor-font-family);
    resize: vertical;
    line-height: 1.4;
    box-sizing: border-box;
}

.flag-save-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 16px 0;
}
.flag-save-btn { flex-shrink: 0; }
.flag-save-status {
    font-size: 11px;
    opacity: 0.7;
}
.flag-save-status.success { color: #4CBB17; opacity: 1; }
.flag-save-status.error { color: var(--vscode-errorForeground, #f44); opacity: 1; }

/* ── Experiment results ── */
.exp-conclusion {
    padding: 8px 12px;
    border-radius: 6px;
    margin-bottom: 14px;
    font-size: 12px;
}
.exp-conclusion.won { background: rgba(76, 187, 23, 0.1); }
.exp-conclusion.lost { background: rgba(244, 68, 68, 0.1); }
.exp-conclusion-comment {
    margin-top: 4px;
    opacity: 0.7;
    font-size: 11px;
    font-style: italic;
}

.exp-section {
    margin-bottom: 16px;
}
.exp-section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.6;
    margin-bottom: 8px;
}

.exp-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
}
.exp-table th {
    text-align: left;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    opacity: 0.5;
    font-weight: 500;
    padding: 4px 6px 6px;
    border-bottom: 1px solid var(--vscode-panel-border);
}
.exp-table th.num, .exp-table td.num {
    text-align: right;
}
.exp-table td {
    padding: 5px 6px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    vertical-align: top;
}
.exp-table tr.exp-table-baseline td { opacity: 0.6; }
.exp-table tr.exp-table-total td {
    font-weight: 600;
    border-top: 1px solid var(--vscode-panel-border);
    border-bottom: none;
}
.exp-table tr.winner td { color: #4CBB17; }
.exp-table tr.loser td { }
.exp-sub {
    font-size: 9px;
    opacity: 0.5;
}
.exp-delta { font-weight: 500; }
.exp-delta.positive { color: #4CBB17; }
.exp-delta.negative { color: #f44; }
.exp-win-pct {
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 10px;
}
.exp-win-pct.winner { background: rgba(76, 187, 23, 0.15); color: #4CBB17; }
.exp-win-pct.loser { background: rgba(244, 68, 68, 0.1); color: #f44; }

.exp-metric-block {
    background: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.04));
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 8px;
}
.exp-metric-name {
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 8px;
}
.exp-metric-type {
    font-size: 10px;
    font-weight: 400;
    opacity: 0.5;
    margin-left: 6px;
}
.exp-metric-item {
    font-size: 12px;
    padding: 4px 0;
    opacity: 0.7;
}

/* CI visualization */
.exp-ci-section {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid rgba(255,255,255,0.06);
}
.exp-ci-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
    font-size: 10px;
}
.exp-ci-label {
    width: 50px;
    font-family: var(--vscode-editor-font-family);
    opacity: 0.6;
    flex-shrink: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}
.exp-ci-track {
    flex: 1;
    height: 8px;
    background: rgba(255,255,255,0.04);
    border-radius: 4px;
    position: relative;
    overflow: hidden;
}
.exp-ci-zero {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--vscode-foreground);
    opacity: 0.2;
}
.exp-ci-bar {
    position: absolute;
    top: 1px;
    height: 6px;
    border-radius: 3px;
    opacity: 0.7;
}
.exp-ci-bar.positive { background: #4CBB17; }
.exp-ci-bar.negative { background: #f44; }
.exp-ci-bar.neutral { background: var(--vscode-foreground); opacity: 0.3; }
.exp-ci-range {
    font-family: var(--vscode-editor-font-family);
    opacity: 0.5;
    white-space: nowrap;
    flex-shrink: 0;
}

/* ── Insight cards ── */
.insight-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px 8px 12px;
}
.insight-card {
    background: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.04));
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 12px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
}
.insight-card:hover {
    border-color: var(--ph-blue);
    background: var(--vscode-list-hoverBackground);
}
.insight-card-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
}
.insight-card-icon {
    font-size: 12px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    background: rgba(29, 74, 255, 0.12);
    flex-shrink: 0;
}
.insight-card-title {
    font-size: 11px;
    font-weight: 600;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.insight-card-type {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.45;
    flex-shrink: 0;
}
.insight-card-body {
    min-height: 44px;
}
.insight-card-empty {
    font-size: 10px;
    opacity: 0.35;
    text-align: center;
    padding: 14px 0;
}

/* ── Sparkline ── */
.sparkline-container { overflow: hidden; }
.sparkline-container svg { display: block; width: 100%; }

/* ── Bold number ── */
.bold-number {
    font-size: 26px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.5px;
}
.bold-number-label {
    font-size: 10px;
    opacity: 0.5;
    margin-top: 2px;
}

/* ── Funnel ── */
.funnel-step {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
    font-size: 10px;
}
.funnel-step-bar {
    height: 6px;
    border-radius: 3px;
    background: var(--ph-blue);
    transition: width 0.3s;
    min-width: 2px;
}
.funnel-step-label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
}
.funnel-step-pct {
    opacity: 0.6;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
}

/* ── Retention ── */
.retention-row {
    display: flex;
    gap: 2px;
    margin-bottom: 2px;
}
.retention-cell {
    width: 20px;
    height: 14px;
    border-radius: 2px;
    font-size: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 600;
}
.retention-label {
    font-size: 9px;
    opacity: 0.5;
    width: 28px;
    flex-shrink: 0;
    text-align: right;
    padding-right: 4px;
    line-height: 14px;
}

/* ── Table widget ── */
.table-widget {
    width: 100%;
    font-size: 10px;
    border-collapse: collapse;
}
.table-widget td {
    padding: 2px 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
}
.table-widget td:last-child {
    text-align: right;
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
}
.table-widget tr:nth-child(even) {
    background: rgba(255,255,255,0.02);
}

/* ── Insight detail ── */
.insight-detail-viz {
    background: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.04));
    border-radius: 6px;
    padding: 16px;
    margin-bottom: 14px;
}
.insight-detail-meta {
    font-size: 11px;
    opacity: 0.5;
    margin-bottom: 14px;
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
