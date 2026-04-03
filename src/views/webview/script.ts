export function getScript(): string {
    return /*js*/ `
const vscode = acquireVsCodeApi();
function send(msg) { vscode.postMessage(msg); }

let currentTab = 'flags';
let loadedTabs = new Set();
let allData = { flags: [], experiments: [], analytics: [] };
let experimentResults = {};
let projectId = null;
let userEmail = null;
let myFlagsOnly = false;
let canWrite = true;
let hasMoreFlags = false;
let hasMoreExperiments = false;
let loadingMoreFlags = false;
let loadingMoreExperiments = false;

// ── Helpers ──

function esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML.replace(/"/g, '&quot;');
}

function isDarkTheme() {
    return document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast');
}

function timeAgo(dateStr) {
    if (!dateStr) return 'Unknown';
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30) return days + 'd ago';
    if (days < 365) return Math.floor(days / 30) + 'mo ago';
    return Math.floor(days / 365) + 'y ago';
}

function statusDotHtml(dotClass) {
    return '<span class="dot ' + dotClass + '" style="display:inline-block;width:8px;height:8px;border-radius:50%;"></span>';
}

function detailField(label, value) {
    return '<div class="detail-field"><div class="detail-label">' + label + '</div><div class="detail-value">' + value + '</div></div>';
}

function detailBtn(cls, action, dataAttrs, text) {
    let attrs = 'data-action="' + action + '"';
    for (const [k, v] of Object.entries(dataAttrs)) {
        attrs += ' data-' + k + '="' + esc(String(v)) + '"';
    }
    return '<button class="detail-btn ' + cls + ' act-detail-btn" ' + attrs + '>' + text + '</button>';
}

// ── Tab switching ──

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === 'section-' + tab));
    document.getElementById('search').value = '';

    // Show "Mine" button only on flags tab when user email is known
    var myFlagsBtn = document.getElementById('my-flags-toggle');
    if (myFlagsBtn) { myFlagsBtn.style.display = (tab === 'flags' && userEmail) ? '' : 'none'; }

    // Show platform filter only on analytics tab
    var platformFilter = document.getElementById('platform-filter');
    if (platformFilter) { platformFilter.style.display = (tab === 'analytics') ? '' : 'none'; }

    // Hide search bar on feedback tab
    var searchBar = document.querySelector('.search-bar');
    if (searchBar) { searchBar.style.display = (tab === 'feedback') ? 'none' : ''; }

    if (!loadedTabs.has(tab)) {
        loadedTabs.add(tab);
        if (tab === 'flags') send({ type: 'loadFlags' });
        else if (tab === 'experiments') send({ type: 'loadExperiments' });
        else if (tab === 'analytics') send({ type: 'loadInsights' });
    }
}

// ── Search / filter ──

function filterItems() {
    const q = document.getElementById('search').value.toLowerCase();
    const list = document.getElementById(currentTab + '-list');
    if (!list) return;
    const selector = currentTab === 'analytics' ? '.insight-card' : '.item';
    const items = list.querySelectorAll(selector);
    let visibleCount = 0;
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        const show = text.includes(q);
        item.style.display = show ? '' : 'none';
        if (show) visibleCount++;
    });

    // Show/hide no-results message
    let noResults = list.querySelector('.no-results');
    if (visibleCount === 0 && q.length > 0 && items.length > 0) {
        if (!noResults) {
            noResults = document.createElement('div');
            noResults.className = 'no-results';
            noResults.textContent = 'No matching items';
            list.appendChild(noResults);
        }
        noResults.style.display = '';
    } else if (noResults) {
        noResults.style.display = 'none';
    }
}

// ── List item action bindings ──

function bindItemActions(container) {
    container.querySelectorAll('.act-copy').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); send({ type: 'copyFlagKey', key: btn.dataset.key }); });
    });
    container.querySelectorAll('.act-open').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); send({ type: 'openExternal', path: btn.dataset.path }); });
    });
}

function bindListClicks(container, dataKey, openFn) {
    container.querySelectorAll('.item').forEach(item => {
        item.style.cursor = 'pointer';
        item.addEventListener('click', (e) => {
            if (e.target.closest('.item-actions')) return;
            openFn(item.dataset[dataKey]);
        });
    });
}

// ── Renderers ──

function renderSection(sectionId, items, renderFn) {
    const loading = document.getElementById(sectionId + '-loading');
    const list = document.getElementById(sectionId + '-list');
    const empty = document.getElementById(sectionId + '-empty');

    loading.style.display = 'none';
    if (items.length === 0) {
        list.style.display = 'none';
        empty.style.display = '';
    } else {
        empty.style.display = 'none';
        list.style.display = '';
        renderFn(list, items);
        bindItemActions(list);
    }
}

function flagItemHtml(f) {
    const dotClass = f.active ? 'active' : 'inactive';
    return '<div class="item" data-key="' + esc(f.key) + '" style="cursor:pointer;">'
        + '<div class="dot ' + dotClass + '"></div>'
        + '<div class="info">'
        + '<div class="primary">' + esc(f.key) + '</div>'
        + (f.name ? '<div class="secondary">' + esc(f.name) + '</div>' : '')
        + '</div>'
        + '<div class="item-actions">'
        + '<button class="act-copy" data-key="' + esc(f.key) + '" title="Copy key">&#x2398;</button>'
        + '<button class="act-open" data-path="/project/' + projectId + '/feature_flags/' + f.id + '" title="Open in PostHog">&#x2197;</button>'
        + '</div>'
        + '</div>';
}

function loadMoreSentinelHtml(section, loaded, total) {
    var label = total ? (loaded + ' / ' + total) : (loaded + ' loaded');
    return '<div class="load-more-sentinel" id="' + section + '-sentinel">'
        + '<span class="load-more-label">Loading more... ' + label + '</span>'
        + '</div>';
}

function renderFlags(flags) {
    allData.flags = flags;
    var filtered = flags;
    if (myFlagsOnly && userEmail) {
        filtered = flags.filter(function(f) {
            return f.created_by && f.created_by.email === userEmail;
        });
    }
    renderSection('flags', filtered, (list, items) => {
        list.innerHTML = items.map(flagItemHtml).join('');
        if (hasMoreFlags) {
            list.innerHTML += loadMoreSentinelHtml('flags', allData.flags.length, allData.flagsTotal || null);
        }
        bindListClicks(list, 'key', (key) => send({ type: 'openFlagPanel', key }));
    });
}

function appendFlags(newFlags) {
    allData.flags = allData.flags.concat(newFlags);
    var list = document.getElementById('flags-list');
    if (!list) return;
    // Remove old sentinel
    var oldSentinel = document.getElementById('flags-sentinel');
    if (oldSentinel) oldSentinel.remove();
    // Append new items
    var fragment = document.createElement('div');
    fragment.innerHTML = newFlags.map(flagItemHtml).join('');
    // Bind actions on new items before appending
    bindItemActions(fragment);
    var newItems = Array.from(fragment.children);
    newItems.forEach(function(child) {
        child.style.cursor = 'pointer';
        child.addEventListener('click', function(e) {
            if (e.target.closest('.item-actions')) return;
            send({ type: 'openFlagPanel', key: child.dataset.key });
        });
        list.appendChild(child);
    });
    // Add sentinel if more pages
    if (hasMoreFlags) {
        var sentinel = document.createElement('div');
        sentinel.className = 'load-more-sentinel';
        sentinel.id = 'flags-sentinel';
        sentinel.innerHTML = '<span class="load-more-label">Loading more... ' + allData.flags.length + ' / ' + (allData.flagsTotal || '?') + '</span>';
        list.appendChild(sentinel);
    }
    loadingMoreFlags = false;
}

function experimentItemHtml(exp) {
    let status, dotClass;
    if (exp.end_date) { status = 'Complete'; dotClass = 'complete'; }
    else if (exp.start_date) { status = 'Running'; dotClass = 'running'; }
    else { status = 'Draft'; dotClass = 'draft'; }
    return '<div class="item" data-id="' + exp.id + '" style="cursor:pointer;">'
        + '<div class="dot ' + dotClass + '"></div>'
        + '<div class="info">'
        + '<div class="primary">' + esc(exp.name) + '</div>'
        + '<div class="secondary">' + esc(exp.feature_flag_key) + ' &middot; ' + status + '</div>'
        + '</div>'
        + '<div class="item-actions">'
        + '<button class="act-copy" data-key="' + esc(exp.feature_flag_key) + '" title="Copy flag key">&#x2398;</button>'
        + '<button class="act-open" data-path="/project/' + projectId + '/experiments/' + exp.id + '" title="Open in PostHog">&#x2197;</button>'
        + '</div>'
        + '</div>';
}

function renderExperiments(exps) {
    allData.experiments = exps;
    renderSection('experiments', exps, (list, items) => {
        // Summary counts
        var running = 0, draft = 0, complete = 0;
        items.forEach(function(exp) {
            if (exp.end_date) { complete++; }
            else if (exp.start_date) { running++; }
            else { draft++; }
        });
        var summaryParts = [];
        if (running > 0) summaryParts.push(running + ' Running');
        if (draft > 0) summaryParts.push(draft + ' Draft');
        if (complete > 0) summaryParts.push(complete + ' Complete');
        var summaryHtml = summaryParts.length > 0
            ? '<div class="exp-summary">' + summaryParts.join(' &middot; ') + '</div>'
            : '';

        list.innerHTML = summaryHtml + items.map(experimentItemHtml).join('');
        if (hasMoreExperiments) {
            list.innerHTML += loadMoreSentinelHtml('experiments', allData.experiments.length, allData.experimentsTotal || null);
        }
        bindListClicks(list, 'id', (id) => send({ type: 'openExperimentPanel', id: Number(id) }));
    });
}

function appendExperiments(newExps) {
    allData.experiments = allData.experiments.concat(newExps);
    var list = document.getElementById('experiments-list');
    if (!list) return;
    var oldSentinel = document.getElementById('experiments-sentinel');
    if (oldSentinel) oldSentinel.remove();
    var fragment = document.createElement('div');
    fragment.innerHTML = newExps.map(experimentItemHtml).join('');
    bindItemActions(fragment);
    var newItems = Array.from(fragment.children);
    newItems.forEach(function(child) {
        child.style.cursor = 'pointer';
        child.addEventListener('click', function(e) {
            if (e.target.closest('.item-actions')) return;
            send({ type: 'openExperimentPanel', id: Number(child.dataset.id) });
        });
        list.appendChild(child);
    });
    if (hasMoreExperiments) {
        var sentinel = document.createElement('div');
        sentinel.className = 'load-more-sentinel';
        sentinel.id = 'experiments-sentinel';
        sentinel.innerHTML = '<span class="load-more-label">Loading more... ' + allData.experiments.length + ' / ' + (allData.experimentsTotal || '?') + '</span>';
        list.appendChild(sentinel);
    }
    loadingMoreExperiments = false;
}

// ── Insight renderers ──

function getInsightKind(insight) {
    return insight.query?.source?.kind || 'Unknown';
}

function getInsightDisplay(insight) {
    return insight.query?.source?.trendsFilter?.display || '';
}

function insightTypeLabel(insight) {
    const kind = getInsightKind(insight);
    const display = getInsightDisplay(insight);
    if (kind === 'TrendsQuery') {
        if (display === 'BoldNumber') return 'Number';
        if (display === 'ActionsTable') return 'Table';
        if (display === 'WorldMap') return 'Map';
        return 'Trend';
    }
    if (kind === 'FunnelsQuery') return 'Funnel';
    if (kind === 'RetentionQuery') return 'Retention';
    if (kind === 'LifecycleQuery') return 'Lifecycle';
    if (kind === 'PathsQuery') return 'Paths';
    return kind.replace('Query', '');
}

function insightIcon(insight) {
    const kind = getInsightKind(insight);
    const display = getInsightDisplay(insight);
    if (kind === 'TrendsQuery') {
        if (display === 'BoldNumber') return '#';
        if (display === 'ActionsTable') return '&#x2261;';
        return '&#x2197;';
    }
    if (kind === 'FunnelsQuery') return '&#x25BD;';
    if (kind === 'RetentionQuery') return '&#x21BA;';
    if (kind === 'LifecycleQuery') return '&#x267B;';
    if (kind === 'PathsQuery') return '&#x21C9;';
    return '&#x25A0;';
}

function renderInsights(insights) {
    allData.analytics = insights;
    const loading = document.getElementById('analytics-loading');
    const grid = document.getElementById('analytics-list');
    const empty = document.getElementById('analytics-empty');

    loading.style.display = 'none';
    if (insights.length === 0) {
        grid.style.display = 'none';
        empty.style.display = '';
        return;
    }

    empty.style.display = 'none';
    grid.style.display = '';
    grid.innerHTML = insights.map(ins => {
        return '<div class="insight-card" data-id="' + ins.id + '">'
            + '<div class="insight-card-header">'
            + '<div class="insight-card-icon">' + insightIcon(ins) + '</div>'
            + '<div class="insight-card-title">' + esc(ins.name || 'Untitled') + '</div>'
            + '<div class="insight-card-type">' + insightTypeLabel(ins) + '</div>'
            + '</div>'
            + '<div class="insight-card-body">' + renderInsightViz(ins, false) + '</div>'
            + '</div>';
    }).join('');

    grid.querySelectorAll('.insight-card').forEach(card => {
        card.addEventListener('click', () => send({ type: 'openInsightPanel', id: Number(card.dataset.id) }));
    });
}

function filterInsightsByPlatform(platform) {
    var grid = document.getElementById('analytics-list');
    if (!grid) return;
    var cards = grid.querySelectorAll('.insight-card');
    var platformKeywords = {
        web: ['web', 'pageview', 'page_view', '$pageview', 'browser', 'click', 'dom', 'url', 'session_recording', 'autocapture'],
        ios: ['ios', 'swift', 'iphone', 'ipad', 'apple', 'mobile'],
        android: ['android', 'kotlin', 'java', 'mobile']
    };
    cards.forEach(function(card) {
        if (platform === 'all') {
            card.style.display = '';
            return;
        }
        var text = card.textContent.toLowerCase();
        var id = Number(card.dataset.id);
        var insight = allData.analytics.find(function(a) { return a.id === id; });
        var searchText = text;
        if (insight) {
            searchText += ' ' + (insight.name || '').toLowerCase();
            searchText += ' ' + (insight.description || '').toLowerCase();
            // Check series event names
            if (insight.query && insight.query.source && insight.query.source.series) {
                insight.query.source.series.forEach(function(s) {
                    if (s.event) searchText += ' ' + s.event.toLowerCase();
                });
            }
        }
        var keywords = platformKeywords[platform] || [];
        var matches = keywords.some(function(kw) { return searchText.includes(kw); });
        card.style.display = matches ? '' : 'none';
    });
}

function renderInsightViz(insight, large) {
    if (!insight.result || insight.result.length === 0) {
        return '<div class="insight-card-empty">No data</div>';
    }

    const kind = getInsightKind(insight);
    const display = getInsightDisplay(insight);

    if (kind === 'TrendsQuery') {
        if (display === 'BoldNumber') return renderBoldNumber(insight.result, large);
        if (display === 'ActionsTable') return renderTableWidget(insight.result, large);
        if (display === 'WorldMap') return renderWorldMap(insight.result, large);
        return renderSparkline(insight.result, large);
    }
    if (kind === 'FunnelsQuery') return renderFunnel(insight.result, large);
    if (kind === 'RetentionQuery') return renderRetention(insight.result, large);
    if (kind === 'LifecycleQuery') return renderLifecycle(insight.result, large);

    return '<div class="insight-card-empty">Preview not available</div>';
}

function renderSparkline(series, large) {
    if (!series || !series[0] || !series[0].data) return '<div class="insight-card-empty">No data</div>';

    const h = large ? 80 : 36;
    const colors = ['#1D4AFF', '#F9BD2B', '#4CBB17', '#F54E00', '#9B59B6'];
    let svgPaths = '';

    for (let si = 0; si < Math.min(series.length, 5); si++) {
        const data = series[si].data;
        if (!data || data.length === 0) continue;
        const max = Math.max(...data, 1);
        const min = Math.min(...data, 0);
        const range = max - min || 1;
        const w = 200;
        const step = w / Math.max(data.length - 1, 1);
        const points = data.map((v, i) => {
            const x = (i * step).toFixed(1);
            const y = (h - 2 - ((v - min) / range) * (h - 4)).toFixed(1);
            return x + ',' + y;
        }).join(' ');

        const color = colors[si % colors.length];
        svgPaths += '<polyline points="' + points + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';
        if (si === 0) {
            const fillPoints = points + ' ' + ((data.length - 1) * step).toFixed(1) + ',' + h + ' 0,' + h;
            svgPaths += '<polygon points="' + fillPoints + '" fill="' + color + '" opacity="0.08"/>';
        }
    }

    if (large && series.length > 1) {
        const min = Math.min(...series[0].data, 0);
        const max = Math.max(...series[0].data, 1);
        const range = max - min || 1;
        const zeroY = (h - 2 - ((0 - min) / range) * (h - 4)).toFixed(1);
        svgPaths += '<line x1="0" y1="' + zeroY + '" x2="200" y2="' + zeroY + '" stroke="' + (isDarkTheme() ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)') + '" stroke-width="0.5" stroke-dasharray="3,3"/>';
    }

    const lastVal = series[0].data[series[0].data.length - 1];
    const prevVal = series[0].data.length > 1 ? series[0].data[series[0].data.length - 2] : lastVal;
    const trendHtml = large ? '' : '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">'
        + '<span style="font-size:14px;font-weight:600;">' + formatNum(lastVal) + '</span>'
        + renderTrendArrow(lastVal, prevVal)
        + '</div>';

    return trendHtml + '<div class="sparkline-container"><svg viewBox="0 0 200 ' + h + '" preserveAspectRatio="none">' + svgPaths + '</svg></div>';
}

function renderBoldNumber(series, large) {
    if (!series || !series[0]) return '<div class="insight-card-empty">No data</div>';
    const data = series[0].data;
    if (!data || data.length === 0) return '<div class="insight-card-empty">No data</div>';
    const total = data.reduce((a, b) => a + b, 0);
    const label = series[0].label || '';
    const sz = large ? '36px' : '26px';
    return '<div class="bold-number" style="font-size:' + sz + '">' + formatNum(total) + '</div>'
        + '<div class="bold-number-label">' + esc(label) + '</div>';
}

function renderFunnel(steps, large) {
    if (!steps || steps.length === 0) return '<div class="insight-card-empty">No data</div>';
    const maxCount = Math.max(...steps.map(s => s.count), 1);
    const limit = large ? steps.length : Math.min(steps.length, 4);
    const trackBg = isDarkTheme() ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    let html = '';
    for (let i = 0; i < limit; i++) {
        const s = steps[i];
        const pct = maxCount > 0 ? (s.count / maxCount * 100) : 0;
        const convRate = i === 0 ? '100%' : (maxCount > 0 ? Math.round(s.count / steps[0].count * 100) + '%' : '0%');
        const name = s.custom_name || s.name || 'Step ' + (i + 1);
        html += '<div class="funnel-step">'
            + '<div class="funnel-step-label">' + esc(name) + '</div>'
            + '<div style="flex:1;background:' + trackBg + ';border-radius:3px;overflow:hidden;">'
            + '<div class="funnel-step-bar" style="width:' + pct.toFixed(1) + '%"></div>'
            + '</div>'
            + '<div class="funnel-step-pct">' + convRate + '</div>'
            + '</div>';
    }
    return html;
}

function renderRetention(cohorts, large) {
    if (!cohorts || cohorts.length === 0) return '<div class="insight-card-empty">No data</div>';
    const limit = large ? Math.min(cohorts.length, 8) : Math.min(cohorts.length, 4);
    const colLimit = large ? 8 : 5;
    let html = '';
    for (let r = 0; r < limit; r++) {
        const c = cohorts[r];
        const baseCount = c.values && c.values[0] ? c.values[0].count : 0;
        html += '<div class="retention-row">';
        html += '<div class="retention-label">' + esc(c.label) + '</div>';
        const cols = Math.min(c.values ? c.values.length : 0, colLimit);
        for (let col = 0; col < cols; col++) {
            const val = c.values[col];
            const pct = baseCount > 0 ? (val.count / baseCount * 100) : 0;
            const alpha = Math.max(0.08, pct / 100);
            const bg = 'rgba(29,74,255,' + alpha.toFixed(2) + ')';
            const textColor = alpha > 0.4 ? '#fff' : (isDarkTheme() ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)');
            const text = col === 0 ? baseCount : Math.round(pct) + '%';
            html += '<div class="retention-cell" style="background:' + bg + ';color:' + textColor + ';' + (col === 0 ? 'width:32px;font-size:8px;' : '') + '">' + text + '</div>';
        }
        html += '</div>';
    }
    return html;
}

function renderTableWidget(series, large) {
    if (!series || series.length === 0) return '<div class="insight-card-empty">No data</div>';
    const limit = large ? 10 : 5;
    const sorted = [...series].sort((a, b) => (b.count || 0) - (a.count || 0));
    let html = '<table class="table-widget">';
    for (let i = 0; i < Math.min(sorted.length, limit); i++) {
        const s = sorted[i];
        html += '<tr><td>' + esc(s.label || 'Unknown') + '</td><td>' + formatNum(s.count || 0) + '</td></tr>';
    }
    html += '</table>';
    return html;
}

function renderWorldMap(series, large) {
    if (!series || series.length === 0) return '<div class="insight-card-empty">No data</div>';
    const sorted = [...series].sort((a, b) => (b.aggregated_value || b.count || 0) - (a.aggregated_value || a.count || 0));
    const limit = large ? 10 : 5;
    let html = '<table class="table-widget">';
    for (let i = 0; i < Math.min(sorted.length, limit); i++) {
        const s = sorted[i];
        const val = s.aggregated_value || s.count || 0;
        if (val === 0) continue;
        const label = s.breakdown_value || s.label || 'Unknown';
        html += '<tr><td>' + esc(label) + '</td><td>' + formatNum(val) + '</td></tr>';
    }
    html += '</table>';
    return html;
}

function renderLifecycle(series, large) {
    if (!series || series.length === 0) return '<div class="insight-card-empty">No data</div>';

    const statusColors = { new: '#4CBB17', returning: '#1D4AFF', resurrecting: '#F9BD2B', dormant: '#F44336' };
    const h = large ? 80 : 36;
    let svgPaths = '';

    for (const s of series) {
        const data = s.data;
        if (!data || data.length === 0) continue;
        const absData = data.map(v => Math.abs(v));
        const allAbs = series.flatMap(x => (x.data || []).map(v => Math.abs(v)));
        const max = Math.max(...allAbs, 1);
        const w = 200;
        const step = w / Math.max(data.length - 1, 1);
        const points = absData.map((v, i) => {
            const x = (i * step).toFixed(1);
            const y = (h - 2 - (v / max) * (h - 4)).toFixed(1);
            return x + ',' + y;
        }).join(' ');
        const color = statusColors[s.status] || '#999';
        svgPaths += '<polyline points="' + points + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>';
    }

    if (large) {
        const baselineColor = isDarkTheme() ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
        svgPaths += '<line x1="0" y1="' + (h - 2) + '" x2="200" y2="' + (h - 2) + '" stroke="' + baselineColor + '" stroke-width="0.5"/>';
    }

    let legend = '';
    if (large) {
        legend = '<div style="display:flex;gap:10px;margin-top:6px;flex-wrap:wrap;">';
        for (const s of series) {
            const color = statusColors[s.status] || '#999';
            const val = Math.abs(s.count || 0);
            legend += '<span style="font-size:9px;display:flex;align-items:center;gap:3px;">'
                + '<span style="width:6px;height:6px;border-radius:50%;background:' + color + ';"></span>'
                + s.status + ' (' + formatNum(val) + ')'
                + '</span>';
        }
        legend += '</div>';
    }

    return '<div class="sparkline-container"><svg viewBox="0 0 200 ' + h + '" preserveAspectRatio="none">' + svgPaths + '</svg></div>' + legend;
}

function renderTrendArrow(current, previous) {
    if (previous === 0 || current === previous) return '';
    const diff = current - previous;
    const pct = Math.round((diff / Math.abs(previous)) * 100);
    if (Math.abs(pct) > 1000) return '';
    const arrow = pct > 0 ? '&#x25B2;' : '&#x25BC;';
    const color = pct > 0 ? 'var(--ph-green)' : 'var(--ph-red)';
    return '<span style="font-size:9px;color:' + color + ';">' + arrow + ' ' + Math.abs(pct) + '%</span>';
}

function formatNum(n) {
    if (n == null) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(Math.round(n));
}

// ── Detail panel ──

function showDetail(title, bodyHtml) {
    document.getElementById('detail-title').textContent = title;
    const body = document.getElementById('detail-body');
    body.innerHTML = bodyHtml;
    document.getElementById('detail-panel').classList.add('visible');

    body.querySelectorAll('.act-detail-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            if (action === 'findRefs') send({ type: 'findReferences', key: btn.dataset.key });
            else if (action === 'copy') send({ type: 'copyFlagKey', key: btn.dataset.key });
            else if (action === 'open') send({ type: 'openExternal', path: btn.dataset.path });
            else if (action === 'refreshInsight') send({ type: 'refreshInsight', insightId: Number(btn.dataset.insightId) });
        });
    });
}

function hideDetail() {
    document.getElementById('detail-panel').classList.remove('visible');
}

function extractFlagFilters(f) {
    let rollout = 100;
    let variants = [];
    let payloads = {};
    const filters = f.filters || {};
    if (filters.groups && filters.groups.length > 0 && filters.groups[0].rollout_percentage != null) {
        rollout = filters.groups[0].rollout_percentage;
    } else if (f.rollout_percentage != null) {
        rollout = f.rollout_percentage;
    }
    if (filters.multivariate && filters.multivariate.variants) {
        variants = filters.multivariate.variants;
    }
    if (filters.payloads) {
        payloads = filters.payloads;
    }
    return { rollout, variants, payloads };
}

function showFlagDetail(key) {
    const f = allData.flags.find(x => x.key === key);
    if (!f) return;

    const created = f.created_at ? new Date(f.created_at).toLocaleDateString() : 'Unknown';
    const createdBy = f.created_by ? (f.created_by.first_name || f.created_by.email) : 'Unknown';
    const { rollout, variants, payloads } = extractFlagFilters(f);
    const isMultivariate = variants.length > 0;

    let html = ''
        + detailField('Key', '<code>' + esc(f.key) + '</code>')
        + (f.name ? detailField('Name', esc(f.name)) : '');

    // ── Status toggle ──
    html += '<div class="detail-field">'
        + '<div class="detail-label">Status</div>'
        + '<div class="flag-toggle-row">'
        + '<button class="flag-toggle' + (f.active ? ' active' : '') + '" id="flag-toggle" data-flag-id="' + f.id + '">'
        + '<span class="flag-toggle-knob"></span>'
        + '</button>'
        + '<span class="flag-toggle-label" id="flag-toggle-label">' + (f.active ? 'Active' : 'Inactive') + '</span>'
        + '</div></div>';

    // ── Rollout / Variants ──
    if (isMultivariate) {
        html += '<div class="detail-field">'
            + '<div class="detail-label">Variants</div>'
            + '<div class="flag-variants" id="flag-variants">';
        variants.forEach(function(v, i) {
            html += '<div class="flag-variant-row" data-idx="' + i + '">'
                + '<input class="flag-variant-key" value="' + esc(v.key) + '" data-field="key" placeholder="variant key" />'
                + '<input class="flag-variant-pct" type="number" min="0" max="100" value="' + v.rollout_percentage + '" data-field="pct" />'
                + '<span class="flag-variant-pct-sign">%</span>'
                + '<button class="flag-variant-remove" data-idx="' + i + '" title="Remove variant">&times;</button>'
                + '</div>';
        });
        html += '</div>'
            + '<button class="flag-add-variant" id="flag-add-variant">+ Add variant</button>'
            + '</div>';
    } else {
        html += '<div class="detail-field">'
            + '<div class="detail-label">Rollout percentage</div>'
            + '<div class="flag-rollout-row">'
            + '<input type="range" class="flag-rollout-slider" id="flag-rollout-slider" min="0" max="100" value="' + rollout + '" />'
            + '<input type="number" class="flag-rollout-num" id="flag-rollout-num" min="0" max="100" value="' + rollout + '" />'
            + '<span class="flag-variant-pct-sign">%</span>'
            + '</div></div>';
    }

    // ── Payload ──
    const payloadKeys = isMultivariate ? variants.map(function(v) { return v.key; }) : ['true'];
    html += '<div class="detail-field">'
        + '<div class="detail-label">Payload</div>';
    payloadKeys.forEach(function(pk) {
        const val = payloads[pk] != null ? (typeof payloads[pk] === 'string' ? payloads[pk] : JSON.stringify(payloads[pk], null, 2)) : '';
        html += '<div class="flag-payload-block">'
            + (payloadKeys.length > 1 ? '<div class="flag-payload-variant-label">' + esc(pk) + '</div>' : '')
            + '<textarea class="flag-payload-editor" data-payload-key="' + esc(pk) + '" placeholder="JSON payload (optional)" spellcheck="false">' + esc(val) + '</textarea>'
            + '</div>';
    });
    html += '</div>';

    // ── Save button (only shown for write access) ──
    if (canWrite) {
        html += '<div class="flag-save-row">'
            + '<button class="detail-btn primary flag-save-btn" id="flag-save-btn" data-flag-id="' + f.id + '">Save Changes</button>'
            + '<span class="flag-save-status" id="flag-save-status"></span>'
            + '</div>';
    } else {
        html += '<div class="flag-save-row" style="opacity:0.6;font-size:11px;padding:6px 0;">Read-only access &mdash; editing disabled</div>';
    }

    // ── Meta + actions ──
    html += detailField('Created', created + ' by ' + esc(createdBy))
        + '<div class="detail-actions">'
        + detailBtn('secondary', 'findRefs', { key: f.key }, 'Find References')
        + detailBtn('secondary', 'copy', { key: f.key }, 'Copy Key')
        + detailBtn('secondary', 'open', { path: '/project/' + projectId + '/feature_flags/' + f.id }, 'Open in PostHog')
        + '</div>';

    showDetail(f.key, html);

    // ── Disable controls for read-only access ──
    if (!canWrite) {
        document.querySelectorAll('.flag-toggle, .flag-rollout-slider, .flag-rollout-num, .flag-variant-key, .flag-variant-pct, .flag-variant-remove, .flag-add-variant, .flag-payload-editor').forEach(function(el) {
            el.disabled = true;
            el.style.pointerEvents = 'none';
            el.style.opacity = '0.5';
        });
    }

    // ── Bind controls ──
    const toggle = document.getElementById('flag-toggle');
    toggle.addEventListener('click', function() {
        toggle.classList.toggle('active');
        document.getElementById('flag-toggle-label').textContent = toggle.classList.contains('active') ? 'Active' : 'Inactive';
    });

    const slider = document.getElementById('flag-rollout-slider');
    const num = document.getElementById('flag-rollout-num');
    if (slider && num) {
        slider.addEventListener('input', function() { num.value = slider.value; });
        num.addEventListener('input', function() { slider.value = num.value; });
    }

    // Variant add / remove
    const addBtn = document.getElementById('flag-add-variant');
    if (addBtn) {
        addBtn.addEventListener('click', function() {
            const container = document.getElementById('flag-variants');
            const idx = container.children.length;
            const row = document.createElement('div');
            row.className = 'flag-variant-row';
            row.dataset.idx = idx;
            row.innerHTML = '<input class="flag-variant-key" value="" data-field="key" placeholder="variant key" />'
                + '<input class="flag-variant-pct" type="number" min="0" max="100" value="0" data-field="pct" />'
                + '<span class="flag-variant-pct-sign">%</span>'
                + '<button class="flag-variant-remove" data-idx="' + idx + '" title="Remove variant">&times;</button>';
            container.appendChild(row);
            bindRemoveButtons();
        });
    }

    function bindRemoveButtons() {
        document.querySelectorAll('.flag-variant-remove').forEach(function(btn) {
            btn.onclick = function() { btn.closest('.flag-variant-row').remove(); };
        });
    }
    bindRemoveButtons();

    // Save — with confirmation dialog
    var saveBtn = document.getElementById('flag-save-btn');
    if (saveBtn) {
    saveBtn.addEventListener('click', function() {
        var saveBtnEl = this;
        var flagId = Number(saveBtnEl.dataset.flagId);

        // Gather the changes first
        function gatherChanges() {
            var active = document.getElementById('flag-toggle').classList.contains('active');
            var variantRows = document.querySelectorAll('.flag-variant-row');
            var filters = {};

            if (variantRows.length > 0) {
                var newVariants = [];
                variantRows.forEach(function(row) {
                    var k = row.querySelector('[data-field="key"]').value.trim();
                    var p = Number(row.querySelector('[data-field="pct"]').value) || 0;
                    if (k) newVariants.push({ key: k, rollout_percentage: p });
                });
                filters.multivariate = { variants: newVariants };
                filters.groups = (f.filters && f.filters.groups) || [{ properties: [], rollout_percentage: 100 }];
            } else {
                var pct = Number(document.getElementById('flag-rollout-num').value);
                filters.groups = [{ properties: [], rollout_percentage: pct }];
            }

            var payloadEditors = document.querySelectorAll('.flag-payload-editor');
            var newPayloads = {};
            var hasPayloads = false;
            payloadEditors.forEach(function(ta) {
                var val = ta.value.trim();
                if (val) {
                    try {
                        newPayloads[ta.dataset.payloadKey] = JSON.parse(val);
                    } catch(e) {
                        newPayloads[ta.dataset.payloadKey] = val;
                    }
                    hasPayloads = true;
                }
            });
            if (hasPayloads) filters.payloads = newPayloads;

            return { active: active, filters: filters };
        }

        // Remove any existing confirm bar
        var existing = document.querySelector('.confirm-bar');
        if (existing) existing.remove();

        // Show inline confirmation bar
        var bar = document.createElement('div');
        bar.className = 'confirm-bar';
        bar.innerHTML = '<span class="confirm-text">Apply changes to \\'<strong>' + esc(f.key) + '</strong>\\'? This affects production.</span>'
            + '<div class="confirm-actions">'
            + '<button class="btn-cancel">Cancel</button>'
            + '<button class="btn-confirm">Confirm</button>'
            + '</div>';

        var saveRow = saveBtnEl.closest('.flag-save-row');
        saveRow.parentNode.insertBefore(bar, saveRow);

        bar.querySelector('.btn-cancel').addEventListener('click', function() { bar.remove(); });
        bar.querySelector('.btn-confirm').addEventListener('click', function() {
            bar.remove();
            var changes = gatherChanges();
            var status = document.getElementById('flag-save-status');
            status.textContent = 'Saving...';
            status.className = 'flag-save-status';
            send({ type: 'updateFlag', flagId: flagId, active: changes.active, filters: changes.filters });
        });
    });
    }
}

function fmtPct(n) { return (n * 100).toFixed(1) + '%'; }
function fmtNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
}
function fmtVal(v, type) {
    if (v == null) return '-';
    if (type === 'funnel' || type === 'retention') return fmtPct(v);
    if (typeof v === 'number') return v.toFixed(2);
    return String(v);
}
function fmtDelta(d) {
    if (d == null) return '';
    var pct = (d * 100).toFixed(1);
    var cls = d > 0 ? 'positive' : d < 0 ? 'negative' : '';
    return '<span class="exp-delta ' + cls + '">' + (d > 0 ? '+' : '') + pct + '%</span>';
}
function metricTypeLabel(type) {
    if (type === 'funnel') return 'Funnel';
    if (type === 'mean') return 'Mean';
    if (type === 'ratio') return 'Ratio';
    if (type === 'retention') return 'Retention';
    return type;
}

function renderExposures(results, variants) {
    // Try to get exposure data from results.variants or from the first metric's samples
    var exposures = [];
    if (results.variants && results.variants.length > 0) {
        exposures = results.variants;
    } else if (results.primary && results.primary.results && results.primary.results[0]) {
        var d = results.primary.results[0].data;
        if (d && d.baseline) {
            exposures.push({ key: d.baseline.key, absolute_exposure: d.baseline.absolute_exposure || d.baseline.number_of_samples });
            if (d.variant_results) {
                d.variant_results.forEach(function(v) {
                    exposures.push({ key: v.key, absolute_exposure: v.absolute_exposure || v.number_of_samples });
                });
            }
        }
    }
    if (exposures.length === 0 && variants) {
        variants.forEach(function(v) { exposures.push({ key: v.key, absolute_exposure: 0 }); });
    }
    if (exposures.length === 0) return '';

    var total = exposures.reduce(function(s, e) { return s + (e.absolute_exposure || 0); }, 0);
    var html = '<div class="exp-section">'
        + '<div class="exp-section-title">Exposures</div>'
        + '<table class="exp-table"><thead><tr>'
        + '<th>Variant</th><th class="num">Exposures</th><th class="num">%</th>'
        + '</tr></thead><tbody>';
    exposures.forEach(function(e) {
        var pct = total > 0 ? ((e.absolute_exposure || 0) / total * 100).toFixed(1) + '%' : '-';
        html += '<tr><td>' + esc(e.key) + '</td>'
            + '<td class="num">' + fmtNum(e.absolute_exposure || 0) + '</td>'
            + '<td class="num">' + pct + '</td></tr>';
    });
    html += '<tr class="exp-table-total"><td>Total</td>'
        + '<td class="num">' + fmtNum(total) + '</td>'
        + '<td class="num">100%</td></tr>';
    html += '</tbody></table></div>';
    return html;
}

function renderMetricTable(label, metrics, metricResults) {
    if (!metrics || metrics.length === 0) return '';
    var hasResults = metricResults && metricResults.length > 0;

    var html = '<div class="exp-section">'
        + '<div class="exp-section-title">' + esc(label) + '</div>';

    metrics.forEach(function(metric, mi) {
        var result = hasResults ? metricResults[mi] : null;
        var goal = metric.goal === 'increase' ? '&uarr;' : '&darr;';
        var typeStr = metricTypeLabel(metric.metric_type);

        html += '<div class="exp-metric-block">'
            + '<div class="exp-metric-name">' + (mi + 1) + '. ' + esc(metric.name || 'Unnamed')
            + '<span class="exp-metric-type">' + typeStr + '</span></div>';

        if (result && result.data) {
            var baseline = result.data.baseline;
            var variants = result.data.variant_results || [];
            var winner = variants.length > 0
                ? variants.reduce(function(b, v) { return v.chance_to_win > b.chance_to_win ? v : b; })
                : null;

            html += '<table class="exp-table"><thead><tr>'
                + '<th>Variant</th><th class="num">Value</th><th class="num">Delta</th><th class="num">Win %</th>'
                + '</tr></thead><tbody>';

            // Baseline row
            html += '<tr class="exp-table-baseline"><td>' + esc(baseline.key) + '</td>'
                + '<td class="num">' + fmtVal(baseline.mean, metric.metric_type)
                + '<div class="exp-sub">' + fmtNum(baseline.number_of_samples) + '</div></td>'
                + '<td class="num">-</td><td class="num">-</td></tr>';

            // Variant rows
            variants.forEach(function(v) {
                var winPct = Math.round(v.chance_to_win * 100);
                var isWinner = v === winner && v.significant;
                var sigCls = v.significant ? (isWinner ? ' winner' : ' loser') : '';

                html += '<tr class="' + sigCls + '"><td>' + esc(v.key) + (isWinner ? ' &#x2B50;' : '') + '</td>'
                    + '<td class="num">' + fmtVal(v.mean, metric.metric_type)
                    + '<div class="exp-sub">' + fmtNum(v.number_of_samples) + '</div></td>'
                    + '<td class="num">' + fmtDelta(v.delta) + '</td>'
                    + '<td class="num">'
                    + '<span class="exp-win-pct' + sigCls + '">' + winPct + '%</span>'
                    + '</td></tr>';
            });

            html += '</tbody></table>';

            // Credible intervals
            var hasCi = variants.some(function(v) { return v.credible_interval; });
            if (hasCi) {
                // Collect all CI bounds for this metric for dynamic normalization
                var allBounds = [];
                variants.forEach(function(v) {
                    if (v.credible_interval) { allBounds.push(v.credible_interval[0] * 100, v.credible_interval[1] * 100); }
                });
                var dataMin = Math.min.apply(null, allBounds.concat([0]));
                var dataMax = Math.max.apply(null, allBounds.concat([0]));
                var ciPadding = Math.max(Math.abs(dataMax - dataMin) * 0.2, 1);
                var rangeMin = dataMin - ciPadding;
                var rangeMax = dataMax + ciPadding;
                var rangeSpan = rangeMax - rangeMin;

                html += '<div class="exp-ci-section">';
                variants.forEach(function(v) {
                    if (!v.credible_interval) return;
                    var ciLow = (v.credible_interval[0] * 100).toFixed(1);
                    var ciHigh = (v.credible_interval[1] * 100).toFixed(1);
                    var leftPct = ((v.credible_interval[0] * 100 - rangeMin) / rangeSpan * 100);
                    var widthPct = ((v.credible_interval[1] - v.credible_interval[0]) * 100 / rangeSpan * 100);
                    var zeroPct = ((0 - rangeMin) / rangeSpan * 100);
                    var barCls = v.credible_interval[0] > 0 ? 'positive' : v.credible_interval[1] < 0 ? 'negative' : 'neutral';

                    html += '<div class="exp-ci-row">'
                        + '<span class="exp-ci-label">' + esc(v.key) + '</span>'
                        + '<div class="exp-ci-track">'
                        + '<div class="exp-ci-zero" style="left:' + zeroPct + '%"></div>'
                        + '<div class="exp-ci-bar ' + barCls + '" style="left:' + leftPct + '%;width:' + Math.max(widthPct, 1) + '%"></div>'
                        + '</div>'
                        + '<span class="exp-ci-range">[' + ciLow + '%, ' + ciHigh + '%]</span>'
                        + '</div>';
                });
                html += '</div>';
            }
        } else {
            html += '<div class="exp-metric-item">' + typeStr + ' ' + goal + ' &mdash; no results yet</div>';
        }
        html += '</div>';
    });
    html += '</div>';
    return html;
}

function showExperimentDetail(id) {
    const exp = allData.experiments.find(x => String(x.id) === String(id));
    if (!exp) return;

    let status, dotClass;
    if (exp.end_date) { status = 'Complete'; dotClass = 'complete'; }
    else if (exp.start_date) { status = 'Running'; dotClass = 'running'; }
    else { status = 'Draft'; dotClass = 'draft'; }

    const created = exp.created_at ? new Date(exp.created_at).toLocaleDateString() : 'Unknown';
    const createdBy = exp.created_by ? (exp.created_by.first_name || exp.created_by.email) : 'Unknown';

    let html = ''
        + detailField('Status', '<span class="detail-status">' + statusDotHtml(dotClass) + ' ' + status + '</span>')
        + detailField('Feature flag', '<code>' + esc(exp.feature_flag_key) + '</code>')
        + (exp.description ? detailField('Description', esc(exp.description)) : '');

    // Duration
    if (exp.start_date) {
        const start = new Date(exp.start_date);
        const end = exp.end_date ? new Date(exp.end_date) : new Date();
        const days = Math.ceil((end.getTime() - start.getTime()) / 86400000);
        html += detailField('Duration', days + ' day' + (days !== 1 ? 's' : '') + (exp.end_date ? '' : ' (running)'));
    }

    // Sample size progress
    const recSampleSize = exp.parameters && exp.parameters.recommended_sample_size;
    if (exp.start_date && recSampleSize && recSampleSize > 0) {
        const results = experimentResults[exp.id];
        if (results && results.primary && results.primary.results && results.primary.results[0] && results.primary.results[0].data) {
            const d = results.primary.results[0].data;
            let totalSamples = d.baseline.number_of_samples;
            if (d.variant_results) {
                d.variant_results.forEach(function(v) { totalSamples += v.number_of_samples; });
            }
            const pct = Math.min(Math.round((totalSamples / recSampleSize) * 100), 100);
            html += '<div class="detail-field"><div class="detail-label">Sample progress</div>'
                + '<div class="exp-progress">'
                + '<div class="exp-progress-bar"><div class="exp-progress-fill" style="width:' + pct + '%"></div></div>'
                + '<div class="exp-progress-text">' + fmtNum(totalSamples) + ' / ' + fmtNum(recSampleSize) + ' samples (' + pct + '%)</div>'
                + '</div></div>';
        }
    }

    // Conclusion
    if (exp.conclusion) {
        const cIcon = exp.conclusion === 'won' ? '&#x1F3C6;' : '&#x274C;';
        const cText = exp.conclusion === 'won' ? 'Winner declared' : 'No winner';
        html += '<div class="exp-conclusion ' + exp.conclusion + '">'
            + cIcon + ' <strong>' + cText + '</strong>'
            + (exp.conclusion_comment ? '<div class="exp-conclusion-comment">' + esc(exp.conclusion_comment.split('\\n')[0]) + '</div>' : '')
            + '</div>';
    }

    // Results
    const results = experimentResults[exp.id];
    const variants = exp.parameters && exp.parameters.feature_flag_variants;

    if (results) {
        html += renderExposures(results, variants);
        html += renderMetricTable('Primary metrics', exp.metrics, results.primary && results.primary.results);
        html += renderMetricTable('Secondary metrics', exp.metrics_secondary, results.secondary && results.secondary.results);
    } else {
        // Show variant allocation if no results
        if (variants && variants.length > 0) {
            html += '<div class="exp-section"><div class="exp-section-title">Variant allocation</div>'
                + '<table class="exp-table"><thead><tr><th>Variant</th><th class="num">%</th></tr></thead><tbody>';
            variants.forEach(function(v) {
                html += '<tr><td>' + esc(v.key) + '</td><td class="num">' + v.rollout_percentage + '%</td></tr>';
            });
            html += '</tbody></table></div>';
        }
        // Show metrics list
        if (exp.metrics && exp.metrics.length > 0) {
            html += '<div class="exp-section"><div class="exp-section-title">Metrics</div>';
            exp.metrics.forEach(function(m) {
                var goal = m.goal === 'increase' ? '&uarr;' : '&darr;';
                html += '<div class="exp-metric-item">' + metricTypeLabel(m.metric_type) + ': ' + esc(m.name || 'Unnamed') + ' ' + goal + '</div>';
            });
            html += '</div>';
        }
    }

    html += detailField('Created', created + ' by ' + esc(createdBy))
        + '<div class="detail-actions">'
        + detailBtn('primary', 'findRefs', { key: exp.feature_flag_key }, 'Find References')
        + detailBtn('secondary', 'copy', { key: exp.feature_flag_key }, 'Copy Flag Key')
        + detailBtn('secondary', 'open', { path: '/project/' + projectId + '/experiments/' + exp.id }, 'Open in PostHog')
        + '</div>';

    showDetail(exp.name, html);
}

function showInsightDetail(id) {
    const ins = allData.analytics.find(x => String(x.id) === String(id));
    if (!ins) return;

    const refreshed = ins.last_refresh ? 'Last refreshed ' + timeAgo(ins.last_refresh) : 'Not yet computed';
    const kind = insightTypeLabel(ins);

    showDetail(ins.name || 'Untitled', ''
        + '<div class="insight-detail-meta">' + kind + ' &middot; ' + refreshed + '</div>'
        + '<div class="insight-detail-viz">' + renderInsightViz(ins, true) + '</div>'
        + (ins.description ? detailField('Description', esc(ins.description)) : '')
        + detailField('Created', ins.created_at ? new Date(ins.created_at).toLocaleDateString() : 'Unknown')
        + '<div class="detail-actions">'
        + detailBtn('primary', 'open', { path: '/project/' + projectId + '/insights/' + (ins.short_id || ins.id) }, 'Open in PostHog')
        + detailBtn('secondary', 'refreshInsight', { 'insight-id': ins.id }, 'Refresh Data')
        + '</div>'
    );
}

// ── Event listeners ──

document.getElementById('btn-sign-in').addEventListener('click', () => send({ type: 'signIn' }));
document.getElementById('btn-select-project-welcome').addEventListener('click', () => send({ type: 'selectProject' }));
document.getElementById('btn-select-project').addEventListener('click', () => send({ type: 'selectProject' }));
document.getElementById('btn-sign-out').addEventListener('click', () => send({ type: 'signOut' }));
document.getElementById('search').addEventListener('input', filterItems);
document.getElementById('my-flags-toggle').addEventListener('click', function() {
    myFlagsOnly = !myFlagsOnly;
    this.classList.toggle('active', myFlagsOnly);
    if (allData.flags.length) { renderFlags(allData.flags); }
});
document.getElementById('platform-select').addEventListener('change', function() {
    filterInsightsByPlatform(this.value);
});
document.getElementById('detail-back').addEventListener('click', hideDetail);
document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => { hideDetail(); switchTab(tab.dataset.tab); });
});

// ── Infinite scroll ──

document.querySelector('.scroll-area').addEventListener('scroll', function() {
    var el = this;
    var nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (!nearBottom) return;

    if (currentTab === 'flags' && hasMoreFlags && !loadingMoreFlags) {
        loadingMoreFlags = true;
        send({ type: 'loadMoreFlags' });
    }
    if (currentTab === 'experiments' && hasMoreExperiments && !loadingMoreExperiments) {
        loadingMoreExperiments = true;
        send({ type: 'loadMoreExperiments' });
    }
});

// ── Message handler ──

window.addEventListener('message', e => {
    const msg = e.data;
    switch (msg.type) {
        case 'authState':
            var showWelcome = !msg.authenticated && !msg.needsProject;
            var showNeedsProject = msg.needsProject;
            var showApp = msg.authenticated && !msg.needsProject;
            document.getElementById('welcome-screen').style.display = showWelcome ? '' : 'none';
            document.getElementById('needs-project-screen').style.display = showNeedsProject ? '' : 'none';
            document.getElementById('main-app').style.display = showApp ? '' : 'none';
            if (showApp) {
                loadedTabs.clear();
                loadedTabs.add('flags');
                switchTab('flags');
                send({ type: 'loadFlags' });
            }
            // Update project name + host in header
            var projNameEl = document.getElementById('project-name');
            if (projNameEl) {
                var host = msg.posthogHost || '';
                var hostShort = '';
                try {
                    var hostname = host ? new URL(host).hostname : '';
                    hostShort = (hostname === 'us.posthog.com' || hostname === 'us.i.posthog.com') ? 'US'
                        : (hostname === 'eu.posthog.com' || hostname === 'eu.i.posthog.com') ? 'EU'
                        : hostname;
                } catch(e) { hostShort = host; }
                var projLabel = msg.projectName ? msg.projectName + ' [' + hostShort + ']' : hostShort;
                projNameEl.textContent = projLabel;
                projNameEl.title = (msg.projectName || '') + ' — ' + host;
            }
            // Update RBAC badge
            canWrite = msg.canWrite !== false;
            var rbacBadge = document.getElementById('rbac-badge');
            if (rbacBadge) { rbacBadge.style.display = canWrite ? 'none' : ''; }
            break;
        case 'loading': {
            const loader = document.getElementById(msg.section + '-loading');
            const list = document.getElementById(msg.section + '-list');
            const empty = document.getElementById(msg.section + '-empty');
            if (loader) {
                loader.style.display = '';
                // Remove any prior error state
                var prevError = loader.parentNode ? loader.parentNode.querySelector('.error-state') : null;
                if (prevError) prevError.remove();
            }
            if (list) list.style.display = 'none';
            if (empty) empty.style.display = 'none';
            break;
        }
        case 'loadingProgress': {
            var progressLoader = document.getElementById(msg.section + '-loading');
            if (progressLoader) {
                var loaded = msg.loaded;
                var total = msg.total;
                var sectionName = msg.section === 'flags' ? 'flags' : msg.section === 'experiments' ? 'experiments' : 'events';
                if (total && total > loaded) {
                    progressLoader.textContent = 'Loading ' + sectionName + '... ' + loaded + ' / ' + total;
                } else {
                    progressLoader.textContent = 'Loading ' + sectionName + '... ' + loaded;
                }
            }
            break;
        }
        case 'flags':
            projectId = msg.projectId;
            hasMoreFlags = !!msg.hasMore;
            allData.flagsTotal = msg.total || null;
            if (msg.userEmail) {
                userEmail = msg.userEmail;
                var myBtn = document.getElementById('my-flags-toggle');
                if (myBtn && currentTab === 'flags') { myBtn.style.display = ''; }
            }
            renderFlags(msg.data);
            break;
        case 'flagsPage':
            hasMoreFlags = !!msg.hasMore;
            allData.flagsTotal = msg.total || allData.flagsTotal;
            appendFlags(msg.data);
            break;
        case 'experiments':
            projectId = msg.projectId;
            hasMoreExperiments = !!msg.hasMore;
            allData.experimentsTotal = msg.total || null;
            if (msg.results) experimentResults = msg.results;
            renderExperiments(msg.data);
            break;
        case 'experimentsPage':
            hasMoreExperiments = !!msg.hasMore;
            allData.experimentsTotal = msg.total || allData.experimentsTotal;
            if (msg.results) Object.assign(experimentResults, msg.results);
            appendExperiments(msg.data);
            break;
        case 'insights':
            projectId = msg.projectId;
            renderInsights(msg.data);
            break;
        case 'insightRefreshed': {
            const idx = allData.analytics.findIndex(x => x.id === msg.data.id);
            if (idx >= 0) {
                allData.analytics[idx] = msg.data;
                renderInsights(allData.analytics);
                showInsightDetail(String(msg.data.id));
            }
            break;
        }
        case 'navigateToFlag':
            send({ type: 'openFlagPanel', key: msg.key });
            break;
        case 'navigateToExperiment': {
            const navExp = allData.experiments.find(x => x.feature_flag_key === msg.flagKey);
            if (navExp) send({ type: 'openExperimentPanel', id: navExp.id });
            break;
        }
        case 'flagUpdated': {
            const fi = allData.flags.findIndex(x => x.id === msg.data.id);
            if (fi >= 0) { allData.flags[fi] = msg.data; }
            const saveStatus = document.getElementById('flag-save-status');
            if (saveStatus) { saveStatus.textContent = 'Saved'; saveStatus.className = 'flag-save-status success'; }
            setTimeout(function() { showFlagDetail(msg.data.key); }, 600);
            break;
        }
        case 'flagUpdateError': {
            const errStatus = document.getElementById('flag-save-status');
            if (errStatus) { errStatus.textContent = msg.message || 'Failed'; errStatus.className = 'flag-save-status error'; }
            break;
        }
        case 'error': {
            const errLoader = document.getElementById(msg.section + '-loading');
            const errList = document.getElementById(msg.section + '-list');
            const errEmpty = document.getElementById(msg.section + '-empty');
            if (errLoader) errLoader.style.display = 'none';
            if (errList) errList.style.display = 'none';
            if (errEmpty) errEmpty.style.display = 'none';
            // Insert error state UI after the loading element
            var errContainer = errLoader ? errLoader.parentNode : null;
            if (errContainer) {
                var oldError = errContainer.querySelector('.error-state');
                if (oldError) oldError.remove();
                var errDiv = document.createElement('div');
                errDiv.className = 'error-state';
                errDiv.innerHTML = '<span class="error-icon">&#x26A0;</span>'
                    + '<span class="error-message">' + esc(msg.message) + '</span>'
                    + '<button class="error-retry" data-section="' + esc(msg.section) + '">Retry</button>';
                errContainer.appendChild(errDiv);
                errDiv.querySelector('.error-retry').addEventListener('click', function() {
                    var section = this.dataset.section;
                    errDiv.remove();
                    send({ type: 'retry', section: section });
                });
            }
            break;
        }
    }
});

// ── Feedback ──

var feedbackRating = null;

document.querySelectorAll('.feedback-emoji').forEach(function(btn) {
    btn.addEventListener('click', function() {
        feedbackRating = btn.dataset.rating;
        document.querySelectorAll('.feedback-emoji').forEach(function(b) {
            b.classList.toggle('selected', b.dataset.rating === feedbackRating);
        });
    });
});

document.getElementById('feedback-send-btn').addEventListener('click', function() {
    var message = document.getElementById('feedback-message').value.trim();
    if (!feedbackRating && !message) { return; }

    send({
        type: 'sendFeedback',
        message: message,
        rating: feedbackRating || 'none'
    });

    // Show success, reset form
    document.getElementById('feedback-message').value = '';
    document.querySelectorAll('.feedback-emoji').forEach(function(b) { b.classList.remove('selected'); });
    feedbackRating = null;

    var successEl = document.getElementById('feedback-success');
    var sendBtn = document.getElementById('feedback-send-btn');
    successEl.style.display = '';
    sendBtn.style.display = 'none';

    setTimeout(function() {
        successEl.style.display = 'none';
        sendBtn.style.display = '';
    }, 3000);
});

// ── Init ──
send({ type: 'ready' });`;
}
