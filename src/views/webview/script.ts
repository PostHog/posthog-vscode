export function getScript(): string {
    return /*js*/ `
const vscode = acquireVsCodeApi();
function send(msg) { vscode.postMessage(msg); }

let currentTab = 'flags';
let loadedTabs = new Set();
let allData = { flags: [], errors: [], experiments: [] };
let projectId = null;

// ── Helpers ──

function esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML.replace(/"/g, '&quot;');
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

    if (!loadedTabs.has(tab)) {
        loadedTabs.add(tab);
        if (tab === 'flags') send({ type: 'loadFlags' });
        else if (tab === 'errors') send({ type: 'loadErrors' });
        else if (tab === 'experiments') send({ type: 'loadExperiments' });
    }
}

// ── Search / filter ──

function filterItems() {
    const q = document.getElementById('search').value.toLowerCase();
    const list = document.getElementById(currentTab + '-list');
    list.querySelectorAll('.item').forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(q) ? '' : 'none';
    });
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

function renderFlags(flags) {
    allData.flags = flags;
    renderSection('flags', flags, (list, items) => {
        list.innerHTML = items.map(f => {
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
        }).join('');
        bindListClicks(list, 'key', showFlagDetail);
    });
}

function renderErrors(issues) {
    allData.errors = issues;
    renderSection('errors', issues, (list, items) => {
        list.innerHTML = items.map(e => {
            const dotClass = e.status === 'resolved' ? 'resolved' : 'error';
            const desc = e.description ? e.description.split('\\\\n')[0].substring(0, 120) : '';
            const badge = e.occurrences != null ? '<span class="badge count">' + e.occurrences + '</span>' : '';
            const issueId = e.short_id || e.id;
            return '<div class="item" data-id="' + esc(e.id) + '" style="cursor:pointer;">'
                + '<div class="dot ' + dotClass + '"></div>'
                + '<div class="info">'
                + '<div class="primary">' + esc(e.name || 'Unknown error') + '</div>'
                + '<div class="secondary">' + esc(desc) + '</div>'
                + '</div>'
                + badge
                + '<div class="item-actions">'
                + '<button class="act-open" data-path="/project/' + projectId + '/error_tracking/' + issueId + '" title="Open in PostHog">&#x2197;</button>'
                + '</div>'
                + '</div>';
        }).join('');
        bindListClicks(list, 'id', showErrorDetail);
    });
}

function renderExperiments(exps) {
    allData.experiments = exps;
    renderSection('experiments', exps, (list, items) => {
        list.innerHTML = items.map(exp => {
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
        }).join('');
        bindListClicks(list, 'id', showExperimentDetail);
    });
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
            else if (action === 'jumpError') send({ type: 'jumpToError', issueId: btn.dataset.issueId });
        });
    });
}

function hideDetail() {
    document.getElementById('detail-panel').classList.remove('visible');
}

function showFlagDetail(key) {
    const f = allData.flags.find(x => x.key === key);
    if (!f) return;

    const rollout = f.rollout_percentage != null ? f.rollout_percentage + '%' : 'N/A';
    const created = f.created_at ? new Date(f.created_at).toLocaleDateString() : 'Unknown';
    const createdBy = f.created_by ? (f.created_by.first_name || f.created_by.email) : 'Unknown';

    showDetail(f.key, ''
        + detailField('Key', '<code>' + esc(f.key) + '</code>')
        + (f.name ? detailField('Name', esc(f.name)) : '')
        + detailField('Status', '<span class="detail-status">' + statusDotHtml(f.active ? 'active' : 'inactive') + ' ' + (f.active ? 'Active' : 'Inactive') + '</span>')
        + detailField('Rollout', rollout)
        + detailField('Created', created + ' by ' + esc(createdBy))
        + '<div class="detail-actions">'
        + detailBtn('primary', 'findRefs', { key: f.key }, 'Find References')
        + detailBtn('secondary', 'copy', { key: f.key }, 'Copy Key')
        + detailBtn('secondary', 'open', { path: '/project/' + projectId + '/feature_flags/' + f.id }, 'Open in PostHog')
        + '</div>'
    );
}

function showErrorDetail(id) {
    const e = allData.errors.find(x => x.id === id);
    if (!e) return;

    const dotClass = e.status === 'resolved' ? 'resolved' : 'error';
    const desc = e.description || '';
    const issueId = e.short_id || e.id;

    showDetail(e.name || 'Unknown error', ''
        + detailField('Status', '<span class="detail-status">' + statusDotHtml(dotClass) + ' ' + esc(e.status) + '</span>')
        + detailField('First seen', timeAgo(e.first_seen))
        + (e.last_seen ? detailField('Last seen', timeAgo(e.last_seen)) : '')
        + (e.occurrences != null ? detailField('Occurrences', String(e.occurrences)) : '')
        + (desc ? '<div class="detail-field"><div class="detail-label">Description</div><div class="detail-desc">' + esc(desc) + '</div></div>' : '')
        + '<div class="detail-actions">'
        + detailBtn('primary', 'jumpError', { 'issue-id': e.id }, 'Jump to Code')
        + detailBtn('secondary', 'open', { path: '/project/' + projectId + '/error_tracking/' + issueId }, 'Open in PostHog')
        + '</div>'
    );
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

    showDetail(exp.name, ''
        + detailField('Status', '<span class="detail-status">' + statusDotHtml(dotClass) + ' ' + status + '</span>')
        + detailField('Feature flag', '<code>' + esc(exp.feature_flag_key) + '</code>')
        + (exp.description ? detailField('Description', esc(exp.description)) : '')
        + (exp.start_date ? detailField('Started', new Date(exp.start_date).toLocaleDateString()) : '')
        + (exp.end_date ? detailField('Ended', new Date(exp.end_date).toLocaleDateString()) : '')
        + detailField('Created', created + ' by ' + esc(createdBy))
        + '<div class="detail-actions">'
        + detailBtn('primary', 'findRefs', { key: exp.feature_flag_key }, 'Find References')
        + detailBtn('secondary', 'copy', { key: exp.feature_flag_key }, 'Copy Flag Key')
        + detailBtn('secondary', 'open', { path: '/project/' + projectId + '/experiments/' + exp.id }, 'Open in PostHog')
        + '</div>'
    );
}

// ── Event listeners ──

document.getElementById('btn-sign-in').addEventListener('click', () => send({ type: 'signIn' }));
document.getElementById('btn-select-project').addEventListener('click', () => send({ type: 'selectProject' }));
document.getElementById('btn-sign-out').addEventListener('click', () => send({ type: 'signOut' }));
document.getElementById('search').addEventListener('input', filterItems);
document.getElementById('detail-back').addEventListener('click', hideDetail);
document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => { hideDetail(); switchTab(tab.dataset.tab); });
});

// ── Message handler ──

window.addEventListener('message', e => {
    const msg = e.data;
    switch (msg.type) {
        case 'authState':
            document.getElementById('welcome-screen').style.display = msg.authenticated ? 'none' : '';
            document.getElementById('main-app').style.display = msg.authenticated ? '' : 'none';
            if (msg.authenticated) {
                loadedTabs.clear();
                loadedTabs.add('flags');
            }
            break;
        case 'loading': {
            const loader = document.getElementById(msg.section + '-loading');
            const list = document.getElementById(msg.section + '-list');
            const empty = document.getElementById(msg.section + '-empty');
            if (loader) loader.style.display = '';
            if (list) list.style.display = 'none';
            if (empty) empty.style.display = 'none';
            break;
        }
        case 'flags':
            projectId = msg.projectId;
            renderFlags(msg.data);
            break;
        case 'errors':
            projectId = msg.projectId;
            renderErrors(msg.data);
            break;
        case 'experiments':
            projectId = msg.projectId;
            renderExperiments(msg.data);
            break;
        case 'error': {
            const errLoader = document.getElementById(msg.section + '-loading');
            if (errLoader) errLoader.textContent = msg.message;
            break;
        }
    }
});

// ── Init ──
send({ type: 'ready' });`;
}
