import * as vscode from 'vscode';
import { AuthService } from '../services/authService';
import { PostHogService } from '../services/postHogService';

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) { nonce += chars.charAt(Math.floor(Math.random() * chars.length)); }
    return nonce;
}

export class HogQLEditorProvider {
    private panel: vscode.WebviewPanel | undefined;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly authService: AuthService,
        private readonly postHogService: PostHogService,
    ) {}

    open(initialQuery?: string, viewColumn: vscode.ViewColumn = vscode.ViewColumn.One) {
        if (this.panel) {
            this.panel.reveal();
            if (initialQuery) {
                this.panel.webview.postMessage({ type: 'setQuery', query: initialQuery });
            }
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'posthog.hogqlEditor',
            'HogQL',
            viewColumn,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'resources')],
                retainContextWhenHidden: true,
            },
        );

        const iconPath = vscode.Uri.joinPath(this.extensionUri, 'resources', 'icons', 'codehog.svg');
        this.panel.iconPath = iconPath;

        this.panel.webview.html = this.buildHtml(this.panel.webview, initialQuery);
        this.bindMessages(this.panel);
        this.panel.onDidDispose(() => { this.panel = undefined; });
    }

    async runFile(document: vscode.TextDocument) {
        const query = document.getText().trim();
        if (!query) {
            vscode.window.showWarningMessage('PostHog: Empty query');
            return;
        }
        this.open(query, vscode.ViewColumn.Beside);
        // Give the webview a moment to load, then trigger the run
        setTimeout(() => {
            this.panel?.webview.postMessage({ type: 'setQuery', query });
            setTimeout(() => {
                this.panel?.webview.postMessage({ type: 'triggerRun' });
            }, 200);
        }, 300);
    }

    private bindMessages(panel: vscode.WebviewPanel) {
        panel.webview.onDidReceiveMessage(async (msg: { type: string; [k: string]: unknown }) => {
            if (msg.type === 'runQuery') {
                const query = msg.query as string;
                const projectId = this.authService.getProjectId();
                if (!projectId) {
                    panel.webview.postMessage({ type: 'queryError', message: 'Not signed in. Please sign in first.' });
                    return;
                }
                try {
                    const result = await this.postHogService.runHogQLQuery(projectId, query);
                    panel.webview.postMessage({ type: 'queryResult', columns: result.columns, results: result.results });
                } catch (err) {
                    const detail = err instanceof Error ? err.message : String(err);
                    panel.webview.postMessage({ type: 'queryError', message: detail });
                }
            } else if (msg.type === 'openExternal') {
                vscode.env.openExternal(vscode.Uri.parse(msg.url as string));
            }
        });
    }

    private buildHtml(webview: vscode.Webview, initialQuery?: string): string {
        const nonce = getNonce();
        const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'resources', 'icons', 'posthog-logo-white.svg'));

        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">${getStyles()}</style>
</head>
<body>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const INITIAL_QUERY = ${JSON.stringify(initialQuery || 'SELECT count() FROM events WHERE timestamp > now() - INTERVAL 7 DAY')};
const LOGO_URI = "${logoUri}";
${getScript()}
</script>
</body>
</html>`;
    }
}

function getStyles(): string {
    return /*css*/ `
:root {
    --ph-blue: #1D4AFF;
    --ph-green: #4CBB17;
    --ph-red: #F44;
    --ph-yellow: #F9BD2B;
    --radius: 8px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    height: 100vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
}
.toolbar-title {
    font-size: 13px;
    font-weight: 600;
    opacity: 0.7;
    display: flex;
    align-items: center;
    gap: 8px;
}
.toolbar-title img { height: 16px; }
.toolbar-actions { margin-left: auto; display: flex; gap: 8px; align-items: center; }

.btn {
    padding: 6px 16px;
    border: none;
    border-radius: 5px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
    white-space: nowrap;
}
.btn:hover { opacity: 0.85; }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn-primary { background: var(--ph-blue); color: #fff; }
.btn-secondary {
    background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.08));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
}
.shortcut {
    font-size: 10px;
    opacity: 0.5;
    font-family: var(--vscode-font-family);
}

