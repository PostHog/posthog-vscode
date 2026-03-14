import * as vscode from 'vscode';

export function getLayout(logoUri: vscode.Uri): string {
    return /*html*/ `
<!-- Welcome screen (unauthenticated) -->
<div id="welcome-screen" class="welcome" style="display:none;">
    <img src="${logoUri}" alt="PostHog" />
    <h2>Welcome to PostHog</h2>
    <p>Your PostHog command center.<br>Connect your account to get started.</p>
    <button class="sign-in-btn" id="btn-sign-in">Sign In with API Key</button>
</div>

<!-- Main app (authenticated) -->
<div id="main-app" style="display:none;">
    <div class="header">
        <img src="${logoUri}" alt="PostHog" />
        <span class="title">PostHog</span>
        <div class="actions">
            <button id="btn-select-project" title="Switch project">&#x21C5;</button>
            <button id="btn-sign-out" title="Sign out">&#x23FB;</button>
        </div>
    </div>

    <div class="nav">
        <button class="nav-tab active" data-tab="analytics">Analytics</button>
        <button class="nav-tab" data-tab="flags">Flags</button>
        <button class="nav-tab" data-tab="errors">Errors</button>
        <button class="nav-tab" data-tab="experiments">Experiments</button>
    </div>

    <div class="search-bar">
        <input id="search" type="text" placeholder="Search..." />
    </div>

    <div id="errors-filter" style="display:none;padding:4px 12px;">
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;opacity:0.7;cursor:pointer;user-select:none;">
            <input type="checkbox" id="errors-local-only" /> This repo only
        </label>
    </div>

    <div class="scroll-area">
        <!-- Analytics -->
        <div id="section-analytics" class="section active">
            <div class="loading" id="analytics-loading">Loading insights...</div>
            <div class="insight-grid" id="analytics-list" style="display:none;"></div>
            <div class="empty-state" id="analytics-empty" style="display:none;">
                <div class="icon">&#x1F4CA;</div>
                <p>No saved insights found</p>
            </div>
        </div>

        <!-- Feature Flags -->
        <div id="section-flags" class="section">
            <div class="loading" id="flags-loading">Loading flags...</div>
            <div class="item-list" id="flags-list" style="display:none;"></div>
            <div class="empty-state" id="flags-empty" style="display:none;">
                <div class="icon">&#x2691;</div>
                <p>No feature flags found</p>
            </div>
        </div>

        <!-- Error Tracking -->
        <div id="section-errors" class="section">
            <div class="loading" id="errors-loading">Loading errors...</div>
            <div class="item-list" id="errors-list" style="display:none;"></div>
            <div class="empty-state" id="errors-empty" style="display:none;">
                <div class="icon">&#x2713;</div>
                <p>No errors tracked. Nice!</p>
            </div>
        </div>

        <!-- Experiments -->
        <div id="section-experiments" class="section">
            <div class="loading" id="experiments-loading">Loading experiments...</div>
            <div class="item-list" id="experiments-list" style="display:none;"></div>
            <div class="empty-state" id="experiments-empty" style="display:none;">
                <div class="icon">&#x2697;</div>
                <p>No experiments found</p>
            </div>
        </div>

        <!-- Detail panel (overlay) -->
        <div id="detail-panel">
            <div class="detail-header">
                <button class="detail-back" id="detail-back">&#x2190;</button>
                <span class="detail-title" id="detail-title"></span>
            </div>
            <div class="detail-body" id="detail-body"></div>
        </div>
    </div>
</div>`;
}
