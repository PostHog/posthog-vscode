(function() {
    var currentInsight = DATA.insight;
    const host = DATA.host;
    const projectId = DATA.projectId;

    function renderPage(ins) {
        const refreshed = ins.last_refresh ? 'Last refreshed ' + new Date(ins.last_refresh).toLocaleDateString() : 'Not yet computed';
        const kind = ins.query?.source?.kind || 'Unknown';

        let html = '<div class="page">';
        html += '<div class="hero"><div class="hero-left">'
            + '<div class="hero-title">' + esc(ins.name || 'Untitled') + '</div>'
            + '<div class="hero-badges"><span class="badge draft">' + kind + '</span><span class="badge draft">' + refreshed + '</span></div>'
            + '</div><div class="hero-actions">'
            + '<button class="btn btn-secondary" id="refresh-btn">Refresh Data</button>'
            + '<button class="btn btn-ghost"' + act({type:'openExternal',url:host+'/project/'+projectId+'/insights/'+(ins.short_id||ins.id)}) + '>Open in PostHog &#x2197;</button>'
            + '</div></div>';

        if (ins.description) html += '<div class="field"><div class="field-value">' + esc(ins.description) + '</div></div>';

        // Visualization
        html += '<div class="viz-container" id="viz">' + renderViz(ins) + '</div>';

        // Data table
        if (ins.result && Array.isArray(ins.result) && ins.result.length > 0) {
            html += '<div class="card"><div class="card-title">Data</div>' + renderDataTable(ins) + '</div>';
        }

        html += '<div class="meta-row"><span>Created ' + (ins.created_at ? new Date(ins.created_at).toLocaleDateString() : 'Unknown') + '</span></div>';
        html += '</div>';
        document.body.innerHTML = html;
        bindClicks();

        document.getElementById('refresh-btn').addEventListener('click', function() {
            this.textContent = 'Refreshing...';
            this.disabled = true;
            send({ type: 'refreshInsight', insightId: ins.id });
        });
    }

    renderPage(currentInsight);

    window.addEventListener('message', function(ev) {
        if (ev.data.type === 'insightRefreshed') {
            currentInsight = ev.data.data;
            renderPage(currentInsight);
        }
    });

    function renderViz(insight) {
        var r = insight.result;
        if (!r || !Array.isArray(r) || r.length === 0) return '<div style="opacity:0.4;text-align:center;padding:20px">No data</div>';
        var k = insight.query?.source?.kind;
        if (k === 'TrendsQuery' && r[0] && r[0].data) return renderSparklines(r);
        if (k === 'FunnelsQuery' && r[0] && r[0].count != null) return renderFunnel(r);
        return '<div style="opacity:0.4;text-align:center;padding:20px">' + (k || 'Unknown') + ' visualization</div>';
    }

    function renderSparklines(results) {
        var w = 640, h = 160, pad = 30;
        var allVals = []; results.forEach(function(s) { allVals = allVals.concat(s.data); });
        var minV = Math.min.apply(null, allVals), maxV = Math.max.apply(null, allVals);
        if (minV === maxV) { minV -= 1; maxV += 1; }
        var colors = ['#1D4AFF','#4CBB17','#F9BD2B','#F44','#9B59B6','#1ABC9C'];
        var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">';
        results.forEach(function(series, si) {
            if (!series.data || series.data.length < 2) return;
            var pts = series.data.map(function(v, i) {
                var x = pad + i / (series.data.length - 1) * (w - pad * 2);
                var y = h - pad - ((v - minV) / (maxV - minV)) * (h - pad * 2);
                return x + ',' + y;
            }).join(' ');
            svg += '<polyline points="' + pts + '" fill="none" stroke="' + colors[si % colors.length] + '" stroke-width="2" />';
        });
        svg += '</svg>';
        // Legend
        var legend = '<div style="display:flex;gap:16px;margin-top:8px;flex-wrap:wrap">';
        results.forEach(function(s, i) {
            legend += '<span style="font-size:11px;display:flex;align-items:center;gap:4px">'
                + '<span style="width:8px;height:8px;border-radius:50%;background:' + colors[i%colors.length] + '"></span>'
                + esc(s.label || 'Series ' + (i+1)) + ' (' + fmtNum(s.count) + ')</span>';
        });
        legend += '</div>';
        return svg + legend;
    }

    function renderFunnel(steps) {
        var maxCount = steps[0] ? steps[0].count : 1;
        var h2 = '<div>';
        steps.forEach(function(step, i) {
            var pct = maxCount > 0 ? (step.count / maxCount * 100) : 0;
            var convRate = i > 0 && steps[i-1].count > 0 ? (step.count / steps[i-1].count * 100).toFixed(1) + '%' : '';
            h2 += '<div style="margin-bottom:8px">'
                + '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">'
                + '<span>' + (i+1) + '. ' + esc(step.name || step.custom_name || 'Step') + '</span>'
                + '<span>' + fmtNum(step.count) + (convRate ? ' (' + convRate + ')' : '') + '</span></div>'
                + '<div style="height:8px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden">'
                + '<div style="height:100%;width:' + pct + '%;background:#1D4AFF;border-radius:4px"></div></div></div>';
        });
        h2 += '</div>';
        return h2;
    }

    function renderDataTable(insight) {
        var r = insight.result;
        if (!r || r.length === 0) return '';
        var k = insight.query?.source?.kind;
        if (k === 'TrendsQuery' && r[0] && r[0].data) {
            var t = '<table class="data-table"><thead><tr><th>Series</th><th class="r">Total</th></tr></thead><tbody>';
            r.forEach(function(s) { t += '<tr><td>' + esc(s.label) + '</td><td class="r">' + fmtNum(s.count) + '</td></tr>'; });
            t += '</tbody></table>';
            return t;
        }
        return '';
    }
})();
