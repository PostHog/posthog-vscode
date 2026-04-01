import * as vscode from 'vscode';
import { TelemetryService } from '../services/telemetryService';

const SURVEY_ID = '019d4ab5-b25e-0000-9fe6-d41245a9bead';
const QUESTION_ID = 'fcfed2fd-09d0-40a6-b47c-35693207bab1';
const SUBMITTED_KEY = 'posthog.feedbackSubmitted';

export class FeedbackViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;

    constructor(
        private readonly globalState: vscode.Memento,
        private readonly telemetry: TelemetryService,
        private readonly isDev: boolean,
    ) {}

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true };

        const submitted = !this.isDev && this.globalState.get<boolean>(SUBMITTED_KEY, false);
        webviewView.webview.html = submitted ? this.getThankYouHtml() : this.getFormHtml();

        webviewView.webview.onDidReceiveMessage(async msg => {
            if (msg.type === 'submit') {
                const rating = msg.rating as string;
                const message = msg.message as string;
                const response = rating ? `[${rating}] ${message}` : message;

                this.telemetry.capture('survey sent', {
                    $survey_id: SURVEY_ID,
                    [`$survey_response_${QUESTION_ID}`]: response,
                });

                if (!this.isDev) {
                    await this.globalState.update(SUBMITTED_KEY, true);
                }

                webviewView.webview.html = this.getThankYouHtml();
            }

            if (msg.type === 'open-url') {
                vscode.env.openExternal(vscode.Uri.parse(msg.url));
            }
        });
    }

    private getFormHtml(): string {
        return `<!DOCTYPE html>
<html><head><style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; margin: 0; }
    h3 { font-size: 13px; margin: 0 0 4px; font-weight: 600; }
    .subtitle { font-size: 11px; color: var(--vscode-descriptionForeground); margin: 0 0 12px; }
    .rating { display: flex; gap: 6px; margin-bottom: 10px; }
    .rating button {
        flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
        padding: 8px 4px; border: 1px solid var(--vscode-input-border); border-radius: 6px;
        background: var(--vscode-input-background); cursor: pointer; transition: all 0.15s;
        color: var(--vscode-foreground);
    }
    .rating button:hover { border-color: var(--vscode-focusBorder); }
    .rating button.selected { border-color: #1D4AFF; background: rgba(29, 74, 255, 0.1); }
    .emoji { font-size: 20px; line-height: 1; }
    .label { font-size: 10px; }
    textarea {
        width: 100%; box-sizing: border-box; resize: vertical; min-height: 60px;
        padding: 8px; border: 1px solid var(--vscode-input-border); border-radius: 4px;
        background: var(--vscode-input-background); color: var(--vscode-input-foreground);
        font-family: var(--vscode-font-family); font-size: 12px; margin-bottom: 8px;
    }
    textarea:focus { outline: none; border-color: #1D4AFF; }
    .btn {
        width: 100%; padding: 7px; border: none; border-radius: 4px; cursor: pointer;
        background: #1D4AFF; color: white; font-size: 12px; font-weight: 500;
    }
    .btn:hover { background: #1536cc; }
    .btn:disabled { opacity: 0.5; cursor: default; }
    .links { margin-top: 10px; text-align: center; font-size: 11px; }
    .links a { color: var(--vscode-textLink-foreground); text-decoration: none; }
    .links a:hover { text-decoration: underline; }
</style></head><body>
    <h3>Having trouble? Send feedback!</h3>
    <p class="subtitle">Help us make the extension better</p>
    <div class="rating" id="rating">
        <button data-r="love"><span class="emoji">😍</span><span class="label">Love it</span></button>
        <button data-r="okay"><span class="emoji">😐</span><span class="label">It's okay</span></button>
        <button data-r="frustrated"><span class="emoji">😤</span><span class="label">Frustrated</span></button>
    </div>
    <textarea id="msg" placeholder="What's on your mind?"></textarea>
    <button class="btn" id="send" disabled>Send Feedback</button>
    <div class="links">
        <a href="#" onclick="post('open-url','https://github.com/PostHog/posthog-vscode/issues')">Report a bug</a>
        &middot;
        <a href="#" onclick="post('open-url','https://github.com/PostHog/posthog-vscode/issues/new')">Request a feature</a>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        let rating = '';
        function post(type, url) { vscode.postMessage({ type, url }); }
        function update() { document.getElementById('send').disabled = !rating && !document.getElementById('msg').value.trim(); }
        document.querySelectorAll('[data-r]').forEach(b => {
            b.addEventListener('click', () => {
                document.querySelectorAll('[data-r]').forEach(x => x.classList.remove('selected'));
                b.classList.add('selected');
                rating = b.dataset.r;
                update();
            });
        });
        document.getElementById('msg').addEventListener('input', update);
        document.getElementById('send').addEventListener('click', () => {
            vscode.postMessage({ type: 'submit', rating, message: document.getElementById('msg').value.trim() });
        });
    </script>
</body></html>`;
    }

    private getThankYouHtml(): string {
        return `<!DOCTYPE html>
<html><head><style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; margin: 0; text-align: center; }
    .check { font-size: 28px; margin-bottom: 8px; }
    h3 { font-size: 13px; margin: 0 0 4px; }
    p { font-size: 11px; color: var(--vscode-descriptionForeground); margin: 0 0 12px; }
    .links a { color: var(--vscode-textLink-foreground); text-decoration: none; font-size: 11px; }
    .links a:hover { text-decoration: underline; }
</style></head><body>
    <div class="check">✅</div>
    <h3>Thank you for your feedback!</h3>
    <p>We appreciate you helping us improve.</p>
    <div class="links">
        <a href="#" onclick="acquireVsCodeApi().postMessage({type:'open-url',url:'https://github.com/PostHog/posthog-vscode/issues'})">Report a bug</a>
        &middot;
        <a href="#" onclick="acquireVsCodeApi().postMessage({type:'open-url',url:'https://github.com/PostHog/posthog-vscode/issues/new'})">Request a feature</a>
    </div>
</body></html>`;
    }
}
