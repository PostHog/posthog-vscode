Create a new VS Code provider for this extension.

Ask me:
1. What type of provider? (decoration, completion, code action, code lens, document link)
2. What PostHog data does it work with? (flags, events, experiments, sessions)
3. What should it display or do?

Then follow these rules:

**File location**: `src/providers/{name}Provider.ts`

**Constructor pattern**: Always take the relevant CacheService + TreeSitterService as constructor params. No other dependencies unless absolutely necessary.

**Required guards**: Every provider method must start with:
```typescript
if (!this.treeSitter.isSupported(document.languageId)) { return; }
```

**For decoration providers**:
- Use 200ms debounce via `triggerUpdate()` pattern
- Listen to: `onDidChangeActiveTextEditor`, `onDidChangeTextDocument`, `cache.onChange`
- Return disposables from `register()` method
- Use `renderOptions.after` with `{ contentText, color, fontStyle: 'italic' }`
- Colors: #4CBB17 (green/good), #F9BD2B (yellow/warning), #1D4AFF (blue/info)

**For completion providers**:
- Use `treeSitter.getCompletionContext(doc, pos)` to determine if we're in the right context
- Return `CompletionItem[]` from cache data

**For code action providers**:
- Set `static readonly providedCodeActionKinds`
- Find calls via `treeSitter.findPostHogCalls(doc)`, filter by line and method set
- Return `CodeAction` with a command from `constants.ts`

**Registration**: After creating the file, update `extension.ts`:
1. Import the provider
2. Construct it in `activate()` with the right dependencies
3. Register it in `context.subscriptions` using the appropriate `vscode.languages.register*` method
4. Use `languageSelector` for the language filter

**Do not** add new constants unless the provider introduces a new command. Use existing method sets from the codebase.
