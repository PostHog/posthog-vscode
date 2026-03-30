Add a new message type to the webview communication protocol.

Ask me:
1. Which webview? (sidebar or detail panel)
2. What direction? (webview → extension, extension → webview, or both)
3. What data does the message carry?

Then follow these rules:

**Webview → Extension (user action in sidebar)**:

1. In `src/views/webview/script.ts`, send the message:
```javascript
send({ type: 'newAction', someData: value });
```

2. In the relevant Provider's `handleMessage()` method (`SidebarProvider.ts` or `DetailPanelProvider.ts`), add the case:
```typescript
case 'newAction':
    // handle it
    break;
```

**Extension → Webview (push data to sidebar)**:

1. In the Provider, post the message:
```typescript
this.view?.webview.postMessage({ type: 'newData', payload: data });
```

2. In `src/views/webview/script.ts`, handle in the `window.addEventListener('message', ...)` block:
```javascript
case 'newData':
    // render the data
    break;
```

**HTML for new UI elements**: Add to `src/views/webview/layout.ts`.
**Styles for new UI elements**: Add to `src/views/webview/styles.ts`.

**Security**:
- Always escape user content with `esc()` helper in script.ts
- Never inject raw HTML from API responses
- CSP is locked down: no inline styles outside nonce, no external scripts

**Design principles**:
- Use VS Code theme variables (`--vscode-*`) for colors that should match the editor theme
- Use PostHog brand colors (`--ph-blue`, `--ph-yellow`, etc.) only for PostHog-specific UI
- Keep it beautiful and on-brand
