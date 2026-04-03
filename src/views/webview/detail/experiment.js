(function() {
    const exp = DATA.experiment;
    const results = DATA.results;
    const host = DATA.host;
    const projectId = DATA.projectId;

    let status, badgeCls;
    if (exp.end_date) { status = 'Complete'; badgeCls = 'complete'; }
    else if (exp.start_date) { status = 'Running'; badgeCls = 'running'; }
    else { status = 'Draft'; badgeCls = 'draft'; }

    const created = exp.created_at ? new Date(exp.created_at).toLocaleDateString() : 'Unknown';
    const createdBy = exp.created_by ? (exp.created_by.first_name || exp.created_by.email) : 'Unknown';
    const variants = exp.parameters && exp.parameters.feature_flag_variants;
    var daysRunning = 0;
    if (exp.start_date) {
        var start = new Date(exp.start_date);
        var end = exp.end_date ? new Date(exp.end_date) : new Date();
        daysRunning = Math.ceil((end.getTime() - start.getTime()) / 86400000);
    }

    let html = '<div class="page">';

    // Hero
    html += '<div class="hero"><div class="hero-left">'
        + '<div class="hero-title">' + esc(exp.name) + '</div>'
        + '<div class="hero-subtitle"><code>' + esc(exp.feature_flag_key) + '</code></div>'
        + '<div class="hero-badges"><span class="badge ' + badgeCls + '">' + status + '</span>';
    if (daysRunning > 0) {
        html += '<span class="badge draft">' + daysRunning + ' day' + (daysRunning !== 1 ? 's' : '') + '</span>';
    }
    html += '</div></div><div class="hero-actions">';
    // Launch / Stop buttons
    if (!exp.start_date) {
        html += '<button class="btn btn-primary" id="launch-exp-btn">Launch Experiment</button>';
    } else if (!exp.end_date) {
        html += '<button class="btn btn-secondary" id="stop-exp-btn" style="color:var(--ph-red);border:1px solid var(--ph-red);">Stop Experiment</button>';
    }
    html += '<button class="btn btn-secondary"' + act({type:'findReferences',key:exp.feature_flag_key}) + '>Find References</button>'
        + '<button class="btn btn-secondary"' + act({type:'copy',text:exp.feature_flag_key}) + '>Copy Flag Key</button>'
        + '<button class="btn btn-ghost"' + act({type:'openExternal',url:host+'/project/'+projectId+'/experiments/'+exp.id}) + '>Open in PostHog &#x2197;</button>'
        + '</div></div>';

    // Metadata grid — inspired by PostHog top bar
    html += '<div class="card-row">';
    html += '<div class="card"><div class="card-title">Feature flag</div><div class="stat-value"><code>' + esc(exp.feature_flag_key) + '</code></div></div>';
    html += '<div class="card"><div class="card-title">Duration</div><div class="stat-value">' + (exp.start_date ? daysRunning + ' day' + (daysRunning !== 1 ? 's' : '') : 'Not started') + '</div></div>';
    html += '<div class="card"><div class="card-title">Created</div><div class="stat-value">' + created + ' by ' + esc(createdBy) + '</div></div>';
    html += '</div>';

    if (exp.description) {
        html += '<div class="field"><div class="field-value">' + esc(exp.description) + '</div></div>';
    }

    // Conclusion
    if (exp.conclusion) {
        var cText = exp.conclusion === 'won' ? '&#x1F3C6; Winner declared' : '&#x274C; No winner';
        html += '<div class="conclusion ' + exp.conclusion + '"><strong>' + cText + '</strong>';
        if (exp.conclusion_comment) html += '<div class="conclusion-comment">' + esc(exp.conclusion_comment) + '</div>';
        html += '</div>';
    }

    // Exposures — visual bar + table
    var exposures = [];
    if (results) {
        if (results.variants && results.variants.length > 0) {
            exposures = results.variants;
        } else if (results.primary && results.primary.results && results.primary.results[0]) {
            var d = results.primary.results[0].data;
            if (d && d.baseline) {
                exposures.push({ key: d.baseline.key, absolute_exposure: d.baseline.absolute_exposure || d.baseline.number_of_samples });
                (d.variant_results || []).forEach(function(v) {
                    exposures.push({ key: v.key, absolute_exposure: v.absolute_exposure || v.number_of_samples });
                });
            }
        }
    }
    if (exposures.length > 0) {
        var expColors = ['#1D4AFF','#A855F7','#EC4899','#F97316','#4CBB17','#F9BD2B'];
        var total = exposures.reduce(function(s,e) { return s + (e.absolute_exposure||0); }, 0);
        html += '<div class="card"><div class="card-title">Exposures &nbsp;&nbsp;<span style="font-weight:700;font-size:13px;text-transform:none;letter-spacing:0;opacity:1">' + fmtNum(total) + '</span></div>';
        // Distribution bar
        html += '<div class="expose-bar">';
        exposures.forEach(function(e, i) {
            var pct = total > 0 ? (e.absolute_exposure||0)/total*100 : 0;
            html += '<div class="expose-seg" style="width:'+pct+'%;background:'+expColors[i%expColors.length]+'"></div>';
        });
        html += '</div>';
        // Legend
        html += '<div class="expose-legend">';
        exposures.forEach(function(e, i) {
            var pct = total > 0 ? ((e.absolute_exposure||0)/total*100).toFixed(1)+'%' : '-';
            html += '<span class="expose-item"><span class="expose-dot" style="background:'+expColors[i%expColors.length]+'"></span>' + esc(e.key) + ' ' + pct + '</span>';
        });
        html += '</div></div>';
    }

    // Sample size progress
    var recSample = exp.parameters && exp.parameters.recommended_sample_size;
    if (exp.start_date && recSample && recSample > 0) {
        var sampleData = null;
        if (results && results.primary && results.primary.results && results.primary.results[0]) sampleData = results.primary.results[0].data;
        var totalSamples = 0;
        if (sampleData) {
            totalSamples = sampleData.baseline.number_of_samples;
            (sampleData.variant_results || []).forEach(function(v) { totalSamples += v.number_of_samples; });
        }
        var samplePct = totalSamples > 0 ? Math.min(Math.round((totalSamples / recSample) * 100), 100) : 0;
        html += '<div class="card"><div class="card-title">Sample Progress</div>'
            + '<div style="height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;">'
            + '<div style="height:100%;width:' + samplePct + '%;background:var(--ph-blue);border-radius:3px;transition:width 0.3s;"></div></div>'
            + '<div style="font-size:11px;opacity:0.5;margin-top:4px;">' + fmtNum(totalSamples) + ' / ' + fmtNum(recSample) + ' samples (' + samplePct + '%)</div>'
            + '</div>';
    }

    // Metric results tables
    function renderMetrics(label, metrics, metricResults) {
        if (!metrics || metrics.length === 0) return '';
        var h = '<div class="card"><div class="card-title">' + esc(label) + '</div>';
        metrics.forEach(function(m, mi) {
            var r = metricResults ? metricResults[mi] : null;
            var typeLabels = { funnel: 'Funnel', mean: 'Mean', ratio: 'Ratio', retention: 'Retention' };
            h += '<div style="margin-bottom:16px"><div style="font-size:13px;font-weight:600;margin-bottom:8px">'
                + (mi+1) + '. ' + esc(m.name || 'Unnamed')
                + ' <span style="font-weight:400;opacity:0.4;font-size:11px">' + (typeLabels[m.metric_type]||m.metric_type) + '</span></div>';

            if (r && r.data) {
                var bl = r.data.baseline;
                var vrs = r.data.variant_results || [];
                var winner = vrs.length > 0 ? vrs.reduce(function(b,v) { return v.chance_to_win > b.chance_to_win ? v : b; }) : null;

                h += '<table class="data-table"><thead><tr><th>Variant</th><th class="r">Value</th><th class="r">Delta</th><th class="r">Win %</th></tr></thead><tbody>';
                h += '<tr class="baseline"><td>' + esc(bl.key) + ' <span style="opacity:0.4;font-size:10px">baseline</span></td><td class="r">' + fmtVal(bl.mean, m.metric_type) + '<div class="sub">' + fmtNum(bl.number_of_samples) + ' users</div></td><td class="r">-</td><td class="r">-</td></tr>';
                vrs.forEach(function(v) {
                    var wp = Math.round(v.chance_to_win*100);
                    var isW = v === winner && v.significant;
                    var dStr = v.delta != null ? '<span class="delta ' + (v.delta > 0 ? 'up' : v.delta < 0 ? 'down' : '') + '">' + (v.delta > 0 ? '+' : '') + (v.delta*100).toFixed(1) + '%</span>' : '-';
                    var wCls = v.significant ? (isW ? 'sig-win' : 'sig-lose') : '';
                    h += '<tr><td>' + esc(v.key) + (isW ? ' &#x2B50;' : '') + '</td>'
                        + '<td class="r">' + fmtVal(v.mean, m.metric_type) + '<div class="sub">' + fmtNum(v.number_of_samples) + ' users</div></td>'
                        + '<td class="r">' + dStr + '</td>'
                        + '<td class="r"><span class="win-badge ' + wCls + '">' + wp + '%</span></td></tr>';
                });
                h += '</tbody></table>';

                // CI bars
                if (vrs.some(function(v) { return v.credible_interval; })) {
                    var allBounds = [];
                    vrs.forEach(function(v) { if (v.credible_interval) { allBounds.push(v.credible_interval[0]*100, v.credible_interval[1]*100); } });
                    var dataMin = Math.min.apply(null, allBounds.concat([0]));
                    var dataMax = Math.max.apply(null, allBounds.concat([0]));
                    var ciPad = Math.max(Math.abs(dataMax - dataMin) * 0.2, 1);
                    var ciRangeMin = dataMin - ciPad;
                    var ciRangeMax = dataMax + ciPad;
                    var ciSpan = ciRangeMax - ciRangeMin;

                    h += '<div class="ci-section">';
                    vrs.forEach(function(v) {
                        if (!v.credible_interval) return;
                        var lo = v.credible_interval[0]*100, hi = v.credible_interval[1]*100;
                        var lp = (lo-ciRangeMin)/ciSpan*100, wp2 = (hi-lo)/ciSpan*100, zp = (0-ciRangeMin)/ciSpan*100;
                        var cls = lo > 0 ? 'pos' : hi < 0 ? 'neg' : 'neu';
                        h += '<div class="ci-row"><span class="ci-label">' + esc(v.key) + '</span>'
                            + '<div class="ci-track"><div class="ci-zero" style="left:'+zp+'%"></div><div class="ci-bar '+cls+'" style="left:'+lp+'%;width:'+Math.max(wp2,1)+'%"></div></div>'
                            + '<span class="ci-range">['+lo.toFixed(1)+'%, '+hi.toFixed(1)+'%]</span></div>';
                    });
                    h += '</div>';
                }
            } else {
                h += '<div style="opacity:0.5;font-size:12px">No results yet</div>';
            }
            h += '</div>';
        });
        h += '</div>';
        return h;
    }

    if (results) {
        html += renderMetrics('Primary metrics', exp.metrics, results.primary && results.primary.results);
        html += renderMetrics('Secondary metrics', exp.metrics_secondary, results.secondary && results.secondary.results);
    }

    // Variant allocation — always show
    if (variants && variants.length > 0) {
        html += '<div class="card"><div class="card-title">Variant allocation</div>'
            + '<table class="data-table"><thead><tr><th>Variant</th><th class="r">%</th></tr></thead><tbody>';
        variants.forEach(function(v) { html += '<tr><td>' + esc(v.key) + '</td><td class="r">' + v.rollout_percentage + '%</td></tr>'; });
        html += '</tbody></table></div>';
    }

    html += '<div class="meta-row"><span>Created ' + created + ' by ' + esc(createdBy) + '</span></div>';
    html += '</div>';
    document.body.innerHTML = html;
    bindClicks();

    // Launch / Stop experiment buttons
    var launchBtn = document.getElementById('launch-exp-btn');
    if (launchBtn) {
        launchBtn.addEventListener('click', function() {
            launchBtn.textContent = 'Launching...';
            launchBtn.disabled = true;
            send({ type: 'launch-experiment', experimentId: exp.id });
        });
    }
    var stopBtn = document.getElementById('stop-exp-btn');
    if (stopBtn) {
        stopBtn.addEventListener('click', function() {
            stopBtn.textContent = 'Stopping...';
            stopBtn.disabled = true;
            send({ type: 'stop-experiment', experimentId: exp.id });
        });
    }

    window.addEventListener('message', function(ev) {
        if (ev.data.type === 'experimentUpdated') {
            location.reload();
        } else if (ev.data.type === 'experimentError') {
            var msg = ev.data.message || 'Operation failed';
            if (launchBtn) { launchBtn.textContent = msg; launchBtn.disabled = false; }
            if (stopBtn) { stopBtn.textContent = msg; stopBtn.disabled = false; }
        }
    });
})();
