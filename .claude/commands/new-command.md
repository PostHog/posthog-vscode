Register a new VS Code command for this extension.

Ask me:
1. What does the command do?
2. Should it appear in the Command Palette?
3. Does it need a menu entry (editor title, context menu, etc.)?

Then follow these rules:

**Step 1 — constants.ts**: Add the command ID:
```typescript
export const Commands = {
    // ...existing
    NEW_COMMAND: 'posthog.newCommand',
} as const;
```

**Step 2 — package.json**: Add to `contributes.commands`:
```json
{ "command": "posthog.newCommand", "title": "PostHog: Do Something" }
```
If it needs a menu entry, add to `contributes.menus` too.

**Step 3 — Command handler**: Either:
- Add to an existing commands file (`commands/authCommands.ts` or `commands/featureFlagCommands.ts`) if it fits
- Create a new file `commands/xxxCommands.ts` if it's a new domain

Follow this pattern:
```typescript
export function registerXxxCommands(deps...): vscode.Disposable[] {
    const cmd = vscode.commands.registerCommand(Commands.NEW_COMMAND, async (...args) => {
        // 1. Check auth if needed: authService.getProjectId()
        // 2. Do the thing
        // 3. Show feedback: vscode.window.showInformationMessage()
    });
    return [cmd];
}
```

**Step 4 — extension.ts**: Register in `context.subscriptions`:
```typescript
...registerXxxCommands(authService, postHogService, ...),
```

**Error handling**: Always wrap API calls in try/catch, show user-friendly error messages via `vscode.window.showErrorMessage()`.
