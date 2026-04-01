import * as vscode from 'vscode';

export function getLayout(logoUri: vscode.Uri): string {
    return /*html*/ `
<!-- Welcome screen (unauthenticated) -->
<div id="welcome-screen" class="welcome" style="display:none;">
    <img src="${logoUri}" alt="PostHog" class="welcome-logo" />
    <h2 class="welcome-title">PostHog for VS Code</h2>
    <p class="welcome-subtitle">Your feature flags, experiments, and analytics — right in your editor.</p>
    <div class="welcome-features">
        <div class="welcome-feature">
            <span class="welcome-feature-icon">&#x2691;</span>
            <div class="welcome-feature-text">
                <span class="welcome-feature-name">Feature Flags</span>
                <span class="welcome-feature-desc">See flag status inline, autocomplete flag keys</span>
            </div>
        </div>
        <div class="welcome-feature">
            <span class="welcome-feature-icon">&#x2697;</span>
            <div class="welcome-feature-text">
                <span class="welcome-feature-name">Experiments</span>
                <span class="welcome-feature-desc">Track experiment variants and results</span>
            </div>
        </div>
        <div class="welcome-feature">
            <span class="welcome-feature-icon">&#x1F4CA;</span>
            <div class="welcome-feature-text">
                <span class="welcome-feature-name">Analytics</span>
                <span class="welcome-feature-desc">View saved insights and trends</span>
            </div>
        </div>
    </div>
    <button class="sign-in-btn sign-in-btn--primary" id="btn-sign-in-oauth">Sign In with PostHog</button>
    <button class="sign-in-btn sign-in-btn--secondary" id="btn-sign-in">Sign In with API Key</button>
    <a class="help-link" href="#" id="btn-get-api-key">Don't have an API key? Get one here</a>
    <p class="welcome-hint">API key works for self-hosted instances</p>
</div>

<!-- Main app (authenticated) -->
<div id="main-app" style="display:none;">
    <div class="header">
        <img src="${logoUri}" alt="PostHog" />
        <div class="header-text">
            <span class="title">PostHog</span>
            <span class="project-name" id="project-name"></span>
        </div>
        <div class="actions">
            <span class="rbac-badge" id="rbac-badge" title="Read-only access" style="display:none;">RO</span>
            <button id="btn-select-project" title="Switch project">&#x21C5;</button>
            <button id="btn-sign-out" title="Sign out">&#x23FB;</button>
        </div>
    </div>

    <div class="nav">
        <button class="nav-tab active" data-tab="flags">Flags</button>
        <button class="nav-tab" data-tab="experiments">Experiments</button>
        <button class="nav-tab" data-tab="analytics">Analytics</button>
        <button class="nav-tab" data-tab="feedback">&#x1F4AC; Feedback</button>
    </div>

    <div class="search-bar" style="display:flex;gap:6px;align-items:center;">
        <input id="search" type="text" placeholder="Search..." style="flex:1;" />
        <button class="filter-btn" id="my-flags-toggle" title="Show my flags only" style="display:none;">Mine</button>
    </div>

    <div class="platform-filter" id="platform-filter">
        <select class="platform-select" id="platform-select">
            <option value="all">All Platforms</option>
            <option value="web">Web</option>
            <option value="ios">iOS</option>
            <option value="android">Android</option>
        </select>
    </div>

    <div class="scroll-area">
        <!-- Feature Flags -->
        <div id="section-flags" class="section active">
            <div class="loading" id="flags-loading">Loading flags...</div>
            <div class="item-list" id="flags-list" style="display:none;"></div>
            <div class="empty-state" id="flags-empty" style="display:none;">
                <div class="icon">&#x2691;</div>
                <p>No feature flags found</p>
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

        <!-- Analytics -->
        <div id="section-analytics" class="section">
            <div class="insight-grid" id="analytics-loading">
              <div class="skeleton-card">
                <div class="skeleton-card-header">
                  <div class="skeleton-bone icon"></div>
                  <div class="skeleton-bone title"></div>
                  <div class="skeleton-bone type"></div>
                </div>
                <div class="skeleton-bone chart"></div>
              </div>
              <div class="skeleton-card">
                <div class="skeleton-card-header">
                  <div class="skeleton-bone icon"></div>
                  <div class="skeleton-bone title"></div>
                  <div class="skeleton-bone type"></div>
                </div>
                <div class="skeleton-bone chart"></div>
              </div>
              <div class="skeleton-card">
                <div class="skeleton-card-header">
                  <div class="skeleton-bone icon"></div>
                  <div class="skeleton-bone title"></div>
                  <div class="skeleton-bone type"></div>
                </div>
                <div class="skeleton-bone chart"></div>
              </div>
            </div>
            <div class="insight-grid" id="analytics-list" style="display:none;"></div>
            <div class="empty-state" id="analytics-empty" style="display:none;">
                <div class="icon">&#x1F4CA;</div>
                <p>No saved insights found</p>
            </div>
        </div>

        <!-- Feedback -->
        <div id="section-feedback" class="section">
            <div class="feedback-container">
                <h3 class="feedback-heading">Share your feedback</h3>
                <p class="feedback-subtitle">Help us improve PostHog for VS Code</p>

                <div class="feedback-rating-section">
                    <p class="feedback-rating-label">How are you finding the extension?</p>
                    <div class="feedback-rating-buttons">
                        <button class="feedback-emoji" data-rating="love" title="Love it">
                            <span class="feedback-emoji-icon">&#x1F60D;</span>
                            <span class="feedback-emoji-text">Love it</span>
                        </button>
                        <button class="feedback-emoji" data-rating="okay" title="It's okay">
                            <span class="feedback-emoji-icon">&#x1F610;</span>
                            <span class="feedback-emoji-text">It's okay</span>
                        </button>
                        <button class="feedback-emoji" data-rating="frustrated" title="Frustrated">
                            <span class="feedback-emoji-icon">&#x1F624;</span>
                            <span class="feedback-emoji-text">Frustrated</span>
                        </button>
                    </div>
                </div>

                <div class="feedback-message-section">
                    <textarea id="feedback-message" class="feedback-textarea" placeholder="Tell us what you think... What's working well? What could be better?" rows="5"></textarea>
                </div>

                <button class="feedback-send-btn" id="feedback-send-btn">Send Feedback</button>

                <div class="feedback-success" id="feedback-success" style="display:none;">
                    <span class="feedback-success-icon">&#x2714;</span>
                    Thanks for your feedback!
                </div>

                <div class="feedback-links">
                    <a class="feedback-link" href="https://github.com/PostHog/posthog-vscode/issues" target="_blank">Report a bug</a>
                    <span class="feedback-link-separator">&middot;</span>
                    <a class="feedback-link" href="https://github.com/PostHog/posthog-vscode/issues/new" target="_blank">Request a feature</a>
                </div>
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
