import * as vscode from 'vscode';
import * as path from 'path';
import Parser from 'web-tree-sitter';

// ── Exported types ──

export interface PostHogCall {
    method: string;
    key: string;
    line: number;
    keyStartCol: number;
    keyEndCol: number;
}

export interface FunctionInfo {
    name: string;
    params: string[];
    isComponent: boolean;
    bodyLine: number;
    bodyIndent: string;
}

export interface VariantBranch {
    flagKey: string;
    variantKey: string;
    conditionLine: number;
    startLine: number;
    endLine: number;
}

export interface FlagAssignment {
    varName: string;
    method: string;
    flagKey: string;
    /** Line of the assignment statement */
    line: number;
    /** Column right after the variable name (where `: Type` would go in TS) */
    varNameEndCol: number;
    /** Whether the variable already has a type annotation */
    hasTypeAnnotation: boolean;
}

export interface PostHogInitCall {
    token: string;
    tokenLine: number;
    tokenStartCol: number;
    tokenEndCol: number;
    apiHost: string | null;
    configProperties: Map<string, string>;
}

export interface CompletionContext {
    type: 'capture_event' | 'flag_key' | 'property_key' | 'property_value';
    eventName?: string;
    propertyName?: string;
}

// ── Detection configuration ──

export interface DetectionConfig {
    additionalClientNames: string[];
    additionalFlagFunctions: string[];
    detectNestedClients: boolean;
}

const DEFAULT_CONFIG: DetectionConfig = {
    additionalClientNames: [],
    additionalFlagFunctions: [],
    detectNestedClients: true,
};

// ── Language configuration ──

const JS_CAPTURE_METHODS = new Set(['capture']);
const JS_FLAG_METHODS = new Set([
    'getFeatureFlag', 'isFeatureEnabled', 'getFeatureFlagPayload',
    'getFeatureFlagResult', 'isFeatureFlagEnabled', 'getRemoteConfig',
]);
const JS_ALL_METHODS = new Set([...JS_CAPTURE_METHODS, ...JS_FLAG_METHODS]);

const CLIENT_NAMES = new Set(['posthog', 'client', 'ph']);

interface LangFamily {
    wasm: string;
    captureMethods: Set<string>;
    flagMethods: Set<string>;
    allMethods: Set<string>;
    queries: QueryStrings;
}

interface QueryStrings {
    postHogCalls: string;
    nodeCaptureCalls: string;
    flagAssignments: string;
    functions: string;
    clientAliases: string;
    constructorAliases: string;
    destructuredMethods: string;
    bareFunctionCalls: string;
}

// ── Tree-sitter queries per language ──

const JS_QUERIES: QueryStrings = {
    postHogCalls: `
        (call_expression
            function: (member_expression
                object: (_) @client
                property: (property_identifier) @method)
            arguments: (arguments . (string (string_fragment) @key))) @call

        (call_expression
            function: (member_expression
                object: (_) @client
                property: (property_identifier) @method)
            arguments: (arguments . (template_string (string_fragment) @key))) @call
    `,

    nodeCaptureCalls: `
        (call_expression
            function: (member_expression
                object: (_) @client
                property: (property_identifier) @method)
            arguments: (arguments .
                (object
                    (pair
                        key: (property_identifier) @prop_name
                        value: (string (string_fragment) @key))))) @call
    `,

    flagAssignments: `
        (lexical_declaration
            (variable_declarator
                name: (identifier) @var_name
                value: (call_expression
                    function: (member_expression
                        object: (_) @client
                        property: (property_identifier) @method)
                    arguments: (arguments . (string (string_fragment) @flag_key))))) @assignment

        (variable_declaration
            (variable_declarator
                name: (identifier) @var_name
                value: (call_expression
                    function: (member_expression
                        object: (_) @client
                        property: (property_identifier) @method)
                    arguments: (arguments . (string (string_fragment) @flag_key))))) @assignment
    `,

    functions: `
        (function_declaration
            name: (identifier) @func_name
            parameters: (formal_parameters) @func_params
            body: (statement_block) @func_body)

        (export_statement
            declaration: (function_declaration
                name: (identifier) @func_name
                parameters: (formal_parameters) @func_params
                body: (statement_block) @func_body))

        (lexical_declaration
            (variable_declarator
                name: (identifier) @func_name
                value: (arrow_function
                    parameters: (formal_parameters) @func_params
                    body: (statement_block) @func_body)))

        (lexical_declaration
            (variable_declarator
                name: (identifier) @func_name
                value: (arrow_function
                    parameter: (identifier) @func_single_param
                    body: (statement_block) @func_body)))

        (method_definition
            name: (property_identifier) @func_name
            parameters: (formal_parameters) @func_params
            body: (statement_block) @func_body)
    `,

    clientAliases: `
        (lexical_declaration
            (variable_declarator
                name: (identifier) @alias
                value: (identifier) @source))

        (variable_declaration
            (variable_declarator
                name: (identifier) @alias
                value: (identifier) @source))
    `,

    constructorAliases: `
        (lexical_declaration
            (variable_declarator
                name: (identifier) @alias
                value: (new_expression
                    constructor: (identifier) @class_name)))

        (variable_declaration
            (variable_declarator
                name: (identifier) @alias
                value: (new_expression
                    constructor: (identifier) @class_name)))
    `,

    destructuredMethods: `
        (lexical_declaration
            (variable_declarator
                name: (object_pattern
                    (shorthand_property_identifier_pattern) @method_name)
                value: (identifier) @source))
    `,

    bareFunctionCalls: `
        (call_expression
            function: (identifier) @func_name
            arguments: (arguments . (string (string_fragment) @key))) @call
    `,
};

// ── Language → family mapping ──

