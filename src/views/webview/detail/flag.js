(function() {
    const f = DATA.flag;
    const experiment = DATA.experiment;
    const host = DATA.host;
    const projectId = DATA.projectId;
    const filters = f.filters || {};
    const groups = filters.groups || [];
    const multivariate = filters.multivariate;
    const variants = multivariate && multivariate.variants ? multivariate.variants : [];
    const isMulti = variants.length > 0;
    let rollout = 100;
    if (groups.length > 0 && groups[0].rollout_percentage != null) rollout = groups[0].rollout_percentage;
    else if (f.rollout_percentage != null) rollout = f.rollout_percentage;
    const payloads = filters.payloads || {};
    const created = f.created_at ? new Date(f.created_at).toLocaleDateString() : 'Unknown';
    const createdBy = f.created_by ? (f.created_by.first_name || f.created_by.email) : 'Unknown';

    // Flag type
    var hasPayload = Object.values(payloads).some(function(v) { return v != null; });
    var flagType = isMulti ? 'Multivariate' : hasPayload ? 'Remote config' : 'Boolean';
    var flagTypeDesc = isMulti ? 'Multiple variants with rollout percentages'
        : hasPayload ? 'Single payload without multivariate'
        : 'Release toggle (boolean) with optional payload';

    let html = '<div class="page">';

    // Hero
    html += '<div class="hero"><div class="hero-left">'
        + '<div class="hero-title">' + esc(f.key) + '</div>'
        + (f.name && f.name !== f.key ? '<div class="hero-subtitle">' + esc(f.name) + '</div>' : '')
        + '<div class="hero-badges"><span class="badge ' + (f.active ? 'active' : 'inactive') + '">' + (f.active ? 'Active' : 'Inactive') + '</span></div>'
        + '</div><div class="hero-actions">'
        + '<button class="btn btn-secondary"' + act({type:'findReferences',key:f.key}) + '>Find References</button>'
        + '<button class="btn btn-secondary"' + act({type:'copy',text:f.key}) + '>Copy Key</button>'
        + '<button class="btn btn-ghost"' + act({type:'openExternal',url:host+'/project/'+projectId+'/feature_flags/'+f.id}) + '>Open in PostHog &#x2197;</button>'
        + '</div></div>';

    // Metadata grid
    html += '<div class="card-row">';
    html += '<div class="card"><div class="card-title">Flag type</div><div class="stat-value">' + flagType + '</div><div style="font-size:11px;opacity:0.4;margin-top:2px">' + flagTypeDesc + '</div></div>';
    html += '<div class="card"><div class="card-title">Created</div><div class="stat-value">' + created + '</div><div style="font-size:11px;opacity:0.4;margin-top:2px">by ' + esc(createdBy) + '</div></div>';
    html += '</div>';

    // Experiment card (if this flag is part of an experiment)
    if (experiment) {
        var expStatus = experiment.end_date ? 'Completed' : (experiment.start_date ? 'Running' : 'Draft');
        var expStatusClass = experiment.end_date ? 'inactive' : (experiment.start_date ? 'active' : 'draft');
        html += '<div class="card experiment-card">';
        html += '<div class="card-title">Experiment</div>';
        html += '<div class="experiment-info">';
        html += '<div class="experiment-header">';
        html += '<span class="experiment-name">' + esc(experiment.name) + '</span>';
        html += '<span class="badge ' + expStatusClass + '">' + expStatus + '</span>';
        html += '</div>';
        if (experiment.description) {
            html += '<div class="experiment-desc">' + esc(experiment.description) + '</div>';
        }
        html += '<div class="experiment-actions">';
        html += '<button class="btn btn-secondary" id="view-experiment-btn" data-id="' + experiment.id + '">View Experiment</button>';
        html += '<button class="btn btn-ghost"' + act({type:'openExternal',url:host+'/project/'+projectId+'/experiments/'+experiment.id}) + '>Open in PostHog &#x2197;</button>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
    }

    // Status toggle
    html += '<div class="card"><div class="card-title">Enable feature flag</div>'
        + '<div class="toggle-row">'
        + '<button class="toggle' + (f.active ? ' on' : '') + '" id="flag-toggle"><span class="toggle-knob"></span></button>'
        + '<span class="toggle-label" id="toggle-label">' + (f.active ? 'Enabled' : 'Disabled') + '</span>'
        + '</div></div>';

    // Release conditions
    if (groups.length > 0) {
        html += '<div class="card"><div class="card-title">Release conditions</div>';
        html += '<div style="font-size:11px;opacity:0.4;margin-bottom:12px">Condition sets are evaluated top to bottom — the first match wins.</div>';
        groups.forEach(function(g, gi) {
            var props = g.properties || [];
            var gRollout = g.rollout_percentage != null ? g.rollout_percentage : 100;
            html += '<div class="condition-set">';
            html += '<div class="condition-header"><span class="condition-num">' + (gi+1) + '</span>';
            if (props.length > 0) {
                html += '<span>Match users against ' + props.length + ' propert' + (props.length === 1 ? 'y' : 'ies') + '</span>';
            } else {
                html += '<span>All users</span>';
            }
            html += '</div>';
            props.forEach(function(p) {
                var propKey = p.key || '';
                var op = p.operator || 'exact';
                var val = p.value != null ? (Array.isArray(p.value) ? p.value.join(', ') : String(p.value)) : '';
                html += '<div class="condition-prop">' + esc(propKey) + ' <span style="opacity:0.4">' + esc(op) + '</span> ' + esc(val) + '</div>';
            });
            html += '<div class="condition-rollout">Rolled out to <strong>' + gRollout + '%</strong> of users in this set.</div>';
            html += '</div>';
            if (gi < groups.length - 1) {
                html += '<div class="condition-or">OR</div>';
            }
        });
        html += '</div>';
    }

    // Rollout / Variants
    if (isMulti) {
        html += '<div class="card"><div class="card-title">Variants</div><div class="variant-list" id="variant-list">';
        variants.forEach(function(v, i) {
            html += '<div class="variant-row" data-idx="' + i + '">'
                + '<input class="variant-key-input" value="' + esc(v.key) + '" data-field="key" />'
                + '<input class="variant-pct-input" type="number" min="0" max="100" value="' + v.rollout_percentage + '" data-field="pct" />'
                + '<span class="pct-sign">%</span>'
                + '<button class="variant-remove" title="Remove">&times;</button>'
                + '</div>';
        });
        html += '</div><button class="add-variant-btn" id="add-variant">+ Add variant</button></div>';
    } else if (groups.length === 0) {
        // Only show the bare rollout slider if there are no condition groups
        html += '<div class="card"><div class="card-title">Rollout</div>'
            + '<div class="slider-row">'
            + '<input type="range" class="slider" id="rollout-slider" min="0" max="100" value="' + rollout + '" />'
            + '<input type="number" class="num-input" id="rollout-num" min="0" max="100" value="' + rollout + '" />'
            + '<span class="pct-sign">%</span>'
            + '</div></div>';
    }

    // Payload
    const payloadKeys = isMulti ? variants.map(function(v) { return v.key; }) : ['true'];
    var hasAnyPayload = payloadKeys.some(function(pk) { return payloads[pk] != null && payloads[pk] !== ''; });
    html += '<div class="card"><div class="card-title">Payload</div>';
    if (!hasAnyPayload && !isMulti) {
        html += '<div style="font-size:12px;opacity:0.4;margin-bottom:8px">No payload configured</div>';
    }
    payloadKeys.forEach(function(pk) {
        const val = payloads[pk] != null ? (typeof payloads[pk] === 'string' ? payloads[pk] : JSON.stringify(payloads[pk], null, 2)) : '';
        if (payloadKeys.length > 1) html += '<div class="payload-label">' + esc(pk) + '</div>';
        html += '<textarea class="payload-editor" data-key="' + esc(pk) + '" placeholder="JSON payload (optional)" spellcheck="false">' + esc(val) + '</textarea>';
    });
    html += '</div>';

    // Save bar
    html += '<div class="save-bar">'
        + '<button class="btn btn-primary" id="save-btn">Save Changes</button>'
        + '<span class="save-status" id="save-status"></span></div>';

    // Meta
    html += '<div class="meta-row"><span>Created ' + created + ' by ' + esc(createdBy) + '</span></div>';
    html += '</div>';

    document.body.innerHTML = html;
    bindClicks();

    // Bindings
    var toggle = document.getElementById('flag-toggle');
    toggle.addEventListener('click', function() {
        toggle.classList.toggle('on');
        document.getElementById('toggle-label').textContent = toggle.classList.contains('on') ? 'Active' : 'Inactive';
    });

    var slider = document.getElementById('rollout-slider');
    var num = document.getElementById('rollout-num');
    if (slider && num) {
        slider.addEventListener('input', function() { num.value = slider.value; });
        num.addEventListener('input', function() { slider.value = num.value; });
    }

    var addBtn = document.getElementById('add-variant');
    if (addBtn) {
        addBtn.addEventListener('click', function() {
            var list = document.getElementById('variant-list');
            var row = document.createElement('div');
            row.className = 'variant-row';
            row.innerHTML = '<input class="variant-key-input" value="" data-field="key" placeholder="key" />'
                + '<input class="variant-pct-input" type="number" min="0" max="100" value="0" data-field="pct" />'
                + '<span class="pct-sign">%</span>'
                + '<button class="variant-remove" title="Remove">&times;</button>';
            list.appendChild(row);
            bindRemove();
        });
    }
    function bindRemove() {
        document.querySelectorAll('.variant-remove').forEach(function(b) {
            b.onclick = function() { b.closest('.variant-row').remove(); };
        });
    }
    bindRemove();

    // Experiment button
    var expBtn = document.getElementById('view-experiment-btn');
    if (expBtn) {
        expBtn.addEventListener('click', function() {
            send({ type: 'openExperimentPanel', id: Number(expBtn.dataset.id) });
        });
    }

    document.getElementById('save-btn').addEventListener('click', function() {
        var active = toggle.classList.contains('on');
        var patch = { active: active };
        var newFilters = {};
        var rows = document.querySelectorAll('.variant-row');
        if (rows.length > 0) {
            var vv = [];
            rows.forEach(function(r) {
                var k = r.querySelector('[data-field="key"]').value.trim();
                var p = Number(r.querySelector('[data-field="pct"]').value) || 0;
                if (k) vv.push({ key: k, rollout_percentage: p });
            });
            newFilters.multivariate = { variants: vv };
            newFilters.groups = groups.length > 0 ? groups : [{ properties: [], rollout_percentage: 100 }];
        } else {
            newFilters.groups = [{ properties: [], rollout_percentage: Number(num.value) }];
        }
        var editors = document.querySelectorAll('.payload-editor');
        var pp = {}; var hasP = false;
        editors.forEach(function(ta) {
            var v = ta.value.trim();
            if (v) { try { pp[ta.dataset.key] = JSON.parse(v); } catch(e) { pp[ta.dataset.key] = v; } hasP = true; }
        });
        if (hasP) newFilters.payloads = pp;
        patch.filters = newFilters;

        document.getElementById('save-status').textContent = 'Saving...';
        document.getElementById('save-status').className = 'save-status';
        send({ type: 'saveFlag', flagId: f.id, patch: patch });
    });

    window.addEventListener('message', function(e) {
        if (e.data.type === 'flagSaved') {
            document.getElementById('save-status').textContent = 'Saved!';
            document.getElementById('save-status').className = 'save-status ok';
        } else if (e.data.type === 'flagSaveError') {
            document.getElementById('save-status').textContent = e.data.message || 'Failed';
            document.getElementById('save-status').className = 'save-status err';
        }
    });
})();