.editor-area {
    flex-shrink: 0;
    position: relative;
    border-bottom: 1px solid var(--vscode-panel-border);
}
.editor-area textarea {
    width: 100%;
    height: 180px;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    border: none;
    padding: 12px 16px;
    font-size: 13px;
    font-family: var(--vscode-editor-font-family);
    line-height: 1.6;
    resize: vertical;
    outline: none;
    tab-size: 4;
}
.editor-area textarea::placeholder {
    color: var(--vscode-input-placeholderForeground);
}

.results-area {
    flex: 1;
    overflow: auto;
    position: relative;
}

.status-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 16px;
    border-top: 1px solid var(--vscode-panel-border);
    font-size: 11px;
    opacity: 0.6;
    flex-shrink: 0;
}
.status-bar .status-text { flex: 1; }
.status-bar .status-time { }

.results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
}
.results-table th {
    position: sticky;
    top: 0;
    background: var(--vscode-editor-background);
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    padding: 8px 12px;
    border-bottom: 2px solid var(--vscode-panel-border);
    white-space: nowrap;
    z-index: 1;
}
.results-table td {
    padding: 6px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--vscode-editor-font-family);
}
.results-table tr:hover td {
    background: var(--vscode-list-hoverBackground);
}
.results-table td.null-val {
    opacity: 0.3;
    font-style: italic;
}

.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    opacity: 0.4;
    gap: 8px;
    padding: 40px;
}
.empty-state .icon { font-size: 32px; }
.empty-state p { font-size: 12px; }

.error-msg {
    padding: 16px;
    margin: 16px;
    background: rgba(244, 68, 68, 0.08);
    border-radius: var(--radius);
    color: var(--vscode-errorForeground, #f66);
    font-size: 12px;
    font-family: var(--vscode-editor-font-family);
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
}
.loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 13px;
    opacity: 0.5;
}