const LANG_FAMILIES: Record<string, LangFamily> = {
    javascript: { wasm: 'tree-sitter-javascript.wasm', captureMethods: JS_CAPTURE_METHODS, flagMethods: JS_FLAG_METHODS, allMethods: JS_ALL_METHODS, queries: JS_QUERIES },
    javascriptreact: { wasm: 'tree-sitter-javascript.wasm', captureMethods: JS_CAPTURE_METHODS, flagMethods: JS_FLAG_METHODS, allMethods: JS_ALL_METHODS, queries: JS_QUERIES },
    typescript: { wasm: 'tree-sitter-typescript.wasm', captureMethods: JS_CAPTURE_METHODS, flagMethods: JS_FLAG_METHODS, allMethods: JS_ALL_METHODS, queries: JS_QUERIES },
    typescriptreact: { wasm: 'tree-sitter-tsx.wasm', captureMethods: JS_CAPTURE_METHODS, flagMethods: JS_FLAG_METHODS, allMethods: JS_ALL_METHODS, queries: JS_QUERIES },
};

// ── Service ──

export class TreeSitterService {
    private parser: Parser | null = null;
    private languages = new Map<string, Parser.Language>();
    private queryCache = new Map<string, Parser.Query>();
    private initPromise: Promise<void> | null = null;
    private wasmDir = '';
    private config: DetectionConfig = DEFAULT_CONFIG;

    updateConfig(config: DetectionConfig): void {
        this.config = config;
        this.queryCache.clear();
    }

    private getEffectiveClients(): Set<string> {
        const clients = new Set(CLIENT_NAMES);
        for (const name of this.config.additionalClientNames) {
            clients.add(name);
        }
        return clients;
    }

    private extractClientName(node: Parser.SyntaxNode): string | null {
        if (node.type === 'identifier') {
            return node.text;
        }
        if (this.config.detectNestedClients) {
            // member_expression: window.posthog → extract "posthog"
            if (node.type === 'member_expression' || node.type === 'attribute') {
                const prop = node.childForFieldName('property') || node.childForFieldName('attribute');
                if (prop) { return prop.text; }
            }
            // optional_chain_expression wrapping member_expression
            if (node.type === 'optional_chain_expression') {
                const inner = node.namedChildren[0];
                if (inner?.type === 'member_expression') {
                    const prop = inner.childForFieldName('property');
                    if (prop) { return prop.text; }
                }
            }
        }
        return null;
    }

    async initialize(extensionPath: string): Promise<void> {
        this.wasmDir = path.join(extensionPath, 'wasm');
        this.initPromise = this.doInit();
        return this.initPromise;
    }

    private async doInit(): Promise<void> {
        await Parser.init({
            locateFile: (scriptName: string) => path.join(this.wasmDir, scriptName),
        });
        this.parser = new Parser();
    }

    isSupported(langId: string): boolean {
        return langId in LANG_FAMILIES;
    }

    get supportedLanguages(): string[] {
        return Object.keys(LANG_FAMILIES);
    }

    // ── Core: parse + query ──

    private async ensureReady(langId: string): Promise<{ lang: Parser.Language; family: LangFamily } | null> {
        if (this.initPromise) {
            await this.initPromise;
        }
        if (!this.parser) { return null; }

        const family = LANG_FAMILIES[langId];
        if (!family) { return null; }

        let lang = this.languages.get(family.wasm);
        if (!lang) {
            try {
                const wasmPath = path.join(this.wasmDir, family.wasm);
                lang = await Parser.Language.load(wasmPath);
                this.languages.set(family.wasm, lang);
            } catch (err) {
                console.warn(`[PostHog] Failed to load grammar ${family.wasm}:`, err);
                return null;
            }
        }

        return { lang, family };
    }

    private parse(text: string, lang: Parser.Language): Parser.Tree | null {
        if (!this.parser) { return null; }
        this.parser.setLanguage(lang);
        return this.parser.parse(text);
    }

    private getQuery(lang: Parser.Language, queryStr: string): Parser.Query | null {
        if (!queryStr.trim()) { return null; }

        const cacheKey = `${lang.toString()}:${queryStr}`;
        let query = this.queryCache.get(cacheKey);
        if (query) { return query; }

        try {
            query = lang.query(queryStr);
            this.queryCache.set(cacheKey, query);
            return query;
        } catch (err) {
            console.warn('[PostHog] Query compilation failed:', err);
            return null;
        }
    }

    private capturesByName(matches: Parser.QueryMatch[]): Map<string, Parser.SyntaxNode[]> {
        const result = new Map<string, Parser.SyntaxNode[]>();
        for (const match of matches) {
            for (const capture of match.captures) {
                const list = result.get(capture.name) || [];
                list.push(capture.node);
                result.set(capture.name, list);
            }
        }
        return result;
    }

    // ── Alias resolution ──

