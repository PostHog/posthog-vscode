(function() {
    var vscode = acquireVsCodeApi();
    var replayUrl = "{{REPLAY_URL}}";
    document.getElementById('btn-open-external').addEventListener('click', function() {
        vscode.postMessage({ type: 'openExternal', url: replayUrl });
    });
    var fb = document.getElementById('btn-fallback-open');
    if (fb) { fb.addEventListener('click', function() {
        vscode.postMessage({ type: 'openExternal', url: replayUrl });
    }); }
})();
