import * as assert from 'assert';
import { PostHogService } from '../../services/postHogService';
import { AuthService } from '../../services/authService';
import { PostHogApiError } from '../../models/types';

// ---------------------------------------------------------------------------
// Fetch mock
// ---------------------------------------------------------------------------

interface FetchCall {
    url: string;
    init?: RequestInit;
}

interface MockResponse {
    status: number;
    body: unknown;
}

interface FetchMock {
    fn: typeof fetch;
    calls: FetchCall[];
    queue: (response: MockResponse | Error) => void;
    reset: () => void;
}

function createFetchMock(): FetchMock {
    const calls: FetchCall[] = [];
    const responseQueue: Array<MockResponse | Error> = [];

    const fn = (async (input: unknown, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : (input as { url: string }).url;
        calls.push({ url, init });
        const response = responseQueue.shift();
        if (!response) {
            throw new Error(`No mock response queued for ${url}`);
        }
        if (response instanceof Error) {
            throw response;
        }
        return new Response(JSON.stringify(response.body), {
            status: response.status,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    return {
        fn,
        calls,
        queue: (response) => responseQueue.push(response),
        reset: () => {
            calls.length = 0;
            responseQueue.length = 0;
        },
    };
}

// ---------------------------------------------------------------------------
// Auth service stub
// ---------------------------------------------------------------------------

const TEST_HOST = 'https://us.posthog.example.com';
const TEST_TOKEN = 'test-access-token';

function makeAuthStub(overrides: {
    accessToken?: string | undefined;
    host?: string;
    forceRefreshToken?: () => Promise<string>;
} = {}): AuthService {
    const hasAccessTokenOverride = Object.prototype.hasOwnProperty.call(overrides, 'accessToken');
    const stub = {
        getAccessToken: async (): Promise<string | undefined> => hasAccessTokenOverride ? overrides.accessToken : TEST_TOKEN,
        getHost: () => overrides.host ?? TEST_HOST,
        forceRefreshToken: overrides.forceRefreshToken ?? (async () => TEST_TOKEN),
    };
    return stub as unknown as AuthService;
}

// ---------------------------------------------------------------------------
// Helpers for inspecting fetch calls
// ---------------------------------------------------------------------------

function getQueryBody(call: FetchCall): { query: { kind: string; query: string } } {
    assert.ok(call.init, 'expected init on fetch call');
    assert.ok(call.init.body, 'expected body on fetch call');
    return JSON.parse(call.init.body as string);
}

function getHogQL(call: FetchCall): string {
    return getQueryBody(call).query.query;
}

function assertEscaped(query: string, doubledFragment: string): void {
    assert.ok(
        query.includes(doubledFragment),
        `Expected query to contain ${doubledFragment} (doubled-quote escaping). Got: ${query}`,
    );
    assert.ok(
        !query.includes("\\'"),
        `Query should NOT use backslash-quote escaping. Got: ${query}`,
    );
}

// ===========================================================================
// Test suite
// ===========================================================================

suite('PostHogService', () => {

    let fetchMock: FetchMock;
    let originalFetch: typeof fetch;

    setup(() => {
        originalFetch = globalThis.fetch;
        fetchMock = createFetchMock();
        globalThis.fetch = fetchMock.fn;
    });

    teardown(() => {
        globalThis.fetch = originalFetch;
    });

    // ========================================================================
    // 1. HogQL escaping verification (REGRESSION-CRITICAL)
    // ========================================================================
    suite('HogQL escaping (regression)', () => {

        test('getEventVolumes escapes single quotes in event names with doubled quotes', async () => {
            fetchMock.queue({ status: 200, body: { results: [] } });
            const service = new PostHogService(makeAuthStub());

            await service.getEventVolumes(123, ["it's_an_event"]);

            assert.strictEqual(fetchMock.calls.length, 1);
            const query = getHogQL(fetchMock.calls[0]);
            assertEscaped(query, "'it''s_an_event'");
        });

        test('getEventVolumes escapes multiple events with quotes', async () => {
            fetchMock.queue({ status: 200, body: { results: [] } });
            const service = new PostHogService(makeAuthStub());

            await service.getEventVolumes(123, ["a'b", "c'd"]);

            const query = getHogQL(fetchMock.calls[0]);
            assert.ok(query.includes("'a''b'"), `expected 'a''b' in: ${query}`);
            assert.ok(query.includes("'c''d'"), `expected 'c''d' in: ${query}`);
            assert.ok(!query.includes("\\'"), `should not use backslash escape: ${query}`);
        });

        test('getEventVolumes early-returns empty Map without calling fetch when eventNames empty', async () => {
            const service = new PostHogService(makeAuthStub());
            const result = await service.getEventVolumes(123, []);
            assert.strictEqual(fetchMock.calls.length, 0);
            assert.strictEqual(result.size, 0);
        });

        test('getEventSparklines escapes single quotes in event names', async () => {
            fetchMock.queue({ status: 200, body: { results: [] } });
            const service = new PostHogService(makeAuthStub());

            await service.getEventSparklines(123, ["it's_an_event"]);

            assert.strictEqual(fetchMock.calls.length, 1);
            assertEscaped(getHogQL(fetchMock.calls[0]), "'it''s_an_event'");
        });

        test('getEventTrends escapes single quotes in event names', async () => {
            fetchMock.queue({ status: 200, body: { results: [] } });
            const service = new PostHogService(makeAuthStub());

            await service.getEventTrends(123, ["it's_an_event"], 14);

            assert.strictEqual(fetchMock.calls.length, 1);
            assertEscaped(getHogQL(fetchMock.calls[0]), "'it''s_an_event'");
        });

        test('getSessionCounts escapes single quotes in event names', async () => {
            fetchMock.queue({ status: 200, body: { results: [] } });
            const service = new PostHogService(makeAuthStub());

            await service.getSessionCounts(123, ["it's_an_event"], []);

            assert.strictEqual(fetchMock.calls.length, 1);
            assertEscaped(getHogQL(fetchMock.calls[0]), "'it''s_an_event'");
        });

        test('getSessionCounts escapes single quotes in flag keys', async () => {
            fetchMock.queue({ status: 200, body: { results: [] } });
            const service = new PostHogService(makeAuthStub());

            await service.getSessionCounts(123, [], ["flag's-key"]);

            assert.strictEqual(fetchMock.calls.length, 1);
            assertEscaped(getHogQL(fetchMock.calls[0]), "'flag''s-key'");
        });

        test('getSessionCounts with both events and flags emits a UNION ALL with both escaped', async () => {
            fetchMock.queue({ status: 200, body: { results: [] } });
            const service = new PostHogService(makeAuthStub());

            await service.getSessionCounts(123, ["a'b"], ["c'd"]);

            const query = getHogQL(fetchMock.calls[0]);
            assert.ok(query.includes('UNION ALL'), `expected UNION ALL in: ${query}`);
            assert.ok(query.includes("'a''b'"), `expected 'a''b' in: ${query}`);
            assert.ok(query.includes("'c''d'"), `expected 'c''d' in: ${query}`);
            assert.ok(!query.includes("\\'"), `should not use backslash escape: ${query}`);
        });

        test('getSessionCounts with no events and no flags returns empty without fetching', async () => {
            const service = new PostHogService(makeAuthStub());
            const result = await service.getSessionCounts(123, [], []);
            assert.strictEqual(fetchMock.calls.length, 0);
            assert.strictEqual(result.size, 0);
        });

        test('getPropertyValues escapes single quotes in event name and property name', async () => {
            fetchMock.queue({ status: 200, body: { results: [] } });
            const service = new PostHogService(makeAuthStub());

            await service.getPropertyValues(123, "ev'name", "prop'name");

            assert.strictEqual(fetchMock.calls.length, 1);
            const query = getHogQL(fetchMock.calls[0]);
            assert.ok(query.includes("'ev''name'"), `expected 'ev''name' in: ${query}`);
            assert.ok(query.includes("prop''name"), `expected prop''name in: ${query}`);
            assert.ok(!query.includes("\\'"), `should not use backslash escape: ${query}`);
        });

        test('getRecentSessions escapes single quotes in event name', async () => {
            fetchMock.queue({ status: 200, body: { results: [] } });
            const service = new PostHogService(makeAuthStub());

            await service.getRecentSessions(123, "it's_an_event");

            assert.strictEqual(fetchMock.calls.length, 1);
            assertEscaped(getHogQL(fetchMock.calls[0]), "'it''s_an_event'");
        });

        test('getRecentSessionsForFlag escapes single quotes in flag key (string literal context)', async () => {
            fetchMock.queue({ status: 200, body: { results: [] } });
            const service = new PostHogService(makeAuthStub());

            await service.getRecentSessionsForFlag(123, "flag's-key");

            assert.strictEqual(fetchMock.calls.length, 1);
            const query = getHogQL(fetchMock.calls[0]);
            // The flag key appears inside a quoted string literal — the quote must be doubled
            assert.ok(query.includes("'flag''s-key'"), `expected 'flag''s-key' in: ${query}`);
            assert.ok(!query.includes("\\'"), `should not use backslash escape: ${query}`);
        });

        // FAILING - bug documentation (skipped).
        // src/services/postHogService.ts line 422 interpolates `safeKey` directly
        // into a property-path: `e.properties.$feature.${safeKey}`. The
        // `escapeHogQLString` helper is designed for STRING LITERAL contexts
        // (it doubles single quotes). It does not escape identifier/path
        // contexts. A flag key containing a '.', space, or other identifier-
        // breaking character will either cause a HogQL parse error or produce
        // an unexpected path. This is a correctness issue that should be
        // addressed separately.
        test.skip('getRecentSessionsForFlag safely handles flag keys with dots in identifier path (BUG)', async () => {
            fetchMock.queue({ status: 200, body: { results: [] } });
            const service = new PostHogService(makeAuthStub());

            await service.getRecentSessionsForFlag(123, "a.b");

            const query = getHogQL(fetchMock.calls[0]);
            // Ideally the query would either quote the identifier or avoid
            // interpolating user-controlled identifiers. Currently it emits
            // `e.properties.$feature.a.b` which refers to a different path.
            assert.ok(
                !query.match(/e\.properties\.\$feature\.a\.b/),
                `BUG: raw identifier interpolation exposes path-injection. Got: ${query}`,
            );
        });

        test('getEventVolumes uses doubled-quote escaping (NOT backslash) — historical bug', async () => {
            // This is the explicit regression test for the historical bug where
            // getEventVolumes used `\\'` instead of escapeHogQLString.
            fetchMock.queue({ status: 200, body: { results: [] } });
            const service = new PostHogService(makeAuthStub());

            await service.getEventVolumes(123, ["it's"]);

            const query = getHogQL(fetchMock.calls[0]);
            assert.ok(
                query.includes("'it''s'"),
                `BUG REGRESSION: Expected doubled-quote escaping 'it''s', got: ${query}`,
            );
            assert.ok(
                !query.includes("\\'"),
                `BUG REGRESSION: Must NOT use backslash escaping, got: ${query}`,
            );
        });
    });

    // ========================================================================
    // 2. Network error handling
    // ========================================================================
    suite('Network error handling', () => {

        test('throws PostHogApiError(0, "Unable to reach...") on fetch network error', async () => {
            fetchMock.queue(new Error('ECONNREFUSED 127.0.0.1:443'));
            const service = new PostHogService(makeAuthStub());

            await assert.rejects(
                () => service.getProjects(),
                (err: unknown) => {
                    assert.ok(err instanceof PostHogApiError, `expected PostHogApiError, got: ${err}`);
                    assert.strictEqual(err.statusCode, 0, 'statusCode should be 0 for network errors');
                    assert.ok(
                        err.message.includes(TEST_HOST),
                        `error message should include host. Got: ${err.message}`,
                    );
                    assert.ok(
                        err.message.includes('Unable to reach PostHog'),
                        `error message should include 'Unable to reach PostHog'. Got: ${err.message}`,
                    );
                    assert.ok(
                        err.message.includes('ECONNREFUSED'),
                        `error message should include underlying message. Got: ${err.message}`,
                    );
                    return true;
                },
            );
        });

        test('network error includes host with trailing slashes stripped', async () => {
            fetchMock.queue(new Error('boom'));
            const service = new PostHogService(makeAuthStub({ host: 'https://eu.posthog.example.com///' }));

            await assert.rejects(
                () => service.getProjects(),
                (err: unknown) => {
                    assert.ok(err instanceof PostHogApiError);
                    assert.strictEqual(err.statusCode, 0);
                    assert.ok(
                        err.message.includes('https://eu.posthog.example.com'),
                        `expected normalized host. Got: ${err.message}`,
                    );
                    assert.ok(
                        !err.message.includes('example.com//'),
                        `trailing slashes should be stripped. Got: ${err.message}`,
                    );
                    return true;
                },
            );
        });

        test('network error from non-Error throwable still produces PostHogApiError', async () => {
            // Simulate a non-Error throwable. Our mock only supports Error, so we
            // monkey-patch fetch directly for this case.
            // eslint-disable-next-line no-throw-literal
            globalThis.fetch = (async () => { throw 'string error'; }) as typeof fetch;
            const service = new PostHogService(makeAuthStub());

            await assert.rejects(
                () => service.getProjects(),
                (err: unknown) => {
                    assert.ok(err instanceof PostHogApiError);
                    assert.strictEqual(err.statusCode, 0);
                    assert.ok(err.message.includes('Network error'), `Got: ${err.message}`);
                    return true;
                },
            );
        });
    });

    // ========================================================================
    // 3. HTTP error handling
    // ========================================================================
    suite('HTTP error handling', () => {

        test('500 produces PostHogApiError with statusCode 500', async () => {
            fetchMock.queue({ status: 500, body: 'Internal Server Error' });
            const service = new PostHogService(makeAuthStub());

            await assert.rejects(
                () => service.getProjects(),
                (err: unknown) => {
                    assert.ok(err instanceof PostHogApiError);
                    assert.strictEqual(err.statusCode, 500);
                    return true;
                },
            );
        });

        test('403 produces PostHogApiError with statusCode 403', async () => {
            fetchMock.queue({ status: 403, body: { detail: 'Forbidden' } });
            const service = new PostHogService(makeAuthStub());

            await assert.rejects(
                () => service.getProjects(),
                (err: unknown) => {
                    assert.ok(err instanceof PostHogApiError);
                    assert.strictEqual(err.statusCode, 403);
                    return true;
                },
            );
        });

        test('404 produces PostHogApiError with statusCode 404', async () => {
            fetchMock.queue({ status: 404, body: 'Not found' });
            const service = new PostHogService(makeAuthStub());

            await assert.rejects(
                () => service.getProject(999),
                (err: unknown) => {
                    assert.ok(err instanceof PostHogApiError);
                    assert.strictEqual(err.statusCode, 404);
                    return true;
                },
            );
        });

        test('401 triggers token refresh and retries once', async () => {
            // First call returns 401, refreshed call returns 200.
            fetchMock.queue({ status: 401, body: 'Unauthorized' });
            fetchMock.queue({ status: 200, body: { results: [{ id: 1, name: 'Proj' }] } });

            let refreshCalled = false;
            const auth = makeAuthStub({
                forceRefreshToken: async () => {
                    refreshCalled = true;
                    return 'new-token';
                },
            });
            const service = new PostHogService(auth);

            const projects = await service.getProjects();

            assert.strictEqual(refreshCalled, true, 'forceRefreshToken should have been called');
            assert.strictEqual(fetchMock.calls.length, 2, 'fetch should have been retried');
            assert.strictEqual(projects.length, 1);

            // Verify the retry used the new token
            const retryCall = fetchMock.calls[1];
            const auth1 = (retryCall.init?.headers as Record<string, string>)['Authorization'];
            assert.strictEqual(auth1, 'Bearer new-token');
        });

        test('401 with failed refresh produces PostHogApiError(401)', async () => {
            fetchMock.queue({ status: 401, body: 'Unauthorized' });
            const auth = makeAuthStub({
                forceRefreshToken: async () => { throw new Error('refresh failed'); },
            });
            const service = new PostHogService(auth);

            await assert.rejects(
                () => service.getProjects(),
                (err: unknown) => {
                    assert.ok(err instanceof PostHogApiError);
                    assert.strictEqual(err.statusCode, 401);
                    return true;
                },
            );
        });

        test('not authenticated (no access token) throws PostHogApiError(401)', async () => {
            const auth = makeAuthStub({ accessToken: undefined });
            const service = new PostHogService(auth);

            await assert.rejects(
                () => service.getProjects(),
                (err: unknown) => {
                    assert.ok(err instanceof PostHogApiError);
                    assert.strictEqual(err.statusCode, 401);
                    assert.ok(err.message.includes('Not authenticated'));
                    return true;
                },
            );
            assert.strictEqual(fetchMock.calls.length, 0, 'should not call fetch when not authenticated');
        });

        test('checkPermissions returns canWrite:false on 403', async () => {
            fetchMock.queue({ status: 403, body: 'Forbidden' });
            const service = new PostHogService(makeAuthStub());
            const result = await service.checkPermissions(123);
            assert.deepStrictEqual(result, { canWrite: false });
        });

        test('checkPermissions returns canWrite:true on 200', async () => {
            fetchMock.queue({ status: 200, body: { id: 123, name: 'Proj' } });
            const service = new PostHogService(makeAuthStub());
            const result = await service.checkPermissions(123);
            assert.deepStrictEqual(result, { canWrite: true });
        });

        test('getCurrentUserEmail returns null on error (does not throw)', async () => {
            fetchMock.queue({ status: 500, body: 'oops' });
            const service = new PostHogService(makeAuthStub());
            const email = await service.getCurrentUserEmail();
            assert.strictEqual(email, null);
        });

        test('getEventVolumes silently swallows API errors and returns empty Map', async () => {
            fetchMock.queue({ status: 500, body: 'oops' });
            const service = new PostHogService(makeAuthStub());
            const result = await service.getEventVolumes(123, ['ev']);
            assert.strictEqual(result.size, 0);
        });
    });

    // ========================================================================
    // 4. Pagination handling
    // ========================================================================
    suite('Pagination handling', () => {

        test('getFeatureFlags merges multiple pages', async () => {
            fetchMock.queue({
                status: 200,
                body: {
                    count: 3,
                    next: `${TEST_HOST}/api/projects/123/feature_flags/?limit=100&offset=100`,
                    previous: null,
                    results: [
                        { id: 1, key: 'a', name: 'A', active: true, filters: {}, rollout_percentage: null, created_at: '2024', created_by: null, deleted: false },
                        { id: 2, key: 'b', name: 'B', active: true, filters: {}, rollout_percentage: null, created_at: '2024', created_by: null, deleted: false },
                    ],
                },
            });
            fetchMock.queue({
                status: 200,
                body: {
                    count: 3,
                    next: null,
                    previous: null,
                    results: [
                        { id: 3, key: 'c', name: 'C', active: true, filters: {}, rollout_percentage: null, created_at: '2024', created_by: null, deleted: false },
                    ],
                },
            });

            const service = new PostHogService(makeAuthStub());
            const flags = await service.getFeatureFlags(123);

            assert.strictEqual(fetchMock.calls.length, 2, 'should have made two paginated calls');
            assert.strictEqual(flags.length, 3);
            assert.deepStrictEqual(flags.map(f => f.key), ['a', 'b', 'c']);

            // First call hits the initial path
            assert.ok(fetchMock.calls[0].url.endsWith('/api/projects/123/feature_flags/?limit=100'));
            // Second call follows the pathname+search from `next`
            assert.ok(fetchMock.calls[1].url.endsWith('/api/projects/123/feature_flags/?limit=100&offset=100'));
        });

        test('getFeatureFlags onProgress callback is invoked for each page', async () => {
            fetchMock.queue({
                status: 200,
                body: {
                    count: 2,
                    next: `${TEST_HOST}/api/projects/123/feature_flags/?limit=100&offset=100`,
                    previous: null,
                    results: [
                        { id: 1, key: 'a', name: 'A', active: true, filters: {}, rollout_percentage: null, created_at: '2024', created_by: null, deleted: false },
                    ],
                },
            });
            fetchMock.queue({
                status: 200,
                body: {
                    count: 2,
                    next: null,
                    previous: null,
                    results: [
                        { id: 2, key: 'b', name: 'B', active: true, filters: {}, rollout_percentage: null, created_at: '2024', created_by: null, deleted: false },
                    ],
                },
            });

            const service = new PostHogService(makeAuthStub());
            const progressCalls: Array<{ loaded: number; total: number | null }> = [];
            await service.getFeatureFlags(123, (loaded, total) => {
                progressCalls.push({ loaded: loaded.length, total });
            });

            assert.strictEqual(progressCalls.length, 2);
            assert.deepStrictEqual(progressCalls[0], { loaded: 1, total: 2 });
            assert.deepStrictEqual(progressCalls[1], { loaded: 2, total: 2 });
        });

        test('getEventDefinitions merges paginated results', async () => {
            fetchMock.queue({
                status: 200,
                body: {
                    count: 2,
                    next: `${TEST_HOST}/api/projects/55/event_definitions/?limit=100&offset=100`,
                    previous: null,
                    results: [{ id: '1', name: 'event_one', description: null, tags: [], last_seen_at: null, verified: false, hidden: false }],
                },
            });
            fetchMock.queue({
                status: 200,
                body: {
                    count: 2,
                    next: null,
                    previous: null,
                    results: [{ id: '2', name: 'event_two', description: null, tags: [], last_seen_at: null, verified: false, hidden: false }],
                },
            });

            const service = new PostHogService(makeAuthStub());
            const events = await service.getEventDefinitions(55);

            assert.strictEqual(fetchMock.calls.length, 2);
            assert.strictEqual(events.length, 2);
            assert.deepStrictEqual(events.map(e => e.name), ['event_one', 'event_two']);
        });
    });

    // ========================================================================
    // 5. Project ID interpolation in URLs
    // ========================================================================
    suite('URL interpolation', () => {

        test('getProject builds /api/projects/{id}/ URL', async () => {
            fetchMock.queue({ status: 200, body: { id: 42, name: 'X' } });
            const service = new PostHogService(makeAuthStub());

            await service.getProject(42);

            assert.strictEqual(fetchMock.calls.length, 1);
            assert.strictEqual(fetchMock.calls[0].url, `${TEST_HOST}/api/projects/42/`);
        });

        test('getFeatureFlagsPage uses provided projectId in initial URL', async () => {
            fetchMock.queue({
                status: 200,
                body: { count: 0, next: null, previous: null, results: [] },
            });
            const service = new PostHogService(makeAuthStub());

            await service.getFeatureFlagsPage(7);

            assert.strictEqual(fetchMock.calls[0].url, `${TEST_HOST}/api/projects/7/feature_flags/?limit=100`);
        });

        test('getEventVolumes uses /api/environments/{id}/query/ endpoint', async () => {
            fetchMock.queue({ status: 200, body: { results: [] } });
            const service = new PostHogService(makeAuthStub());

            await service.getEventVolumes(99, ['ev']);

            assert.strictEqual(fetchMock.calls[0].url, `${TEST_HOST}/api/environments/99/query/`);
        });

        test('getSessionCounts uses /api/environments/{id}/query/ endpoint', async () => {
            fetchMock.queue({ status: 200, body: { results: [] } });
            const service = new PostHogService(makeAuthStub());

            await service.getSessionCounts(123, ['ev'], []);

            assert.strictEqual(fetchMock.calls[0].url, `${TEST_HOST}/api/environments/123/query/`);
        });

        test('createFeatureFlag posts to /api/projects/{id}/feature_flags/ with body', async () => {
            fetchMock.queue({ status: 201, body: { id: 1, key: 'new', name: 'new', active: false, filters: {}, rollout_percentage: null, created_at: '2024', created_by: null, deleted: false } });
            const service = new PostHogService(makeAuthStub());

            await service.createFeatureFlag(15, 'new-flag', 'New Flag', true);

            assert.strictEqual(fetchMock.calls.length, 1);
            assert.strictEqual(fetchMock.calls[0].url, `${TEST_HOST}/api/projects/15/feature_flags/`);
            assert.strictEqual(fetchMock.calls[0].init?.method, 'POST');
            const body = JSON.parse(fetchMock.calls[0].init!.body as string);
            assert.strictEqual(body.key, 'new-flag');
            assert.strictEqual(body.name, 'New Flag');
            assert.strictEqual(body.active, true);
        });

        test('updateFeatureFlag PATCHes /api/projects/{id}/feature_flags/{flagId}/', async () => {
            fetchMock.queue({ status: 200, body: { id: 5, key: 'k', name: 'k', active: false, filters: {}, rollout_percentage: null, created_at: '2024', created_by: null, deleted: false } });
            const service = new PostHogService(makeAuthStub());

            await service.updateFeatureFlag(15, 5, { active: false });

            assert.strictEqual(fetchMock.calls[0].url, `${TEST_HOST}/api/projects/15/feature_flags/5/`);
            assert.strictEqual(fetchMock.calls[0].init?.method, 'PATCH');
        });

        test('Authorization header is set with Bearer token', async () => {
            fetchMock.queue({ status: 200, body: { count: 0, next: null, previous: null, results: [] } });
            const service = new PostHogService(makeAuthStub());

            await service.getProjects();

            const headers = fetchMock.calls[0].init?.headers as Record<string, string>;
            assert.strictEqual(headers['Authorization'], `Bearer ${TEST_TOKEN}`);
            assert.strictEqual(headers['Content-Type'], 'application/json');
        });

        test('host trailing slashes are stripped from request URL', async () => {
            fetchMock.queue({ status: 200, body: { id: 1, name: 'P' } });
            const service = new PostHogService(makeAuthStub({ host: 'https://eu.posthog.example.com///' }));

            await service.getProject(1);

            assert.strictEqual(fetchMock.calls[0].url, 'https://eu.posthog.example.com/api/projects/1/');
        });

        test('getEventProperties URL-encodes the event name in query string', async () => {
            fetchMock.queue({ status: 200, body: { count: 0, next: null, previous: null, results: [] } });
            const service = new PostHogService(makeAuthStub());

            await service.getEventProperties(123, "weird name");

            const url = fetchMock.calls[0].url;
            assert.ok(url.startsWith(`${TEST_HOST}/api/projects/123/property_definitions/`), `unexpected url: ${url}`);
            assert.ok(url.includes(encodeURIComponent(JSON.stringify(['weird name']))), `expected encoded event name in: ${url}`);
        });
    });
});