    private findAliases(
        lang: Parser.Language,
        tree: Parser.Tree,
        family: LangFamily,
    ): { clientAliases: Set<string>; destructuredCapture: Set<string>; destructuredFlag: Set<string> } {
        const clientAliases = new Set<string>();
        const destructuredCapture = new Set<string>();
        const destructuredFlag = new Set<string>();

        // Client aliases: const tracker = posthog
        const aliasQuery = this.getQuery(lang, family.queries.clientAliases);
        if (aliasQuery) {
            const matches = aliasQuery.matches(tree.rootNode);
            for (const match of matches) {
                const aliasNode = match.captures.find(c => c.name === 'alias');
                const sourceNode = match.captures.find(c => c.name === 'source');
                if (aliasNode && sourceNode && this.getEffectiveClients().has(sourceNode.node.text)) {
                    clientAliases.add(aliasNode.node.text);
                }
            }
        }

        // Constructor aliases: const client = new PostHog('phc_...')
        const constructorQuery = this.getQuery(lang, family.queries.constructorAliases);
        if (constructorQuery) {
            const matches = constructorQuery.matches(tree.rootNode);
            for (const match of matches) {
                const aliasNode = match.captures.find(c => c.name === 'alias');
                const classNode = match.captures.find(c => c.name === 'class_name');
                if (aliasNode && classNode && classNode.node.text === 'PostHog') {
                    clientAliases.add(aliasNode.node.text);
                }
            }
        }

        // Destructured methods: const { capture, getFeatureFlag } = posthog
        if (family.queries.destructuredMethods) {
            const destructQuery = this.getQuery(lang, family.queries.destructuredMethods);
            if (destructQuery) {
                const matches = destructQuery.matches(tree.rootNode);
                for (const match of matches) {
                    const methodNode = match.captures.find(c => c.name === 'method_name');
                    const sourceNode = match.captures.find(c => c.name === 'source');
                    if (methodNode && sourceNode && this.getEffectiveClients().has(sourceNode.node.text)) {
                        const name = methodNode.node.text;
                        if (family.captureMethods.has(name)) {
                            destructuredCapture.add(name);
                        }
                        if (family.flagMethods.has(name)) {
                            destructuredFlag.add(name);
                        }
                    }
                }
            }
        }

        return { clientAliases, destructuredCapture, destructuredFlag };
    }

    // ── Public API ──

    async findPostHogCalls(doc: vscode.TextDocument): Promise<PostHogCall[]> {
        const ready = await this.ensureReady(doc.languageId);
        if (!ready) { return []; }

        const { lang, family } = ready;
        const tree = this.parse(doc.getText(), lang);
        if (!tree) { return []; }

        const calls: PostHogCall[] = [];
        const allClients = this.getEffectiveClients();

        // Resolve aliases
        const { clientAliases, destructuredCapture, destructuredFlag } = this.findAliases(lang, tree, family);
        for (const a of clientAliases) { allClients.add(a); }

        // Direct method calls: posthog.capture("event")
        const callQuery = this.getQuery(lang, family.queries.postHogCalls);
        if (callQuery) {
            const matches = callQuery.matches(tree.rootNode);
            for (const match of matches) {
                const clientNode = match.captures.find(c => c.name === 'client');
                const methodNode = match.captures.find(c => c.name === 'method');
                const keyNode = match.captures.find(c => c.name === 'key');

                if (!clientNode || !methodNode || !keyNode) { continue; }

                const clientName = this.extractClientName(clientNode.node);
                const method = methodNode.node.text;

                if (!clientName || !allClients.has(clientName)) { continue; }
                if (!family.allMethods.has(method)) { continue; }

                calls.push({
                    method,
                    key: this.cleanStringValue(keyNode.node.text),
                    line: keyNode.node.startPosition.row,
                    keyStartCol: keyNode.node.startPosition.column,
                    keyEndCol: keyNode.node.endPosition.column,
                });
            }
        }

        // Node SDK capture calls: client.capture({ event: 'purchase', ... })
        const nodeCaptureQuery = this.getQuery(lang, family.queries.nodeCaptureCalls);
        if (nodeCaptureQuery) {
            const matches = nodeCaptureQuery.matches(tree.rootNode);
            for (const match of matches) {
                const clientNode = match.captures.find(c => c.name === 'client');
                const methodNode = match.captures.find(c => c.name === 'method');
                const propNameNode = match.captures.find(c => c.name === 'prop_name');
                const keyNode = match.captures.find(c => c.name === 'key');

                if (!clientNode || !methodNode || !propNameNode || !keyNode) { continue; }

                const clientName = this.extractClientName(clientNode.node);
                const method = methodNode.node.text;

                if (!clientName || !allClients.has(clientName)) { continue; }
                if (method !== 'capture') { continue; }
                if (propNameNode.node.text !== 'event') { continue; }

                calls.push({
                    method,
                    key: this.cleanStringValue(keyNode.node.text),
                    line: keyNode.node.startPosition.row,
                    keyStartCol: keyNode.node.startPosition.column,
                    keyEndCol: keyNode.node.endPosition.column,
                });
            }
        }

        // Bare function calls from destructured methods: capture("event")
        if (destructuredCapture.size > 0 || destructuredFlag.size > 0) {
            const bareQuery = this.getQuery(lang, family.queries.bareFunctionCalls);
            if (bareQuery) {
                const matches = bareQuery.matches(tree.rootNode);
                for (const match of matches) {
                    const funcNode = match.captures.find(c => c.name === 'func_name');
                    const keyNode = match.captures.find(c => c.name === 'key');
                    if (!funcNode || !keyNode) { continue; }

                    const name = funcNode.node.text;
                    if (destructuredCapture.has(name) || destructuredFlag.has(name)) {
                        calls.push({
                            method: name,
                            key: this.cleanStringValue(keyNode.node.text),
                            line: keyNode.node.startPosition.row,
                            keyStartCol: keyNode.node.startPosition.column,
                            keyEndCol: keyNode.node.endPosition.column,
                        });
                    }
                }
            }
        }

        // Additional flag functions: useFeatureFlag("key"), etc.
        if (this.config.additionalFlagFunctions.length > 0 && family.queries.bareFunctionCalls) {
            const additionalFlagFuncs = new Set(this.config.additionalFlagFunctions);
            const bareQuery = this.getQuery(lang, family.queries.bareFunctionCalls);
            if (bareQuery) {
                const matches = bareQuery.matches(tree.rootNode);
                for (const match of matches) {
                    const funcNode = match.captures.find(c => c.name === 'func_name');
                    const keyNode = match.captures.find(c => c.name === 'key');
                    if (!funcNode || !keyNode) { continue; }

                    if (additionalFlagFuncs.has(funcNode.node.text)) {
                        calls.push({
                            method: funcNode.node.text,
                            key: this.cleanStringValue(keyNode.node.text),
                            line: keyNode.node.startPosition.row,
                            keyStartCol: keyNode.node.startPosition.column,
                            keyEndCol: keyNode.node.endPosition.column,
                        });
                    }
                }
            }
        }

        return calls;
    }

