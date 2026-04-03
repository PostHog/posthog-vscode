function send(msg) {
    vscode.postMessage(msg);
}

function esc(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function fmtNum(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
}

function fmtPct(n) {
    return (n * 100).toFixed(1) + '%';
}

function fmtVal(v, t) {
    if (v == null) return '-';
    if (t === 'funnel' || t === 'retention') return fmtPct(v);
    return typeof v === 'number' ? v.toFixed(2) : String(v);
}

function act(msg) {
    return ' data-action=\'' + JSON.stringify(msg).replace(/'/g, '&#39;') + '\'';
}

function bindClicks() {
    document.querySelectorAll('[data-action]').forEach(function (el) {
        el.addEventListener('click', function (e) {
            e.stopPropagation();
            try {
                send(JSON.parse(el.getAttribute('data-action')));
            } catch (err) {}
        });
    });
}