.vim-mode {
    font-family: var(--vscode-editor-font-family);
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 3px;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
.vim-normal { background: #4CBB17; color: #000; }
.vim-insert { background: #1D4AFF; color: #fff; }

.hl-container {
    position: relative;
    width: 100%;
    height: 180px;
}
.hl-container textarea,
.hl-container .hl-backdrop {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    padding: 12px 16px;
    font-size: 13px;
    font-family: var(--vscode-editor-font-family);
    line-height: 1.6;
    tab-size: 4;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
}
.hl-backdrop {
    color: var(--vscode-editor-foreground);
    pointer-events: none;
    overflow: auto;
    z-index: 0;
}
.hl-container textarea {
    background: transparent;
    color: var(--vscode-editor-foreground);
    caret-color: var(--vscode-editor-foreground);
    border: none;
    resize: none;
    outline: none;
    z-index: 1;
    -webkit-text-fill-color: transparent;
}
.hl-backdrop .hl-kw { color: #C586C0; }
.hl-backdrop .hl-fn { color: #DCDCAA; }
.hl-backdrop .hl-str { color: #CE9178; }
.hl-backdrop .hl-num { color: #B5CEA8; }
.hl-backdrop .hl-op { color: #D4D4D4; }
.hl-backdrop .hl-cm { color: #6A9955; font-style: italic; }
.hl-backdrop .hl-id { color: #9CDCFE; }
`;
}

function getScript(): string {
    return /*js*/ `
(function() {
    function send(msg) { vscode.postMessage(msg); }
    function esc(s) { if (s == null) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
    function fmtNum(n) { if (typeof n !== 'number') return String(n); if (n >= 1e6) return (n/1e6).toFixed(1)+'M'; if (n >= 1e3) return (n/1e3).toFixed(1)+'K'; return String(n); }

    document.body.innerHTML = ''
        + '<div class="toolbar">'
        + '  <div class="toolbar-title"><img src="' + LOGO_URI + '" alt="" /> HogQL</div>'
        + '  <div class="toolbar-actions">'
        + '    <span class="shortcut">' + (navigator.platform.includes('Mac') ? '\\u2318' : 'Ctrl') + '+Enter to run</span>'
        + '    <button class="btn btn-primary" id="run-btn">\\u25B6 Run</button>'
        + '  </div>'
        + '</div>'
        + '<div class="editor-area">'
        + '  <div class="hl-container">'
        + '    <div class="hl-backdrop" id="hl-backdrop" aria-hidden="true"></div>'
        + '    <textarea id="query-input" spellcheck="false" placeholder="SELECT count() FROM events WHERE timestamp > now() - INTERVAL 7 DAY"></textarea>'
        + '  </div>'
        + '</div>'
        + '<div class="results-area" id="results-area">'
        + '  <div class="empty-state"><div class="icon">&#x1F50D;</div><p>Write a HogQL query and press Run</p></div>'
        + '</div>'
        + '<div class="status-bar"><span class="vim-mode" id="vim-mode">NORMAL</span><span class="status-text" id="status-text">Ready</span><span class="status-time" id="status-time"></span></div>';

    var input = document.getElementById('query-input');
    var runBtn = document.getElementById('run-btn');
    var resultsArea = document.getElementById('results-area');
    var statusText = document.getElementById('status-text');
    var statusTime = document.getElementById('status-time');

    input.value = INITIAL_QUERY;

    function runQuery() {
        var query = input.value.trim();
        if (!query) return;
        runBtn.disabled = true;
        runBtn.textContent = 'Running...';
        resultsArea.innerHTML = '<div class="loading">Running query...</div>';
        statusText.textContent = 'Executing...';
        statusTime.textContent = '';
        var start = Date.now();
        send({ type: 'runQuery', query: query });
        window._queryStart = start;
    }

    runBtn.addEventListener('click', runQuery);

    // --- Syntax Highlighting ---
    var backdrop = document.getElementById('hl-backdrop');
    var HL_KW = /\\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|AS|ON|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|BETWEEN|LIKE|ILIKE|IS|NULL|TRUE|FALSE|CASE|WHEN|THEN|ELSE|END|ASC|DESC|WITH|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DROP|ALTER|IF|EXISTS|INTERVAL|DAY|HOUR|MINUTE|WEEK|MONTH|YEAR|SECOND|USING|GLOBAL|ANY|ANTI|SEMI|ARRAY|OVER|PARTITION|WINDOW|ROWS|RANGE|UNBOUNDED|PRECEDING|FOLLOWING|CURRENT|ROW|MATERIALIZED|PREWHERE|SAMPLE|FINAL|FORMAT|SETTINGS|EXPLAIN)\\b/gi;
    var HL_FN = /\\b(count|sum|avg|min|max|countIf|sumIf|avgIf|uniq|uniqExact|groupArray|groupUniqArray|argMin|argMax|any|anyLast|topK|quantile|quantiles|median|now|today|yesterday|toDate|toDateTime|toStartOfDay|toStartOfHour|toStartOfMinute|toStartOfWeek|toStartOfMonth|dateDiff|dateAdd|dateSub|formatDateTime|toString|toInt32|toInt64|toFloat64|toUInt32|toUInt64|toDecimal|length|lower|upper|trim|substring|concat|replace|replaceAll|match|extract|splitByChar|splitByString|JSONExtract|JSONExtractString|JSONExtractInt|JSONExtractFloat|JSONExtractBool|JSONExtractRaw|if|multiIf|coalesce|greatest|least|abs|round|floor|ceil|sqrt|log|log2|log10|exp|pow|arrayJoin|arrayMap|arrayFilter|arrayExists|arrayElement|has|hasAll|hasAny|empty|notEmpty|isNull|isNotNull|toTypeName|reinterpretAsString|cityHash64|sipHash64|tuple|untuple|dictGet|dictGetOrDefault|transform)\\b/gi;
    var HL_STR = /'(?:[^'\\\\]|\\\\.)*'/g;
    var HL_NUM = /\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b/g;
    var HL_CM1 = /--[^\\n]*/g;
    var HL_CM2 = /#[^\\n]*/g;
    var HL_CMB = /\\/\\*[\\s\\S]*?\\*\\//g;
    var HL_ID = /\`[^\`]*\`/g;

    function highlight(text) {
        var tokens = [];
        function collect(re, cls) {
            re.lastIndex = 0;
            var m;
            while ((m = re.exec(text)) !== null) {
                tokens.push({ s: m.index, e: m.index + m[0].length, cls: cls, t: m[0] });
            }
        }
        collect(HL_CMB, 'hl-cm');
        collect(HL_CM1, 'hl-cm');
        collect(HL_CM2, 'hl-cm');
        collect(HL_STR, 'hl-str');
        collect(HL_ID, 'hl-id');
        collect(HL_NUM, 'hl-num');
        collect(HL_FN, 'hl-fn');
        collect(HL_KW, 'hl-kw');
        // Sort by start, priority by order (earlier in tokens array = higher priority for overlaps)
        tokens.sort(function(a, b) { return a.s - b.s || a.e - b.e; });
        // Remove overlapping tokens (first match wins)
        var filtered = [], lastEnd = 0;
        for (var i = 0; i < tokens.length; i++) {
            if (tokens[i].s >= lastEnd) {
                filtered.push(tokens[i]);
                lastEnd = tokens[i].e;
            }
        }
        var result = '', pos = 0;
        for (var j = 0; j < filtered.length; j++) {
            var tk = filtered[j];
            if (tk.s > pos) result += esc(text.substring(pos, tk.s));
            result += '<span class="' + tk.cls + '">' + esc(tk.t) + '</span>';
            pos = tk.e;
        }
        if (pos < text.length) result += esc(text.substring(pos));
        return result;
    }

    function syncHighlight() {
        backdrop.innerHTML = highlight(input.value) + '\\n';
        backdrop.scrollTop = input.scrollTop;
        backdrop.scrollLeft = input.scrollLeft;
    }
    input.addEventListener('input', syncHighlight);
    input.addEventListener('scroll', function() { backdrop.scrollTop = input.scrollTop; backdrop.scrollLeft = input.scrollLeft; });
    syncHighlight();

    // --- Vim Mode ---
    var vimMode = 'normal', vimReg = '', vimPend = '';
    var modeEl = document.getElementById('vim-mode');

    function setMode(m) {
        vimMode = m; vimPend = '';
        modeEl.textContent = m.toUpperCase();
        modeEl.className = 'vim-mode vim-' + m;
        input.readOnly = m === 'normal';
    }

    function getPos() {
        var v = input.value, s = input.selectionStart;
        var before = v.substring(0, s);
        var line = (before.match(/\\n/g) || []).length;
        var ls = before.lastIndexOf('\\n') + 1;
        return { l: line, c: s - ls, p: s, ls: ls };
    }

    function lineInfo(n) {
        var lines = input.value.split('\\n'), s = 0;
        for (var i = 0; i < n && i < lines.length; i++) s += lines[i].length + 1;
        return { s: s, len: (lines[n] || '').length };
    }

    function setCur(p) { p = Math.max(0, Math.min(p, input.value.length)); input.selectionStart = input.selectionEnd = p; }

    function moveTo(l, c) {
        var lines = input.value.split('\\n');
        l = Math.max(0, Math.min(l, lines.length - 1));
        var li = lineInfo(l);
        setCur(li.s + Math.min(Math.max(0, c), Math.max(0, li.len - (vimMode === 'normal' ? 1 : 0))));
    }

    function nextWord(p) { var m = input.value.substring(p).match(/\\W\\w/); return m ? p + m.index + 1 : input.value.length; }
    function prevWord(p) { var b = input.value.substring(0, p), m = b.match(/\\w\\W+$/); if (m) return p - m[0].length; m = b.match(/\\w+$/); return m ? p - m[0].length : 0; }

    function doEdit(fn) { input.readOnly = false; fn(); if (vimMode === 'normal') input.readOnly = true; syncHighlight(); }

    input.readOnly = true;

    input.addEventListener('keydown', function(e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); return; }

        if (vimMode === 'insert') {
            if (e.key === 'Escape') {
                e.preventDefault();
                var ip = getPos();
                input.readOnly = true;
                if (ip.c > 0) setCur(input.selectionStart - 1);
                setMode('normal');
            } else if (e.key === 'Tab') {
                e.preventDefault();
                document.execCommand('insertText', false, '    ');
            }
            return;
        }

        // Normal mode — let Cmd/Ctrl shortcuts pass through
        if (e.metaKey || e.ctrlKey) {
            if (e.key === 'r') { e.preventDefault(); doEdit(function() { document.execCommand('redo'); }); }
            return;
        }

        e.preventDefault();
        var k = e.key, p = getPos(), lines = input.value.split('\\n'), tot = lines.length;

        // Multi-key commands
        if (vimPend) {
            var pend = vimPend; vimPend = '';
            if (pend === 'd' && k === 'd') {
                vimReg = lines[p.l] + '\\n';
                doEdit(function() {
                    var li = lineInfo(p.l);
                    if (tot === 1) input.setSelectionRange(0, input.value.length);
                    else if (p.l < tot - 1) input.setSelectionRange(li.s, li.s + li.len + 1);
                    else input.setSelectionRange(li.s - 1, li.s + li.len);
                    document.execCommand('delete');
                });
                moveTo(Math.min(p.l, input.value.split('\\n').length - 1), 0);
            } else if (pend === 'y' && k === 'y') {
                vimReg = lines[p.l] + '\\n';
                statusText.textContent = 'Yanked';
                setTimeout(function() { statusText.textContent = 'Ready'; }, 1000);
            } else if (pend === 'c' && k === 'c') {
                vimReg = lines[p.l] + '\\n';
                doEdit(function() { var li = lineInfo(p.l); input.setSelectionRange(li.s, li.s + li.len); document.execCommand('delete'); });
                input.readOnly = false; setMode('insert');
            } else if (pend === 'g' && k === 'g') {
                moveTo(0, 0);
            } else if (pend === 'r' && k.length === 1) {
                doEdit(function() { input.setSelectionRange(p.p, p.p + 1); document.execCommand('insertText', false, k); setCur(p.p); });
            }
            return;
        }

        switch (k) {
            case 'i': input.readOnly = false; setMode('insert'); break;
            case 'a': setCur(Math.min(p.p + 1, p.ls + lines[p.l].length)); input.readOnly = false; setMode('insert'); break;
            case 'A': setCur(p.ls + lines[p.l].length); input.readOnly = false; setMode('insert'); break;
            case 'I': var ns = lines[p.l].search(/\\S/); setCur(p.ls + (ns >= 0 ? ns : 0)); input.readOnly = false; setMode('insert'); break;
            case 'o': doEdit(function() { setCur(p.ls + lines[p.l].length); document.execCommand('insertText', false, '\\n'); }); input.readOnly = false; setMode('insert'); break;
            case 'O': doEdit(function() { setCur(p.ls); document.execCommand('insertText', false, '\\n'); setCur(p.ls); }); input.readOnly = false; setMode('insert'); break;
            case 'h': setCur(Math.max(p.p - 1, p.ls)); break;
            case 'l': setCur(Math.min(p.p + 1, p.ls + Math.max(0, lines[p.l].length - 1))); break;
            case 'j': moveTo(Math.min(p.l + 1, tot - 1), p.c); break;
            case 'k': moveTo(Math.max(p.l - 1, 0), p.c); break;
            case 'w': setCur(nextWord(p.p)); break;
            case 'b': setCur(prevWord(p.p)); break;
            case '0': setCur(p.ls); break;
            case '^': var fn = lines[p.l].search(/\\S/); setCur(p.ls + (fn >= 0 ? fn : 0)); break;
            case '$': setCur(p.ls + Math.max(0, lines[p.l].length - 1)); break;
            case 'G': moveTo(tot - 1, 0); break;
            case 'g': vimPend = 'g'; break;
            case 'x': if (lines[p.l].length > 0) doEdit(function() { input.setSelectionRange(p.p, Math.min(p.p + 1, p.ls + lines[p.l].length)); document.execCommand('delete'); }); break;
            case 'r': vimPend = 'r'; break;
            case 'd': vimPend = 'd'; break;
            case 'D': vimReg = lines[p.l].substring(p.c); doEdit(function() { input.setSelectionRange(p.p, p.ls + lines[p.l].length); document.execCommand('delete'); }); break;
            case 'c': vimPend = 'c'; break;
            case 'C': vimReg = lines[p.l].substring(p.c); doEdit(function() { input.setSelectionRange(p.p, p.ls + lines[p.l].length); document.execCommand('delete'); }); input.readOnly = false; setMode('insert'); break;
            case 'y': vimPend = 'y'; break;
            case 'p': if (vimReg) doEdit(function() { if (vimReg.endsWith('\\n')) { setCur(p.ls + lines[p.l].length); document.execCommand('insertText', false, '\\n' + vimReg.replace(/\\n$/, '')); } else { setCur(p.p + 1); document.execCommand('insertText', false, vimReg); } }); break;
            case 'P': if (vimReg) doEdit(function() { if (vimReg.endsWith('\\n')) { setCur(p.ls); document.execCommand('insertText', false, vimReg.replace(/\\n$/, '') + '\\n'); setCur(p.ls); } else { document.execCommand('insertText', false, vimReg); } }); break;
            case 'u': doEdit(function() { document.execCommand('undo'); }); break;
            case 'Escape': vimPend = ''; break;
        }
    });

    setMode('normal');

    window.addEventListener('message', function(e) {
        var msg = e.data;
        var elapsed = window._queryStart ? ((Date.now() - window._queryStart) / 1000).toFixed(2) + 's' : '';

        if (msg.type === 'queryResult') {
            runBtn.disabled = false;
            runBtn.textContent = '\\u25B6 Run';
            var cols = msg.columns || [];
            var rows = msg.results || [];
            statusText.textContent = rows.length + ' row' + (rows.length !== 1 ? 's' : '') + ' returned';
            statusTime.textContent = elapsed;

            if (rows.length === 0) {
                resultsArea.innerHTML = '<div class="empty-state"><div class="icon">\\u2713</div><p>Query returned no results</p></div>';
                return;
            }

            var html = '<table class="results-table"><thead><tr>';
            cols.forEach(function(c) { html += '<th>' + esc(c) + '</th>'; });
            html += '</tr></thead><tbody>';
            rows.forEach(function(row) {
                html += '<tr>';
                row.forEach(function(val) {
                    if (val === null || val === undefined) {
                        html += '<td class="null-val">NULL</td>';
                    } else if (typeof val === 'object') {
                        html += '<td>' + esc(JSON.stringify(val)) + '</td>';
                    } else {
                        html += '<td>' + esc(val) + '</td>';
                    }
                });
                html += '</tr>';
            });
            html += '</tbody></table>';
            resultsArea.innerHTML = html;
        } else if (msg.type === 'queryError') {
            runBtn.disabled = false;
            runBtn.textContent = '\\u25B6 Run';
            statusText.textContent = 'Error';
            statusTime.textContent = elapsed;
            resultsArea.innerHTML = '<div class="error-msg">' + esc(msg.message) + '</div>';
        } else if (msg.type === 'setQuery') {
            input.value = msg.query;
        } else if (msg.type === 'triggerRun') {
            runQuery();
        }
    });
})();
`;
}