    async findInitCalls(doc: vscode.TextDocument): Promise<PostHogInitCall[]> {
        const ready = await this.ensureReady(doc.languageId);
        if (!ready) { return []; }

        const { lang } = ready;
        const tree = this.parse(doc.getText(), lang);
        if (!tree) { return []; }

        const allClients = this.getEffectiveClients();
        const results: PostHogInitCall[] = [];

        // Query: posthog.init('token', { ... })
        const queryStr = `
            (call_expression
                function: (member_expression
                    object: (_) @client
                    property: (property_identifier) @method)
                arguments: (arguments
                    (string (string_fragment) @token)
                    (object)? @config)) @call
        `;

        const query = this.getQuery(lang, queryStr);
        if (!query) { return []; }

        for (const match of query.matches(tree.rootNode)) {
            const clientNode = match.captures.find(c => c.name === 'client');
            const methodNode = match.captures.find(c => c.name === 'method');
            const tokenNode = match.captures.find(c => c.name === 'token');
            const configNode = match.captures.find(c => c.name === 'config');

            if (!clientNode || !methodNode || !tokenNode) { continue; }
            if (methodNode.node.text !== 'init') { continue; }

            const clientName = this.extractClientName(clientNode.node);
            if (!clientName || !allClients.has(clientName)) { continue; }

            const token = this.cleanStringValue(tokenNode.node.text);
            const configProperties = new Map<string, string>();
            let apiHost: string | null = null;

            // Extract config object properties
            if (configNode) {
                for (const child of configNode.node.namedChildren) {
                    if (child.type === 'pair') {
                        const keyNode = child.childForFieldName('key');
                        const valueNode = child.childForFieldName('value');
                        if (keyNode && valueNode) {
                            const key = keyNode.text.replace(/['"]/g, '');
                            let value = valueNode.text;
                            // Clean string values
                            if (valueNode.type === 'string') {
                                const frag = valueNode.namedChildren.find(c => c.type === 'string_fragment');
                                if (frag) { value = frag.text; }
                            }
                            configProperties.set(key, value);
                            if (key === 'api_host') { apiHost = value; }
                        }
                    }
                }
            }

            results.push({
                token,
                tokenLine: tokenNode.node.startPosition.row,
                tokenStartCol: tokenNode.node.startPosition.column,
                tokenEndCol: tokenNode.node.endPosition.column,
                apiHost,
                configProperties,
            });
        }

        return results;
    }

    async findFunctions(doc: vscode.TextDocument): Promise<FunctionInfo[]> {
        const ready = await this.ensureReady(doc.languageId);
        if (!ready) { return []; }

        const { lang, family } = ready;
        const text = doc.getText();
        const tree = this.parse(text, lang);
        if (!tree) { return []; }

        const query = this.getQuery(lang, family.queries.functions);
        if (!query) { return []; }

        const functions: FunctionInfo[] = [];
        const matches = query.matches(tree.rootNode);

        for (const match of matches) {
            const nameNode = match.captures.find(c => c.name === 'func_name');
            const paramsNode = match.captures.find(c => c.name === 'func_params');
            const singleParamNode = match.captures.find(c => c.name === 'func_single_param');
            const bodyNode = match.captures.find(c => c.name === 'func_body');

            if (!nameNode || !bodyNode) { continue; }

            const name = nameNode.node.text;
            // Skip control flow keywords that might match method patterns
            if (['if', 'for', 'while', 'switch', 'catch', 'else'].includes(name)) { continue; }

            const params = singleParamNode
                ? [singleParamNode.node.text]
                : paramsNode ? this.extractParams(paramsNode.node.text) : [];

            const bodyLine = bodyNode.node.startPosition.row;
            const nextLineIdx = bodyLine + 1;
            const lines = text.split('\n');
            const nextLine = nextLineIdx < lines.length ? lines[nextLineIdx] : '';
            const bodyIndent = nextLine.match(/^(\s*)/)?.[1] || '    ';

            functions.push({
                name,
                params,
                isComponent: /^[A-Z]/.test(name),
                bodyLine,
                bodyIndent,
            });
        }

        return functions;
    }

    async findVariantBranches(doc: vscode.TextDocument): Promise<VariantBranch[]> {
        const ready = await this.ensureReady(doc.languageId);
        if (!ready) { return []; }

        const { lang, family } = ready;
        const tree = this.parse(doc.getText(), lang);
        if (!tree) { return []; }

        const allClients = this.getEffectiveClients();
        const { clientAliases } = this.findAliases(lang, tree, family);
        for (const a of clientAliases) { allClients.add(a); }

        const branches: VariantBranch[] = [];

        // 1. Find flag variable assignments: const variant = posthog.getFeatureFlag("key")
        const assignQuery = this.getQuery(lang, family.queries.flagAssignments);
        if (assignQuery) {
            const matches = assignQuery.matches(tree.rootNode);
            for (const match of matches) {
                const varNode = match.captures.find(c => c.name === 'var_name');
                const clientNode = match.captures.find(c => c.name === 'client');
                const methodNode = match.captures.find(c => c.name === 'method');
                const keyNode = match.captures.find(c => c.name === 'flag_key');
                const assignNode = match.captures.find(c => c.name === 'assignment');

                if (!varNode || !clientNode || !methodNode || !keyNode) { continue; }
                const varClientName = this.extractClientName(clientNode.node);
                if (!varClientName || !allClients.has(varClientName)) { continue; }

                const method = methodNode.node.text;
                if (!family.flagMethods.has(method)) { continue; }

                const varName = varNode.node.text;
                const flagKey = this.cleanStringValue(keyNode.node.text);
                const afterNode = assignNode?.node || varNode.node;

                // Find if-chains and switches using this variable
                this.findIfChainsForVar(tree.rootNode, varName, flagKey, afterNode, branches);
                this.findSwitchForVar(tree.rootNode, varName, flagKey, afterNode, branches);
            }
        }

        // 1b. Find bare function call assignments: const x = useFeatureFlag("key")
        const bareFlagFunctions = new Set([
            ...this.config.additionalFlagFunctions,
            'useFeatureFlag', 'useFeatureFlagPayload', 'useFeatureFlagVariantKey',
        ]);
        if (bareFlagFunctions.size > 0 && family.queries.bareFunctionCalls) {
            const bareAssignQuery = this.getQuery(lang, `
                (lexical_declaration
                    (variable_declarator
                        name: (identifier) @var_name
                        value: (call_expression
                            function: (identifier) @func_name
                            arguments: (arguments . (string (string_fragment) @flag_key))))) @assignment

                (variable_declaration
                    (variable_declarator
                        name: (identifier) @var_name
                        value: (call_expression
                            function: (identifier) @func_name
                            arguments: (arguments . (string (string_fragment) @flag_key))))) @assignment
            `);
            if (bareAssignQuery) {
                const matches = bareAssignQuery.matches(tree.rootNode);
                for (const match of matches) {
                    const varNode = match.captures.find(c => c.name === 'var_name');
                    const funcNode = match.captures.find(c => c.name === 'func_name');
                    const keyNode = match.captures.find(c => c.name === 'flag_key');
                    const assignNode = match.captures.find(c => c.name === 'assignment');

                    if (!varNode || !funcNode || !keyNode) { continue; }
                    if (!bareFlagFunctions.has(funcNode.node.text)) { continue; }

                    const varName = varNode.node.text;
                    const flagKey = this.cleanStringValue(keyNode.node.text);
                    const afterNode = assignNode?.node || varNode.node;

                    this.findIfChainsForVar(tree.rootNode, varName, flagKey, afterNode, branches);
                    this.findSwitchForVar(tree.rootNode, varName, flagKey, afterNode, branches);
                }
            }
        }

        // 2. Find inline flag checks: if (posthog.getFeatureFlag("key") === "variant")
        this.findInlineFlagIfs(tree.rootNode, allClients, family, branches);

        // 3. Find isFeatureEnabled checks: if (posthog.isFeatureEnabled("key"))
        this.findEnabledIfs(tree.rootNode, allClients, family, branches);

        return branches;
    }

    async findFlagAssignments(doc: vscode.TextDocument): Promise<FlagAssignment[]> {
        const ready = await this.ensureReady(doc.languageId);
        if (!ready) { return []; }

        const { lang, family } = ready;
        const tree = this.parse(doc.getText(), lang);
        if (!tree) { return []; }

        const allClients = this.getEffectiveClients();
        const { clientAliases } = this.findAliases(lang, tree, family);
        for (const a of clientAliases) { allClients.add(a); }

        const assignments: FlagAssignment[] = [];

        const assignQuery = this.getQuery(lang, family.queries.flagAssignments);
        if (assignQuery) {
            const matches = assignQuery.matches(tree.rootNode);
            for (const match of matches) {
                const varNode = match.captures.find(c => c.name === 'var_name');
                const clientNode = match.captures.find(c => c.name === 'client');
                const methodNode = match.captures.find(c => c.name === 'method');
                const keyNode = match.captures.find(c => c.name === 'flag_key');

                if (!varNode || !clientNode || !methodNode || !keyNode) { continue; }
                const varClientName = this.extractClientName(clientNode.node);
                if (!varClientName || !allClients.has(varClientName)) { continue; }

                const method = methodNode.node.text;
                if (!family.flagMethods.has(method)) { continue; }

                // Check if there's already a type annotation by looking at the parent
                // In TS: `const flag: boolean = ...` — the variable_declarator has a type_annotation child
                const declarator = varNode.node.parent;
                const hasTypeAnnotation = declarator
                    ? declarator.namedChildren.some(c => c.type === 'type_annotation')
                    : false;

                assignments.push({
                    varName: varNode.node.text,
                    method,
                    flagKey: this.cleanStringValue(keyNode.node.text),
                    line: varNode.node.startPosition.row,
                    varNameEndCol: varNode.node.endPosition.column,
                    hasTypeAnnotation,
                });
            }
        }

        return assignments;
    }

    async getCompletionContext(doc: vscode.TextDocument, position: vscode.Position): Promise<CompletionContext | null> {
        const ready = await this.ensureReady(doc.languageId);
        if (!ready) { return null; }

        const { lang, family } = ready;
        const tree = this.parse(doc.getText(), lang);
        if (!tree) { return null; }

        const allClients = this.getEffectiveClients();
        const { clientAliases } = this.findAliases(lang, tree, family);
        for (const a of clientAliases) { allClients.add(a); }

        const node = tree.rootNode.descendantForPosition({
            row: position.line,
            column: position.character,
        });

        // Walk up the tree to find if we're inside a PostHog call's arguments
        let current: Parser.SyntaxNode | null = node;
        while (current) {
            if (current.type === 'arguments' || current.type === 'argument_list') {
                const callNode = current.parent;
                if (!callNode) { current = current.parent; continue; }

                const func = callNode.childForFieldName('function');
                if (!func) { current = current.parent; continue; }

                let clientName: string | undefined;
                let methodName: string | undefined;

                // member_expression: posthog.capture
                if (func.type === 'member_expression' || func.type === 'attribute' || func.type === 'selector_expression') {
                    const obj = func.childForFieldName('object') || func.childForFieldName('operand');
                    const prop = func.childForFieldName('property') || func.childForFieldName('attribute') || func.childForFieldName('field');
                    clientName = obj ? (this.extractClientName(obj) ?? undefined) : undefined;
                    methodName = prop?.text;
                }

                if (!clientName || !methodName || !allClients.has(clientName)) {
                    current = current.parent;
                    continue;
                }

                const args = current.namedChildren;
                const argIndex = args.findIndex(a =>
                    position.line >= a.startPosition.row &&
                    position.line <= a.endPosition.row &&
                    (position.line > a.startPosition.row || position.character >= a.startPosition.column) &&
                    (position.line < a.endPosition.row || position.character <= a.endPosition.column)
                );

                // We're before/at the first argument
                if (family.captureMethods.has(methodName) && argIndex <= 0) {
                    return { type: 'capture_event' };
                }
                if (family.flagMethods.has(methodName) && argIndex <= 0) {
                    return { type: 'flag_key' };
                }

                // We're in the second argument (properties object) of a capture call
                if (family.captureMethods.has(methodName) && argIndex === 1 && args[0]) {
                    const eventName = this.extractStringFromNode(args[0]);
                    if (eventName) {
                        // Determine key vs value position
                        const propCtx = this.detectPropertyPosition(node, position);
                        if (propCtx.mode === 'value' && propCtx.propertyName) {
                            return { type: 'property_value', eventName, propertyName: propCtx.propertyName };
                        }
                        return { type: 'property_key', eventName };
                    }
                }

                return null;
            }
            current = current.parent;
        }

        // Check for additional bare flag functions: useFeatureFlag("key"), etc.
        if (this.config.additionalFlagFunctions.length > 0) {
            const additionalFlagFuncs = new Set(this.config.additionalFlagFunctions);
            let cur: Parser.SyntaxNode | null = node;
            while (cur) {
                if (cur.type === 'arguments' || cur.type === 'argument_list') {
                    const callNode = cur.parent;
                    if (!callNode) { cur = cur.parent; continue; }

                    const func = callNode.childForFieldName('function');
                    if (func?.type === 'identifier' && additionalFlagFuncs.has(func.text)) {
                        const args = cur.namedChildren;
                        const argIndex = args.findIndex(a =>
                            position.line >= a.startPosition.row &&
                            position.line <= a.endPosition.row &&
                            (position.line > a.startPosition.row || position.character >= a.startPosition.column) &&
                            (position.line < a.endPosition.row || position.character <= a.endPosition.column)
                        );
                        if (argIndex <= 0) {
                            return { type: 'flag_key' };
                        }
                    }
                }
                cur = cur.parent;
            }
        }

        return null;
    }

    // ── Variant detection helpers ──

    private findIfChainsForVar(
        root: Parser.SyntaxNode,
        varName: string,
        flagKey: string,
        afterNode: Parser.SyntaxNode,
        branches: VariantBranch[],
    ): void {
        // Find the containing scope
        const scope = afterNode.parent;
        if (!scope) { return; }

        let foundAssignment = false;
        for (const child of scope.namedChildren) {
            if (child.startIndex >= afterNode.startIndex && child.endIndex >= afterNode.endIndex) {
                foundAssignment = true;
            }
            if (!foundAssignment) { continue; }
            if (child === afterNode) { continue; }

            if (child.type === 'if_statement') {
                this.extractIfChainBranches(child, varName, flagKey, branches);
            }
        }
    }

    private extractIfChainBranches(
        ifNode: Parser.SyntaxNode,
        varName: string,
        flagKey: string,
        branches: VariantBranch[],
    ): void {
        const condition = ifNode.childForFieldName('condition');
        const consequence = ifNode.childForFieldName('consequence');
        const alternative = ifNode.childForFieldName('alternative');

        if (!condition || !consequence) { return; }

        const variant = this.extractComparison(condition, varName);
        if (variant === null && !alternative) { return; }

        if (variant !== null) {
            branches.push({
                flagKey,
                variantKey: variant,
                conditionLine: ifNode.startPosition.row,
                startLine: ifNode.startPosition.row,
                endLine: consequence.endPosition.row,
            });
        }

        if (alternative) {
            const altChild = alternative.namedChildren[0];
            if (altChild?.type === 'if_statement') {
                this.extractIfChainBranches(altChild, varName, flagKey, branches);
            } else if (altChild) {
                branches.push({
                    flagKey,
                    variantKey: 'else',
                    conditionLine: alternative.startPosition.row,
                    startLine: alternative.startPosition.row,
                    endLine: altChild.endPosition.row,
                });
            }
        }
    }

    private findSwitchForVar(
        root: Parser.SyntaxNode,
        varName: string,
        flagKey: string,
        afterNode: Parser.SyntaxNode,
        branches: VariantBranch[],
    ): void {
        const scope = afterNode.parent;
        if (!scope) { return; }

        let foundAssignment = false;
        for (const child of scope.namedChildren) {
            if (child.startIndex >= afterNode.startIndex) {
                foundAssignment = true;
            }
            if (!foundAssignment || child === afterNode) { continue; }

            if (child.type === 'switch_statement') {
                const value = child.childForFieldName('value');
                if (!value) { continue; }

                // Check if switch is on our variable
                const switchedVar = this.extractIdentifier(value);
                if (switchedVar !== varName) { continue; }

                const body = child.childForFieldName('body');
                if (!body) { continue; }

                for (const caseNode of body.namedChildren) {
                    if (caseNode.type === 'switch_case') {
                        const caseValue = caseNode.childForFieldName('value');
                        const variantKey = caseValue ? this.extractStringFromNode(caseValue) : null;

                        // Get the body range: from case line to before next case or end of switch
                        const nextSibling = caseNode.nextNamedSibling;
                        const endLine = nextSibling
                            ? nextSibling.startPosition.row - 1
                            : body.endPosition.row - 1;

                        branches.push({
                            flagKey,
                            variantKey: variantKey || 'default',
                            conditionLine: caseNode.startPosition.row,
                            startLine: caseNode.startPosition.row,
                            endLine,
                        });
                    } else if (caseNode.type === 'switch_default') {
                        const nextSibling = caseNode.nextNamedSibling;
                        const endLine = nextSibling
                            ? nextSibling.startPosition.row - 1
                            : body.endPosition.row - 1;

                        branches.push({
                            flagKey,
                            variantKey: 'default',
                            conditionLine: caseNode.startPosition.row,
                            startLine: caseNode.startPosition.row,
                            endLine,
                        });
                    }
                }
            }
        }
    }

    private findInlineFlagIfs(
        root: Parser.SyntaxNode,
        clients: Set<string>,
        family: LangFamily,
        branches: VariantBranch[],
    ): void {
        // Walk all if_statements and check for inline flag comparisons
        this.walkNodes(root, 'if_statement', (ifNode) => {
            const condition = ifNode.childForFieldName('condition');
            const consequence = ifNode.childForFieldName('consequence');
            if (!condition || !consequence) { return; }

            // Look for: getFeatureFlag("key") === "variant"
            const callInfo = this.extractFlagCallComparison(condition, clients, family);
            if (!callInfo) { return; }

            branches.push({
                flagKey: callInfo.flagKey,
                variantKey: callInfo.variant,
                conditionLine: ifNode.startPosition.row,
                startLine: ifNode.startPosition.row,
                endLine: consequence.endPosition.row,
            });

            // Process else chain
            const alternative = ifNode.childForFieldName('alternative');
            if (alternative) {
                const altChild = alternative.namedChildren[0];
                if (altChild?.type === 'if_statement') {
                    // Recurse — the recursive call to findInlineFlagIfs will handle it
                } else if (altChild) {
                    branches.push({
                        flagKey: callInfo.flagKey,
                        variantKey: 'else',
                        conditionLine: alternative.startPosition.row,
                        startLine: alternative.startPosition.row,
                        endLine: altChild.endPosition.row,
                    });
                }
            }
        });
    }

    private findEnabledIfs(
        root: Parser.SyntaxNode,
        clients: Set<string>,
        family: LangFamily,
        branches: VariantBranch[],
    ): void {
        this.walkNodes(root, 'if_statement', (ifNode) => {
            const condition = ifNode.childForFieldName('condition');
            const consequence = ifNode.childForFieldName('consequence');
            if (!condition || !consequence) { return; }

            const flagKey = this.extractEnabledCall(condition, clients, family);
            if (!flagKey) { return; }

            // Check for negation
            const negated = this.isNegated(condition);

            branches.push({
                flagKey,
                variantKey: negated ? 'false' : 'true',
                conditionLine: ifNode.startPosition.row,
                startLine: ifNode.startPosition.row,
                endLine: consequence.endPosition.row,
            });

            const alternative = ifNode.childForFieldName('alternative');
            if (alternative) {
                const altChild = alternative.namedChildren[0];
                if (altChild && altChild.type !== 'if_statement') {
                    branches.push({
                        flagKey,
                        variantKey: negated ? 'true' : 'false',
                        conditionLine: alternative.startPosition.row,
                        startLine: alternative.startPosition.row,
                        endLine: altChild.endPosition.row,
                    });
                }
            }
        });
    }

    // ── Node extraction helpers ──

    private extractComparison(conditionNode: Parser.SyntaxNode, varName: string): string | null {
        // Unwrap parenthesized_expression
        let node = conditionNode;
        while (node.type === 'parenthesized_expression' && node.namedChildren.length === 1) {
            node = node.namedChildren[0];
        }

        if (node.type === 'binary_expression') {
            const left = node.childForFieldName('left');
            const right = node.childForFieldName('right');
            const op = node.childForFieldName('operator');

            if (!left || !right) { return null; }

            const opText = op?.text || '';
            if (opText !== '===' && opText !== '==' && opText !== '!==' && opText !== '!=') { return null; }

            if (left.text === varName) {
                return this.extractStringFromNode(right);
            }
            if (right.text === varName) {
                return this.extractStringFromNode(left);
            }
        }

        return null;
    }

    private extractFlagCallComparison(
        conditionNode: Parser.SyntaxNode,
        clients: Set<string>,
        family: LangFamily,
    ): { flagKey: string; variant: string } | null {
        let node = conditionNode;
        while (node.type === 'parenthesized_expression' && node.namedChildren.length === 1) {
            node = node.namedChildren[0];
        }

        if (node.type !== 'binary_expression') { return null; }

        const left = node.childForFieldName('left');
        const right = node.childForFieldName('right');
        if (!left || !right) { return null; }

        // Check if left is a posthog.getFeatureFlag("key") call
        const callNode = left.type === 'call_expression' ? left : (right.type === 'call_expression' ? right : null);
        const valueNode = callNode === left ? right : left;
        if (!callNode || !valueNode) { return null; }

        const func = callNode.childForFieldName('function');
        if (!func || (func.type !== 'member_expression' && func.type !== 'attribute' && func.type !== 'selector_expression')) {
            return null;
        }

        const obj = func.childForFieldName('object') || func.childForFieldName('operand');
        const prop = func.childForFieldName('property') || func.childForFieldName('attribute') || func.childForFieldName('field');
        if (!obj || !prop) { return null; }
        const extractedClient = this.extractClientName(obj);
        if (!extractedClient || !clients.has(extractedClient)) { return null; }

        const method = prop.text;
        // Only match getFeatureFlag-like methods (not isFeatureEnabled which returns bool)
        const flagGetters = new Set([...family.flagMethods].filter(m =>
            m.toLowerCase().includes('get') || m.toLowerCase().includes('flag')
        ));
        if (!flagGetters.has(method)) { return null; }

        const args = callNode.childForFieldName('arguments');
        if (!args) { return null; }
        const firstArg = args.namedChildren[0];
        if (!firstArg) { return null; }

        const flagKey = this.extractStringFromNode(firstArg);
        const variant = this.extractStringFromNode(valueNode);
        if (!flagKey || !variant) { return null; }

        return { flagKey, variant };
    }

    private extractEnabledCall(
        conditionNode: Parser.SyntaxNode,
        clients: Set<string>,
        family: LangFamily,
    ): string | null {
        let node = conditionNode;
        // Unwrap parenthesized_expression and unary ! (negation)
        while (node.type === 'parenthesized_expression' && node.namedChildren.length === 1) {
            node = node.namedChildren[0];
        }
        if (node.type === 'unary_expression' || node.type === 'not_operator') {
            const operand = node.namedChildren[node.namedChildren.length - 1];
            if (operand) { node = operand; }
        }
        while (node.type === 'parenthesized_expression' && node.namedChildren.length === 1) {
            node = node.namedChildren[0];
        }

        if (node.type !== 'call_expression' && node.type !== 'call') { return null; }

        const func = node.childForFieldName('function');
        if (!func) { return null; }

        let clientName: string | undefined;
        let methodName: string | undefined;

        if (func.type === 'member_expression' || func.type === 'attribute' || func.type === 'selector_expression') {
            const obj = func.childForFieldName('object') || func.childForFieldName('operand');
            const prop = func.childForFieldName('property') || func.childForFieldName('attribute') || func.childForFieldName('field');
            clientName = obj ? (this.extractClientName(obj) ?? undefined) : undefined;
            methodName = prop?.text;
        }

        if (!clientName || !methodName || !clients.has(clientName)) { return null; }

        // Match isFeatureEnabled-like methods
        const enabledMethods = new Set([...family.flagMethods].filter(m =>
            m.toLowerCase().includes('enabled') || m.toLowerCase().includes('is_feature')
        ));
        if (!enabledMethods.has(methodName)) { return null; }

        const args = node.childForFieldName('arguments');
        if (!args) { return null; }
        const firstArg = args.namedChildren[0];
        return firstArg ? this.extractStringFromNode(firstArg) : null;
    }

    private isNegated(conditionNode: Parser.SyntaxNode): boolean {
        let node = conditionNode;
        while (node.type === 'parenthesized_expression' && node.namedChildren.length === 1) {
            node = node.namedChildren[0];
        }
        return node.type === 'unary_expression' && node.text.startsWith('!')
            || node.type === 'not_operator';
    }

    private extractIdentifier(node: Parser.SyntaxNode): string | null {
        if (node.type === 'identifier') { return node.text; }
        // Unwrap parenthesized
        if (node.type === 'parenthesized_expression' && node.namedChildren.length === 1) {
            return this.extractIdentifier(node.namedChildren[0]);
        }
        return null;
    }

    private extractStringFromNode(node: Parser.SyntaxNode): string | null {
        if (node.type === 'string' || node.type === 'template_string') {
            const content = node.namedChildren.find(c =>
                c.type === 'string_fragment' || c.type === 'string_content' || c.type === 'string_value'
            );
            return content ? content.text : null;
        }
        // Go: interpreted_string_literal includes quotes
        if (node.type === 'interpreted_string_literal' || node.type === 'raw_string_literal') {
            return node.text.slice(1, -1);
        }
        // For simple string fragments already extracted
        if (node.type === 'string_fragment' || node.type === 'string_content') {
            return node.text;
        }
        return null;
    }

    private cleanStringValue(text: string): string {
        // Strip surrounding quotes if present
        if ((text.startsWith('"') && text.endsWith('"')) ||
            (text.startsWith("'") && text.endsWith("'")) ||
            (text.startsWith('`') && text.endsWith('`'))) {
            return text.slice(1, -1);
        }
        return text;
    }

    private extractParams(paramsText: string): string[] {
        // Remove surrounding parens
        let text = paramsText.trim();
        if (text.startsWith('(')) { text = text.slice(1); }
        if (text.endsWith(')')) { text = text.slice(0, -1); }
        if (!text.trim()) { return []; }

        const SKIP = new Set(['e', 'ev', 'event', 'evt', 'ctx', 'context', 'req', 'res', 'next', 'err', 'error', '_', '__']);

        return text
            .split(',')
            .map(p => {
                if (p.includes('{') || p.includes('}')) { return ''; }
                const name = p.split(':')[0].split('=')[0].replace(/[?.]/g, '').trim();
                return name;
            })
            .filter(p => p && !SKIP.has(p) && !p.startsWith('...'));
    }

    private detectPropertyPosition(node: Parser.SyntaxNode, position: vscode.Position): { mode: 'key' | 'value'; propertyName?: string } {
        // Walk up to find if we're in a pair (key: value)
        let current: Parser.SyntaxNode | null = node;
        while (current) {
            if (current.type === 'pair') {
                const key = current.childForFieldName('key');
                const value = current.childForFieldName('value');
                if (value && position.line >= value.startPosition.row &&
                    (position.line > value.startPosition.row || position.character >= value.startPosition.column)) {
                    return { mode: 'value', propertyName: key?.text };
                }
                return { mode: 'key' };
            }
            if (current.type === 'object' || current.type === 'object_pattern') {
                return { mode: 'key' };
            }
            current = current.parent;
        }
        return { mode: 'key' };
    }

    private walkNodes(
        root: Parser.SyntaxNode,
        type: string,
        callback: (node: Parser.SyntaxNode) => void,
    ): void {
        const visit = (node: Parser.SyntaxNode) => {
            if (node.type === type) {
                callback(node);
            }
            for (const child of node.namedChildren) {
                visit(child);
            }
        };
        visit(root);
    }

    dispose(): void {
        this.parser?.delete();
        this.parser = null;
        this.languages.clear();
        this.queryCache.clear();
    }
}
