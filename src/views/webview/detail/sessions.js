(function() {
    const key = DATA.key;
    const type = DATA.type;
    const sessions = DATA.sessions;
    const host = DATA.host;
    const projectId = DATA.projectId;

    let html = '<div class="page">';

    // Hero
    html += '<div class="hero"><div class="hero-left">'
        + '<div class="hero-title">&#x1F441; Sessions</div>'
        + '<div class="hero-subtitle"><code>' + esc(key) + '</code> &middot; ' + (type === 'event' ? 'Event' : 'Feature Flag') + '</div>'
        + '</div><div class="hero-actions">'
        + '<button class="btn btn-ghost"' + act({type:'openExternal',url:host+'/project/'+projectId+'/replay'}) + '>All Recordings &#x2197;</button>'
        + '</div></div>';

    if (sessions === null) {
        html += '<div class="card" style="text-align:center;padding:40px">'
            + '<div class="spinner"></div>'
            + '<div style="margin-top:12px;opacity:0.5;font-size:13px">Loading sessions...</div>'
            + '</div>';
    } else if (sessions.length === 0) {
        html += '<div class="card" style="text-align:center;padding:40px">'
            + '<div style="font-size:32px;margin-bottom:8px">&#x1F914;</div>'
            + '<div style="font-size:14px;font-weight:600;margin-bottom:4px">No sessions found</div>'
            + '<div style="opacity:0.5;font-size:12px">No sessions with this ' + type + ' in the last 24 hours.<br>Make sure session recording is enabled in your PostHog project.</div>'
            + '</div>';
    } else {
        html += '<div style="font-size:12px;opacity:0.5;margin-bottom:12px">' + sessions.length + ' session' + (sessions.length !== 1 ? 's' : '') + ' in the last 24h</div>';

        sessions.forEach(function(s, i) {
            var ts = new Date(s.timestamp);
            var timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            var dateStr = ts.toLocaleDateString([], { month: 'short', day: 'numeric' });
            var url = s.currentUrl;
            var displayUrl = url;
            if (url) {
                try { displayUrl = new URL(url).pathname; } catch(e) { displayUrl = url; }
                if (displayUrl.length > 50) displayUrl = displayUrl.substring(0, 47) + '...';
            }

            var deviceParts = [];
            if (s.browser) deviceParts.push(s.browser);
            if (s.os) deviceParts.push(s.os);
            if (s.deviceType) deviceParts.push(s.deviceType);
            var deviceStr = deviceParts.join(' &middot; ');

            html += '<div class="session-card"' + act({type:'watchReplay',session:s}) + '>'
                + '<div class="session-header">'
                + '<div class="session-user">'
                + '<span class="session-avatar">' + esc(s.distinctId.substring(0, 2).toUpperCase()) + '</span>'
                + '<span class="session-distinct-id">' + esc(s.distinctId.length > 24 ? s.distinctId.substring(0, 21) + '...' : s.distinctId) + '</span>'
                + '</div>'
                + '<div class="session-time">' + dateStr + ' ' + timeStr + '</div>'
                + '</div>';

            if (displayUrl) {
                html += '<div class="session-url">' + esc(displayUrl) + '</div>';
            }
            if (deviceStr) {
                html += '<div class="session-device">' + deviceStr + '</div>';
            }

            html += '<div class="session-play">&#x25B6; Watch replay</div>';
            html += '</div>';
        });
    }

    html += '</div>';
    document.body.innerHTML = html;
    bindClicks();
})();
