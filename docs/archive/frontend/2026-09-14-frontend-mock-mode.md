# Frontend Mock Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **House rules that override any skill:** never run `git add` / `git commit` / `git push`. Run unit tests only. Each task ends with a "Hand off" step: list the changed files and a suggested commit message.

**Goal:** Let `frontend/` run standalone with `npm run dev:mock` so every page renders realistic data and every interaction works, with no backend, no SQL Server and no RFID readers running.

**Architecture:** All 34 HTTP call sites (32 method + path pairs) go through the single axios instance in `src/config/instance.js`. In mock mode, that instance gets a local **adapter**. The adapter matches each request against a route table, runs an in-memory handler, and resolves or rejects the same way the real server would. No page component changes, and no new runtime dependency. Mock code lives under `src/mocks/`. It is loaded with `require()` inside an inline `process.env` check, so a normal build drops it.

**Tech Stack:** React 19.2.7, react-scripts 5.0.1 (CRA, jest 27), react-router-dom 7.11, axios 1.19.0 (installed), Tailwind 3.4, sweetalert2. Tests: jest + @testing-library via `react-scripts test`.

**Spec:** No separate spec document. The requirements are in "Spec (inlined)" below. Decisions were confirmed with the requester on 2026-09-14 and reviewed on 2026-09-29.

## Progress

| Task | Status | Notes |
|---|---|---|
| 1. Latency config + `dev:mock` script | [x] | `mocks/config.js`, `package.json:25` |
| 2. Route matcher | [x] | `mocks/router.js` |
| 3. Mock axios adapter | [x] | `mocks/adapter.js`, jest axios mapper `package.json:29-33` |
| 4. In-memory store + fixtures | [x] | `mocks/db.js`, `mocks/time.js`, `mocks/fixtures/*` |
| 5. Auth handlers + session seed | [x] | `handlers/auth.js`, `mocks/session.js` |
| 6. Lot / process-flow handlers | [x] | `handlers/lots.js` |
| 7. Dashboard handlers | [x] | `handlers/dashboard.js` |
| 8. Clear-tag history + mock-done handlers | [x] | `handlers/clearTag.js` |
| 9. Admin handlers (status, process, readers) | [x] | `handlers/admin.js` |
| 10. Route table + `installMockMode` | [x] | `handlers/index.js`, `mocks/index.js` |
| 11. Wire into `instance.js` + bundle check + runbook | [x] | `config/instance.js:11` (NODE_ENV guard, option A), `.env.example`, runbook |
| 12. Sidebar nav entries (real, not mock-only) | [x] | `Layout/Sidebar.js` |
| 13. Bruno collection into the repo + missing requests + example responses | [x] | `bruno/AYT-RFID/` (33 requests) |

## Spec (inlined)

1. Run the whole frontend without the backend, to demo every page to users.
2. Interception method: **custom axios adapter** on `backendApi`, not MSW and not a local JSON server.
3. Auth: **auto-login as a mock admin** on boot in mock mode. Then `RegisterSingle` (route `assembly/register`), `Management` and `ClearTag` open without a login step. The real login flow stays intact, and `/login` is mocked too, so signing out and back in also works.
4. Target: **dev server only**, via `npm run dev:mock`. No static/offline build, no router changes.
5. Every route in `src/App.js` must be reachable and populated, including the two `ScanTag` routes and `reader-config`.
6. Mutations must feel real. Registering a tag, scanning, clearing a tag and CRUD in Management all change the in-memory store, and the change shows on the Dashboard.
7. The sidebar links to every route in `src/App.js` in **all** modes, not only mock mode (decided 2026-09-29).

## Deviation from the global mock-mode standard

The global standard is MSW with mock data built from Bruno example responses. This project uses an axios adapter instead. Reasons:

- Every call already goes through one `backendApi` instance, so the adapter covers 100% of traffic with zero page changes.
- No runtime dependency is added. MSW 2 under CRA 5 / jest 27 also needs `TextEncoder` / stream polyfills and a service worker in `public/`.
- The Bruno collection (`AYT-RFID`) lives outside the repo, covers 17 of the 32 endpoints, and has no saved example responses. So "built from Bruno examples" is not possible yet. The response shapes in this plan come from the page code and `backend/services/*.js`. When the collection has example responses, check the fixtures in `src/mocks/fixtures/` against them.

The script name still follows the standard: `dev:mock`.

## Global Constraints

- No edits to any file under `src/pages/`. Pages must stay byte-identical.
- Files touched outside `src/mocks/`: `src/config/instance.js` (one guarded block), `frontend/.env.example` (new), `frontend/package.json` (script, jest mapper), `src/components/Layout/Sidebar.js` (real nav entries, Task 12), `src/App.test.js` (deleted). Nothing else.
- In `instance.js`, the mock branch must be `if (process.env.NODE_ENV !== 'production' && process.env.REACT_APP_MOCK === 'true') { require('../mocks')... }`. Do not use a static `import`, and do not use a constant imported from another module. Only this form lets the minifier drop the mocks tree.
- (Changed during execution, user decision, option A.) The `NODE_ENV` check makes the drop independent of any env file: `NODE_ENV` is always defined in a build, while `REACT_APP_MOCK` is not when `.env` is missing (`.env` is git-ignored). `frontend/.env.example` (committed) documents the variables; the developer copies it to `.env`. The `dev:mock` script sets `REACT_APP_MOCK=true` through `cross-env`, because dotenv never overrides a variable that is already set.
- No new runtime dependency. `cross-env@^7.0.3` is already in devDependencies.
- Mock route paths match **what the frontend calls**, not `backend/routes/assembly.js`. They differ: `ScanTag` posts to `/gr_f1` and `/mc_f1`, while the backend exposes `/gauging-room-f1` and `/mc-gauging-f1`.
- The API base URL stays `http://localhost:5001/api/assembly` (`src/config/constance.js`). The adapter strips it.
- The handler contract is fixed: `({ params, query, body }) => ({ status?: number, data: any })`, sync or async. `status` defaults to 200. `params` values are **strings**. Store ids are **numbers**, so compare with `Number(params.id)`.
- Handler behaviour mirrors the real API, **including its quirks** (see "Known limitations"). Business rule failures return HTTP 200 with `{ result: '<CODE>' }`, exactly like the stored procedures. Only lookups (`/lot/*`, `/lot-by-*`) and `/login` use 404 / 401.
- Timestamps in the store are "wall-clock" strings, `YYYY-MM-DDTHH:mm:ss.000Z` built from **local** date parts. This is how the real API serialises SQL Server `DATETIME`, and the pages print the digits as they are.
- Fixture data is fake only. Emp ids use the `MOCK###` pattern, lot numbers `DEMO######`, reader IPs are in `192.0.2.0/24` (the documentation range).
- Thai UI copy is untouched.
- Run all commands in `frontend/`. Test command: `npm test -- --watchAll=false --testPathPattern=<pattern>`. There is no lint script, so `npm run build` is the lint gate.

## Review Focus

Things the spec implies but a page-level test would not catch. Each one has a pinned test in the task named.

1. **Default "today" filters.** Dashboard Detail and Clear Tag History both open filtered to today. The seed must contain rows dated today, or a demo opens on "No data". Pinned in Task 4 (`db.test.js`), Task 7, and Task 8.
2. **Out-of-order scan.** Scanning a tag at MC F1 before GR F1 must return `INVALID_PROCESS`, not succeed. Pinned in Task 6.
3. **String route ids vs numeric store ids.** `PUT /status/2` must update id `2`. Pinned in Tasks 5 and 9.
4. **Unmocked endpoint.** A new page call with no handler must fail fast with a 404 and a `console.warn`. It must not hang or return `undefined`. Pinned in Task 3. Drift is also caught by the coverage test in Task 10.
5. **Tag reuse after clear.** A tag from a completed lot can be registered again (the SP only checks tags on active lots). Pinned in Task 6.

## Known limitations (mirrored from the real API; pages must not change)

| Behaviour in mock mode | Cause in real code |
|---|---|
| Editing a user always warns "กรอกข้อมูลให้ครบ" | `UserTab.js:47` copies `u.password` into the form, but `GET /login/users` never returns the password |
| A wrong password shows "ไม่สามารถเชื่อมต่อได้" | `/login` returns 401, and `LoginModal.js:26` treats every error as a connection error |
| Editing a status unlinks it from its process | `StatusTab.js:31` does not send `process_id`, and `updateStatus` writes `NULL` |
| Clear Tag succeeds only for lots at MC Gauging F1 | `Stored_tb_assy_completed` requires `status_id = 3`. The Process dropdown only feeds the remark |
| The store resets on every page reload | In-memory by design |
| Between 00:00 and 07:00 local time, the "today" filters show yesterday | The pages build "today" with `toISOString()` (UTC) |

## File Structure

| File | Responsibility |
|---|---|
| `src/mocks/config.js` | `MOCK_LATENCY_MS` from CRA env |
| `src/mocks/router.js` | Pure path matching: `normalizePath`, `matchRoute` |
| `src/mocks/adapter.js` | `createMockAdapter(routes, latency)`: axios adapter, response/error shaping |
| `src/mocks/time.js` | `toWallClock(date)`, `daysAgo(today, days, hours, minutes)` |
| `src/mocks/db.js` | `createDb({ now })` returns a fresh mutable store; `nextId(rows)` |
| `src/mocks/fixtures/master.js` | Process + status seed |
| `src/mocks/fixtures/users.js` | Fake users |
| `src/mocks/fixtures/lots.js` | AS400 catalog + registered lots |
| `src/mocks/fixtures/mockDone.js` | Mock-done seed |
| `src/mocks/fixtures/readers.js` | Reader config seed |
| `src/mocks/testUtils.js` | `FIXED_NOW`, `createTestDb()`, `callRoute()`. Test helper, never imported by the app |
| `src/mocks/session.js` | `seedMockSession(users)`: auto-login admin into `sessionStorage` |
| `src/mocks/handlers/auth.js` | `authRoutes(db)`: `/login`, `/login/users` CRUD |
| `src/mocks/handlers/lots.js` | `lotRoutes(db)`: `/lot/:lot_no`, `/lot-by-*`, `/register-tag`, `/gr_f1`, `/mc_f1`, `/completed` |
| `src/mocks/handlers/dashboard.js` | `dashboardRoutes(db)`: `/dashboard`, `/dashboard/*` |
| `src/mocks/handlers/clearTag.js` | `clearTagRoutes(db)`: `/clear-tag/history`, `/mock-done` CRUD |
| `src/mocks/handlers/admin.js` | `adminRoutes(db)`: `/status` CRUD, `/process` CRUD, `/readers-*` |
| `src/mocks/handlers/index.js` | `createRoutes(db)`: the concatenated route table |
| `src/mocks/index.js` | `installMockMode(api)`: builds db + routes, installs the adapter, seeds the session |

Handlers are factories that take `db` (dependency injection). Tests build a fresh store per test with `createTestDb()`, so no global reset is needed.

---

### Task 1: Latency config + `dev:mock` script

**Files:**
- Create: `frontend/src/mocks/config.js`
- Create: `frontend/src/mocks/config.test.js`
- Modify: `frontend/package.json` (scripts)
- Delete: `frontend/src/App.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `MOCK_LATENCY_MS: number` (named export) from `src/mocks/config.js`.

- [x] **Step 1: Verify dependencies**

`node_modules/` and `cross-env` are already installed (uncommitted `package.json` diff).

```powershell
npm ls cross-env
```
Expected: `cross-env@7.x`. If it is missing, run `npm install --save-dev cross-env@^7.0.3`.

- [x] **Step 2: Write the failing test**

Create `frontend/src/mocks/config.test.js`:

```js
const restoreEnv = (key, value) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
};

describe('mock config', () => {
    const ORIGINAL_LATENCY = process.env.REACT_APP_MOCK_LATENCY;

    afterEach(() => {
        restoreEnv('REACT_APP_MOCK_LATENCY', ORIGINAL_LATENCY);
        jest.resetModules();
    });

    test('MOCK_LATENCY_MS defaults to 250', () => {
        delete process.env.REACT_APP_MOCK_LATENCY;
        jest.resetModules();
        expect(require('./config').MOCK_LATENCY_MS).toBe(250);
    });

    test('MOCK_LATENCY_MS reads REACT_APP_MOCK_LATENCY, including 0', () => {
        process.env.REACT_APP_MOCK_LATENCY = '0';
        jest.resetModules();
        expect(require('./config').MOCK_LATENCY_MS).toBe(0);
    });
});
```

- [x] **Step 3: Run the test to verify it fails**

Run: `npm test -- --watchAll=false --testPathPattern=mocks/config`
Expected: FAIL with `Cannot find module './config'`.

- [x] **Step 4: Write the implementation**

Create `frontend/src/mocks/config.js`:

```js
export const MOCK_LATENCY_MS = process.env.REACT_APP_MOCK_LATENCY === undefined
    ? 250
    : Number(process.env.REACT_APP_MOCK_LATENCY);
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npm test -- --watchAll=false --testPathPattern=mocks/config`
Expected: PASS, 2 tests.

- [x] **Step 6: Add the mock start script**

In `frontend/package.json` `"scripts"`, keep the existing four and add:

```json
"dev:mock": "cross-env REACT_APP_MOCK=true react-scripts start"
```

- [x] **Step 7: Delete the stale CRA boilerplate test**

`src/App.test.js` is the unchanged CRA sample. It looks for a "learn react" link that this app never renders, so it always fails and would hide real failures.

```powershell
Remove-Item src/App.test.js
```

- [x] **Step 8: Verify the whole suite is green**

Run: `npm test -- --watchAll=false`
Expected: PASS, 1 suite, 2 tests.

- [x] **Step 9: Hand off**

Changed: `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/mocks/config.js`, `frontend/src/mocks/config.test.js`. Deleted: `frontend/src/App.test.js`.
Suggested message: `chore(frontend): add mock latency config and dev:mock script`

---

### Task 2: Route matcher

**Files:**
- Create: `frontend/src/mocks/router.js`
- Create: `frontend/src/mocks/router.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `normalizePath(url: string, baseURL?: string) => string`: strips `baseURL`, the query string and a trailing slash; the result always starts with `/`.
  - `matchRoute(routes: Route[], method: string, path: string) => { handler, params } | null`. It returns the **first** match, so list static routes before param routes of the same shape. It returns `null` if a param cannot be URL-decoded.
  - `Route = { method: 'GET'|'POST'|'PUT'|'DELETE', path: string, handler: Function }`, where `path` may contain `:name` segments.

- [x] **Step 1: Write the failing test**

Create `frontend/src/mocks/router.test.js`:

```js
import { normalizePath, matchRoute } from './router';

const handler = () => ({ data: 'ok' });
const routes = [
    { method: 'GET', path: '/status', handler },
    { method: 'GET', path: '/lot-by-tag/:tag_id', handler },
    { method: 'PUT', path: '/login/users/:id', handler },
    { method: 'GET', path: '/dashboard/process-summary', handler },
];

describe('normalizePath', () => {
    test('strips the axios baseURL', () => {
        expect(normalizePath('/status', 'http://localhost:5001/api/assembly')).toBe('/status');
        expect(normalizePath('http://localhost:5001/api/assembly/status', 'http://localhost:5001/api/assembly'))
            .toBe('/status');
    });

    test('strips the query string', () => {
        expect(normalizePath('/dashboard/history?date_from=2026-09-14', '')).toBe('/dashboard/history');
    });

    test('strips a trailing slash but keeps root', () => {
        expect(normalizePath('/status/', '')).toBe('/status');
        expect(normalizePath('/', '')).toBe('/');
    });

    test('adds a leading slash', () => {
        expect(normalizePath('status', '')).toBe('/status');
    });
});

describe('matchRoute', () => {
    test('matches a static path', () => {
        expect(matchRoute(routes, 'GET', '/status')).toMatchObject({ params: {} });
    });

    test('extracts named params', () => {
        expect(matchRoute(routes, 'GET', '/lot-by-tag/E2801160').params).toEqual({ tag_id: 'E2801160' });
        expect(matchRoute(routes, 'PUT', '/login/users/7').params).toEqual({ id: '7' });
    });

    test('is method-sensitive', () => {
        expect(matchRoute(routes, 'POST', '/status')).toBeNull();
    });

    test('accepts a lowercase method', () => {
        expect(matchRoute(routes, 'get', '/status')).not.toBeNull();
    });

    test('does not let a param segment swallow a slash', () => {
        expect(matchRoute(routes, 'GET', '/lot-by-tag/AB/CD')).toBeNull();
    });

    test('matches a multi-segment static path', () => {
        expect(matchRoute(routes, 'GET', '/dashboard/process-summary')).not.toBeNull();
    });

    test('returns null for an unknown path', () => {
        expect(matchRoute(routes, 'GET', '/nope')).toBeNull();
    });

    test('url-decodes params', () => {
        expect(matchRoute(routes, 'GET', '/lot-by-tag/A%2F1').params).toEqual({ tag_id: 'A/1' });
    });

    test('returns null instead of throwing on a malformed escape', () => {
        expect(matchRoute(routes, 'GET', '/lot-by-tag/50%')).toBeNull();
    });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- --watchAll=false --testPathPattern=mocks/router`
Expected: FAIL with `Cannot find module './router'`.

- [x] **Step 3: Write the implementation**

Create `frontend/src/mocks/router.js`:

```js
const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;

const toPattern = (path) => {
    const names = [];
    const source = path
        .split('/')
        .map((segment) => {
            if (!segment.startsWith(':')) return segment.replace(ESCAPE_RE, '\\$&');
            names.push(segment.slice(1));
            return '([^/]+)';
        })
        .join('/');
    return { regex: new RegExp(`^${source}$`), names };
};

// Pages build URLs from raw scanner input, so a lone '%' can reach us.
const safeDecode = (value) => {
    try { return decodeURIComponent(value); }
    catch { return null; }
};

export const normalizePath = (url = '', baseURL = '') => {
    let path = url;
    if (baseURL && path.startsWith(baseURL)) path = path.slice(baseURL.length);
    path = path.split('?')[0];
    if (!path.startsWith('/')) path = `/${path}`;
    return path.length > 1 ? path.replace(/\/+$/, '') : path;
};

export const matchRoute = (routes, method, path) => {
    const wanted = String(method).toUpperCase();
    for (const route of routes) {
        if (route.method !== wanted) continue;
        const { regex, names } = toPattern(route.path);
        const matched = regex.exec(path);
        if (!matched) continue;
        const values = matched.slice(1).map(safeDecode);
        if (values.includes(null)) continue;
        const params = Object.fromEntries(names.map((name, i) => [name, values[i]]));
        return { handler: route.handler, params };
    }
    return null;
};
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npm test -- --watchAll=false --testPathPattern=mocks/router`
Expected: PASS, 13 tests.

- [x] **Step 5: Hand off**

Changed: `frontend/src/mocks/router.js`, `frontend/src/mocks/router.test.js`.
Suggested message: `feat(frontend): add mock route matcher`

---

### Task 3: Mock axios adapter

**Files:**
- Create: `frontend/src/mocks/adapter.js`
- Create: `frontend/src/mocks/adapter.test.js`
- Modify: `frontend/package.json` (add a `"jest"` block)

**Interfaces:**
- Consumes: `normalizePath`, `matchRoute` from `./router` (Task 2).
- Produces: `createMockAdapter(routes: Route[], latencyMs = 0) => (config) => Promise<AxiosResponse>`. It resolves when `config.validateStatus(status)` is true. Otherwise it rejects with an `AxiosError` whose `.response` holds `{ status, data }`, like a real server error. An unmatched request gives a 404 `{ error: 'NO_MOCK', message }` and a `console.warn`.

- [x] **Step 1: Map axios to its CommonJS build for jest**

axios 1.x ships ES modules, and CRA's jest 27 does not transform `node_modules`. Without this mapping, the test fails with `Cannot use import statement outside a module`. Add this top-level key to `frontend/package.json` (CRA allows `moduleNameMapper` overrides):

```json
"jest": {
  "moduleNameMapper": {
    "^axios$": "axios/dist/node/axios.cjs"
  }
}
```

This only affects jest. The browser build still resolves axios through its `browser` field.

- [x] **Step 2: Write the failing test**

Create `frontend/src/mocks/adapter.test.js`:

```js
import axios from 'axios';
import { createMockAdapter } from './adapter';

const BASE = 'http://localhost:5001/api/assembly';

const makeApi = (routes) => {
    const api = axios.create({ baseURL: BASE, headers: { 'Content-Type': 'application/json' } });
    api.defaults.adapter = createMockAdapter(routes, 0);
    return api;
};

describe('createMockAdapter', () => {
    test('resolves with the handler data and status 200 by default', async () => {
        const api = makeApi([{ method: 'GET', path: '/status', handler: () => ({ data: [{ id: 1 }] }) }]);
        const res = await api.get('/status');
        expect(res.status).toBe(200);
        expect(res.data).toEqual([{ id: 1 }]);
    });

    test('passes path params, query params and the parsed JSON body', async () => {
        const handler = jest.fn(() => ({ data: { result: 'OK' } }));
        const api = makeApi([{ method: 'PUT', path: '/status/:id', handler }]);
        await api.put('/status/7', { label_status: 'X' }, { params: { date_from: '2026-09-29' } });
        expect(handler).toHaveBeenCalledWith({
            params: { id: '7' },
            query: { date_from: '2026-09-29' },
            body: { label_status: 'X' },
        });
    });

    test('passes an empty query and body when none are sent', async () => {
        const handler = jest.fn(() => ({ data: [] }));
        const api = makeApi([{ method: 'GET', path: '/mock-done', handler }]);
        await api.get('/mock-done');
        expect(handler).toHaveBeenCalledWith({ params: {}, query: {}, body: {} });
    });

    test('supports async handlers', async () => {
        const api = makeApi([{ method: 'GET', path: '/status', handler: async () => ({ data: 'late' }) }]);
        expect((await api.get('/status')).data).toBe('late');
    });

    test('rejects like axios for a 4xx status, with the response attached', async () => {
        const api = makeApi([{
            method: 'GET', path: '/lot/:lot_no',
            handler: () => ({ status: 404, data: { error: 'LOT_NOT_FOUND' } }),
        }]);
        await expect(api.get('/lot/NOPE')).rejects.toMatchObject({
            isAxiosError: true,
            response: { status: 404, data: { error: 'LOT_NOT_FOUND' } },
        });
    });

    test('returns 404 and warns for an unmocked endpoint', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const api = makeApi([]);
        await expect(api.get('/nope')).rejects.toMatchObject({ response: { status: 404 } });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('GET /nope'));
        warn.mockRestore();
    });
});
```

- [x] **Step 3: Run the test to verify it fails**

Run: `npm test -- --watchAll=false --testPathPattern=mocks/adapter`
Expected: FAIL with `Cannot find module './adapter'`.

- [x] **Step 4: Write the implementation**

Create `frontend/src/mocks/adapter.js`:

```js
import { AxiosError } from 'axios';
import { normalizePath, matchRoute } from './router';

const parseBody = (data) => {
    if (typeof data === 'string' && data) return JSON.parse(data);
    return data ?? {};
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const notMocked = (method, path) => {
    const message = `[mock] No mock for ${method} ${path}`;
    console.warn(message);
    return { status: 404, data: { error: 'NO_MOCK', message } };
};

export const createMockAdapter = (routes, latencyMs = 0) => async (config) => {
    const method = config.method.toUpperCase();
    const path = normalizePath(config.url, config.baseURL);
    const match = matchRoute(routes, method, path);
    await wait(latencyMs);

    const { status = 200, data } = match
        ? await match.handler({ params: match.params, query: config.params ?? {}, body: parseBody(config.data) })
        : notMocked(method, path);

    const response = { data, status, statusText: String(status), headers: {}, config, request: {} };
    if (!config.validateStatus || config.validateStatus(status)) return response;
    throw new AxiosError(
        `Request failed with status code ${status}`,
        status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
        config,
        response.request,
        response,
    );
};
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npm test -- --watchAll=false --testPathPattern=mocks/adapter`
Expected: PASS, 6 tests.

- [x] **Step 6: Hand off**

Changed: `frontend/package.json`, `frontend/src/mocks/adapter.js`, `frontend/src/mocks/adapter.test.js`.
Suggested message: `feat(frontend): add mock axios adapter`

---

### Task 4: In-memory store + fixtures

**Files:**
- Create: `frontend/src/mocks/time.js`
- Create: `frontend/src/mocks/db.js`
- Create: `frontend/src/mocks/fixtures/master.js`, `users.js`, `lots.js`, `mockDone.js`, `readers.js`
- Create: `frontend/src/mocks/testUtils.js`
- Create: `frontend/src/mocks/db.test.js`

(9 small files. Fixtures are pure data, about 120 lines in total.)

**Interfaces:**
- Consumes: `matchRoute` from `./router` (Task 2), only in `testUtils.js`.
- Produces:
  - `toWallClock(date: Date) => string`, format `YYYY-MM-DDTHH:mm:ss.000Z` from local date parts.
  - `daysAgo(today: Date, days: number, hours: number, minutes = 0) => string` (a wall-clock string).
  - `createDb({ now?: () => Date }) => Db`, a fresh store on every call:
    ```
    Db = {
      now: () => string,                 // wall-clock string of the injected clock
      processes: { id, process_code, process_name }[],
      statuses:  { id, status, label_status, process_id }[],
      users:     { id, emp_id, eng_name, eng_surname, position, password }[],
      as400Lots: { lot_no, wos, brg_type, spec, qty }[],
      lots:      { lot_no, wos, brg_type, spec, qty, tag_id, status_id, location_name,
                   machine_no, emp_id, remark, cleared_at, created_at, updated_at }[],
      mockDone:  { id, lot_no, created_at }[],
      readerConfig: { type, location_name, enabled, ip, power }[],
    }
    ```
    `brg_type` / `spec` live on the lot. The real DB joins them from `tb_assy_wos`. The mock skips that table because no page can tell the difference.
  - `nextId(rows: { id: number }[]) => number`.
  - `testUtils.js`: `FIXED_NOW` (local `2026-09-29 10:00:00`), `createTestDb()`, `callRoute(routes, method, path, { query, body }) => Promise<{ status, data }>`.
  - Status ids: `1` bf_issue, `2` gr_f1, `3` mc_f1, `4` completed. The real stored procedures hard-code these ids.

- [x] **Step 1: Write the failing test**

Create `frontend/src/mocks/db.test.js`:

```js
import { createDb, nextId } from './db';
import { toWallClock, daysAgo } from './time';
import { FIXED_NOW, createTestDb } from './testUtils';

const TODAY = '2026-09-29';

describe('time helpers', () => {
    test('toWallClock prints local date parts with a Z suffix, like the real API', () => {
        expect(toWallClock(new Date(2026, 8, 29, 10, 5, 7))).toBe('2026-09-29T10:05:07.000Z');
    });

    test('daysAgo counts calendar days back from today', () => {
        expect(daysAgo(FIXED_NOW, 1, 8, 30)).toBe('2026-09-28T08:30:00.000Z');
    });
});

describe('createDb', () => {
    test('returns an independent store on every call', () => {
        const a = createTestDb();
        const b = createTestDb();
        a.lots.pop();
        expect(b.lots.length).toBe(a.lots.length + 1);
    });

    test('now() uses the injected clock', () => {
        expect(createDb({ now: () => FIXED_NOW }).now()).toBe('2026-09-29T10:00:00.000Z');
    });

    test('seeds active lots at every process step, created today', () => {
        const todays = createTestDb().lots.filter((l) => l.created_at.startsWith(TODAY));
        [1, 2, 3].forEach((statusId) => {
            expect(todays.some((l) => l.status_id === statusId)).toBe(true);
        });
    });

    test('seeds lots cleared today, for the Clear Tag history default filter', () => {
        const cleared = createTestDb().lots.filter((l) => l.status_id === 4);
        expect(cleared.some((l) => l.cleared_at.startsWith(TODAY))).toBe(true);
    });

    test('seeds more than one page (20 rows) of active lots', () => {
        expect(createTestDb().lots.filter((l) => l.status_id !== 4).length).toBeGreaterThan(20);
    });

    test('every registered lot exists in the AS400 catalog, and some catalog lots are unregistered', () => {
        const db = createTestDb();
        const registered = new Set(db.lots.map((l) => l.lot_no));
        db.lots.forEach((l) => expect(db.as400Lots.some((a) => a.lot_no === l.lot_no)).toBe(true));
        expect(db.as400Lots.some((a) => !registered.has(a.lot_no))).toBe(true);
    });

    test('status and process ids are numbers', () => {
        const db = createTestDb();
        [...db.statuses, ...db.processes, ...db.users].forEach((row) => expect(typeof row.id).toBe('number'));
    });

    test('seeds one admin user', () => {
        expect(createTestDb().users.filter((u) => u.position === 'admin')).toHaveLength(1);
    });
});

describe('nextId', () => {
    test('returns max id + 1, or 1 for an empty table', () => {
        expect(nextId([{ id: 3 }, { id: 9 }])).toBe(10);
        expect(nextId([])).toBe(1);
    });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- --watchAll=false --testPathPattern=mocks/db`
Expected: FAIL with `Cannot find module './db'`.

- [x] **Step 3: Write `time.js`**

Create `frontend/src/mocks/time.js`:

```js
const pad = (n) => String(n).padStart(2, '0');

// SQL Server DATETIME has no zone; the real API serialises it as if it were UTC,
// so pages print these digits as-is. Mirror that with local date parts.
export const toWallClock = (date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.000Z`;

export const daysAgo = (today, days, hours, minutes = 0) =>
    toWallClock(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days, hours, minutes));
```

- [x] **Step 4: Write the fixtures**

Create `frontend/src/mocks/fixtures/master.js`:

```js
export const buildProcesses = () => [
    { id: 1, process_code: '1400', process_name: 'BEFORE ISSUE' },
    { id: 2, process_code: '1500', process_name: 'GAUGING' },
];

export const buildStatuses = () => [
    { id: 1, status: 'bf_issue', label_status: 'Before Issue', process_id: 1 },
    { id: 2, status: 'gr_f1', label_status: 'Gauging Room F1', process_id: 2 },
    { id: 3, status: 'mc_f1', label_status: 'MC Gauging F1', process_id: 2 },
    { id: 4, status: 'completed', label_status: 'Completed', process_id: 2 },
];
```

Create `frontend/src/mocks/fixtures/users.js`:

```js
// Fake demo accounts. Plain-text passwords here only; the real API stores bcrypt hashes.
export const buildUsers = () => [
    { id: 1, emp_id: 'MOCK001', eng_name: 'DEMO', eng_surname: 'ADMIN', position: 'admin', password: 'DEMO1234' },
    { id: 2, emp_id: 'MOCK002', eng_name: 'DEMO', eng_surname: 'OPERATOR', position: 'user', password: 'DEMO1234' },
];
```

Create `frontend/src/mocks/fixtures/lots.js`:

```js
import { daysAgo } from '../time';

const PARTS = [
    { brg_type: '6204ZZCM', spec: 'NS7S' },
    { brg_type: '6205DDUCM', spec: 'AV2S' },
    { brg_type: '6301ZZCM', spec: 'E' },
    { brg_type: '6003VVCM', spec: 'NS7S' },
];

const REGISTERED = 32;
const UNREGISTERED = 8;

// Repeating cycle so every dashboard card, and the Clear Tag history, has rows.
const STATUS_CYCLE = [1, 1, 2, 2, 3, 3, 4];
const LOCATION_BY_STATUS = { 1: null, 2: 'GAUGING ROOM F1', 3: 'MC GAUGING F1', 4: 'MC GAUGING F1' };

const catalogLot = (n) => {
    const part = PARTS[n % PARTS.length];
    return {
        lot_no: `DEMO${String(n).padStart(6, '0')}`,
        wos: `W${String(100 + Math.floor(n / 4)).padStart(6, '0')}`,
        brg_type: part.brg_type,
        spec: part.spec,
        qty: 100 + (n % 5) * 50,
    };
};

export const buildAs400Lots = () =>
    Array.from({ length: REGISTERED + UNREGISTERED }, (_, i) => catalogLot(i + 1));

export const buildLots = (today) =>
    Array.from({ length: REGISTERED }, (_, i) => {
        const statusId = STATUS_CYCLE[i % STATUS_CYCLE.length];
        const day = i % 3;
        const createdAt = daysAgo(today, day, 7 + (i % 8));
        const updatedAt = daysAgo(today, day, 8 + (i % 8), 30);
        const cleared = statusId === 4;
        return {
            ...catalogLot(i + 1),
            tag_id: `E2801160000${String(i + 1).padStart(5, '0')}`,
            status_id: statusId,
            location_name: LOCATION_BY_STATUS[statusId],
            machine_no: null,
            emp_id: cleared ? 'MOCK001' : null,
            remark: cleared ? '[FROM: MC Gauging F1]' : null,
            cleared_at: cleared ? updatedAt : null,
            created_at: createdAt,
            updated_at: updatedAt,
        };
    });
```

Create `frontend/src/mocks/fixtures/mockDone.js`:

```js
import { daysAgo } from '../time';

export const buildMockDone = (today) => [
    { id: 1, lot_no: 'DEMO000003', created_at: daysAgo(today, 0, 9, 15) },
    { id: 2, lot_no: 'DEMO000010', created_at: daysAgo(today, 1, 10) },
];
```

Create `frontend/src/mocks/fixtures/readers.js`:

```js
// 192.0.2.0/24 is the documentation range: never a real reader.
export const buildReaderConfig = () => [
    { type: 'gr_f1', location_name: 'GAUGING ROOM F1', enabled: true, ip: '192.0.2.10', power: 10 },
    { type: 'mc_f1', location_name: 'MC GAUGING F1', enabled: false, ip: '192.0.2.11', power: 10 },
];
```

- [x] **Step 5: Write `db.js`**

Create `frontend/src/mocks/db.js`:

```js
import { toWallClock } from './time';
import { buildProcesses, buildStatuses } from './fixtures/master';
import { buildUsers } from './fixtures/users';
import { buildAs400Lots, buildLots } from './fixtures/lots';
import { buildMockDone } from './fixtures/mockDone';
import { buildReaderConfig } from './fixtures/readers';

export const nextId = (rows) => rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;

export const createDb = ({ now = () => new Date() } = {}) => {
    const today = now();
    return {
        now: () => toWallClock(now()),
        processes: buildProcesses(),
        statuses: buildStatuses(),
        users: buildUsers(),
        as400Lots: buildAs400Lots(),
        lots: buildLots(today),
        mockDone: buildMockDone(today),
        readerConfig: buildReaderConfig(),
    };
};
```

- [x] **Step 6: Write `testUtils.js`**

Create `frontend/src/mocks/testUtils.js`:

```js
import { createDb } from './db';
import { matchRoute } from './router';

export const FIXED_NOW = new Date(2026, 8, 29, 10, 0, 0);

export const createTestDb = () => createDb({ now: () => FIXED_NOW });

export const callRoute = async (routes, method, path, { query = {}, body = {} } = {}) => {
    const match = matchRoute(routes, method, path);
    if (!match) throw new Error(`No route for ${method} ${path}`);
    const { status = 200, data } = await match.handler({ params: match.params, query, body });
    return { status, data };
};
```

- [x] **Step 7: Run the test to verify it passes**

Run: `npm test -- --watchAll=false --testPathPattern=mocks/db`
Expected: PASS, 11 tests.

- [x] **Step 8: Hand off**

Changed: `frontend/src/mocks/time.js`, `db.js`, `testUtils.js`, `db.test.js`, `fixtures/master.js`, `fixtures/users.js`, `fixtures/lots.js`, `fixtures/mockDone.js`, `fixtures/readers.js`.
Suggested message: `feat(frontend): add mock in-memory store and fixtures`

---

### Task 5: Auth handlers + session seed

**Files:**
- Create: `frontend/src/mocks/handlers/auth.js`
- Create: `frontend/src/mocks/handlers/auth.test.js`
- Create: `frontend/src/mocks/session.js`
- Create: `frontend/src/mocks/session.test.js`

**Interfaces:**
- Consumes: `nextId` from `../db`, and `createTestDb`, `callRoute` from `../testUtils` (Task 4).
- Produces:
  - `authRoutes(db) => Route[]` for `POST /login`, `GET|POST /login/users`, `PUT|DELETE /login/users/:id`.
  - `seedMockSession(users) => void`: writes the first admin (without `password`) to `sessionStorage['assy_user']`, unless a session already exists.
- Real behaviour mirrored (`backend/services/userService.js`, `routes/assembly.js`):
  - `/login` returns 200 `{ result: 'OK', user }` without the password, or 401 `{ error: 'INVALID_CREDENTIALS' }`.
  - The users list never includes `password`.
  - `PUT` changes only `eng_name`, `eng_surname` and `position`.
  - Create / update / delete always return `{ result: 'OK' }`.

- [x] **Step 1: Write the failing tests**

Create `frontend/src/mocks/handlers/auth.test.js`:

```js
import { authRoutes } from './auth';
import { createTestDb, callRoute } from '../testUtils';

let db;
let routes;
beforeEach(() => {
    db = createTestDb();
    routes = authRoutes(db);
});

describe('POST /login', () => {
    test('returns the user without the password', async () => {
        const res = await callRoute(routes, 'POST', '/login', { body: { emp_id: 'MOCK001', password: 'DEMO1234' } });
        expect(res.data.result).toBe('OK');
        expect(res.data.user).toMatchObject({ emp_id: 'MOCK001', position: 'admin' });
        expect(res.data.user).not.toHaveProperty('password');
    });

    test('returns 401 for a wrong password', async () => {
        const res = await callRoute(routes, 'POST', '/login', { body: { emp_id: 'MOCK001', password: 'nope' } });
        expect(res).toEqual({ status: 401, data: { error: 'INVALID_CREDENTIALS' } });
    });
});

describe('/login/users', () => {
    test('lists users without passwords', async () => {
        const { data } = await callRoute(routes, 'GET', '/login/users');
        expect(data.length).toBe(db.users.length);
        data.forEach((u) => expect(u).not.toHaveProperty('password'));
    });

    test('creates a user that can then log in', async () => {
        const body = { emp_id: 'MOCK099', eng_name: 'NEW', eng_surname: 'USER', password: 'PW', position: 'user' };
        expect((await callRoute(routes, 'POST', '/login/users', { body })).data).toEqual({ result: 'OK' });
        const login = await callRoute(routes, 'POST', '/login', { body: { emp_id: 'MOCK099', password: 'PW' } });
        expect(login.data.result).toBe('OK');
    });

    test('updates name and position by string id, but not emp_id', async () => {
        await callRoute(routes, 'PUT', '/login/users/2', {
            body: { emp_id: 'HACK', eng_name: 'RENAMED', eng_surname: 'X', position: 'admin' },
        });
        expect(db.users.find((u) => u.id === 2)).toMatchObject({ emp_id: 'MOCK002', eng_name: 'RENAMED', position: 'admin' });
    });

    test('deletes by string id', async () => {
        await callRoute(routes, 'DELETE', '/login/users/2');
        expect(db.users.some((u) => u.id === 2)).toBe(false);
    });
});
```

Create `frontend/src/mocks/session.test.js`:

```js
import { seedMockSession } from './session';
import { createTestDb } from './testUtils';

beforeEach(() => sessionStorage.clear());

test('stores the admin user without the password', () => {
    seedMockSession(createTestDb().users);
    const stored = JSON.parse(sessionStorage.getItem('assy_user'));
    expect(stored).toMatchObject({ emp_id: 'MOCK001', position: 'admin' });
    expect(stored).not.toHaveProperty('password');
});

test('keeps an existing session', () => {
    sessionStorage.setItem('assy_user', JSON.stringify({ emp_id: 'MOCK002' }));
    seedMockSession(createTestDb().users);
    expect(JSON.parse(sessionStorage.getItem('assy_user')).emp_id).toBe('MOCK002');
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --watchAll=false --testPathPattern="mocks/(handlers/auth|session)"`
Expected: FAIL with `Cannot find module './auth'` and `Cannot find module './session'`.

- [x] **Step 3: Write the implementation**

Create `frontend/src/mocks/handlers/auth.js`:

```js
import { nextId } from '../db';

const withoutPassword = ({ password, ...user }) => user;
const OK = { data: { result: 'OK' } };

export const authRoutes = (db) => [
    {
        method: 'POST',
        path: '/login',
        handler: ({ body }) => {
            const user = db.users.find((u) => u.emp_id === body.emp_id && u.password === body.password);
            if (!user) return { status: 401, data: { error: 'INVALID_CREDENTIALS' } };
            return { data: { result: 'OK', user: withoutPassword(user) } };
        },
    },
    {
        method: 'GET',
        path: '/login/users',
        handler: () => ({ data: db.users.map(withoutPassword) }),
    },
    {
        method: 'POST',
        path: '/login/users',
        handler: ({ body }) => {
            const { emp_id, eng_name, eng_surname, password, position } = body;
            db.users.push({ id: nextId(db.users), emp_id, eng_name, eng_surname, password, position });
            return OK;
        },
    },
    {
        method: 'PUT',
        path: '/login/users/:id',
        handler: ({ params, body }) => {
            const user = db.users.find((u) => u.id === Number(params.id));
            if (user) Object.assign(user, { eng_name: body.eng_name, eng_surname: body.eng_surname, position: body.position });
            return OK;
        },
    },
    {
        method: 'DELETE',
        path: '/login/users/:id',
        handler: ({ params }) => {
            db.users = db.users.filter((u) => u.id !== Number(params.id));
            return OK;
        },
    },
];
```

Create `frontend/src/mocks/session.js`:

```js
const SESSION_KEY = 'assy_user';

export const seedMockSession = (users) => {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    const { password, ...admin } = users.find((u) => u.position === 'admin');
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(admin));
};
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --watchAll=false --testPathPattern="mocks/(handlers/auth|session)"`
Expected: PASS, 8 tests.

- [x] **Step 5: Hand off**

Changed: `frontend/src/mocks/handlers/auth.js`, `auth.test.js`, `frontend/src/mocks/session.js`, `session.test.js`.
Suggested message: `feat(frontend): add mock auth handlers and session seed`

---

### Task 6: Lot / process-flow handlers

**Files:**
- Create: `frontend/src/mocks/handlers/lots.js`
- Create: `frontend/src/mocks/handlers/lots.test.js`

**Interfaces:**
- Consumes: `createTestDb`, `callRoute` from `../testUtils` (Task 4); the `Db` shape and `db.now()`.
- Produces: `lotRoutes(db) => Route[]` for `GET /lot/:lot_no`, `GET /lot-by-lot/:lot_no`, `GET /lot-by-tag/:tag_id`, `POST /register-tag`, `POST /gr_f1`, `POST /mc_f1`, `POST /completed`.
- Real behaviour mirrored (stored procedures in `backend/scripts/setup_dev_database.sql`):

| Endpoint | Success | Failure results |
|---|---|---|
| `GET /lot/:lot_no` (AS400) | `{ lot_no, wos, brg_type, spec, qty }` | 404 `{ error: 'LOT_NOT_FOUND' }` |
| `GET /lot-by-lot/:lot_no` | `{ lot_no, wos, qty, tag_id, status_id, brg_type, spec }`, active lots only | 404 `{ error: 'LOT_NOT_FOUND' }` |
| `GET /lot-by-tag/:tag_id` | same shape, active lots only | 404 `{ error: 'TAG_NOT_FOUND' }` |
| `POST /register-tag` | new lot at status 1 | `LOT_ALREADY_EXISTS` (any status), `TAG_IN_USE` (active lots only) |
| `POST /gr_f1` | status 1 → 2, `location_name = body.location_name ?? null` | `TAG_NOT_FOUND`, `INVALID_PROCESS` |
| `POST /mc_f1` | status 2 → 3, same | `TAG_NOT_FOUND`, `INVALID_PROCESS` |
| `POST /completed` | status 3 → 4, sets `cleared_at`, `remark`, `emp_id` | `LOT_NOT_FOUND`, `INVALID_PROCESS` |

All results use HTTP 200 `{ result }`.

- [x] **Step 1: Write the failing test**

Create `frontend/src/mocks/handlers/lots.test.js`:

```js
import { lotRoutes } from './lots';
import { createTestDb, callRoute } from '../testUtils';

let db;
let routes;
beforeEach(() => {
    db = createTestDb();
    routes = lotRoutes(db);
});

const lotAt = (statusId) => db.lots.find((l) => l.status_id === statusId);
const unregistered = () => db.as400Lots.find((a) => !db.lots.some((l) => l.lot_no === a.lot_no));
const post = (path, body) => callRoute(routes, 'POST', path, { body });

describe('lookups', () => {
    test('GET /lot/:lot_no returns the AS400 record', async () => {
        const lot = unregistered();
        const res = await callRoute(routes, 'GET', `/lot/${lot.lot_no}`);
        expect(res.data).toEqual(lot);
    });

    test('GET /lot/:lot_no returns 404 for an unknown lot', async () => {
        expect((await callRoute(routes, 'GET', '/lot/NOPE')).status).toBe(404);
    });

    test('lot-by-lot and lot-by-tag find an active lot', async () => {
        const lot = lotAt(2);
        const byLot = await callRoute(routes, 'GET', `/lot-by-lot/${lot.lot_no}`);
        const byTag = await callRoute(routes, 'GET', `/lot-by-tag/${lot.tag_id}`);
        expect(byLot.data).toEqual(byTag.data);
        expect(byLot.data).toMatchObject({ lot_no: lot.lot_no, tag_id: lot.tag_id, status_id: 2 });
    });

    test('lot-by-lot and lot-by-tag hide completed lots', async () => {
        const lot = lotAt(4);
        expect((await callRoute(routes, 'GET', `/lot-by-lot/${lot.lot_no}`)).data).toEqual({ error: 'LOT_NOT_FOUND' });
        expect((await callRoute(routes, 'GET', `/lot-by-tag/${lot.tag_id}`)).data).toEqual({ error: 'TAG_NOT_FOUND' });
    });
});

describe('POST /register-tag', () => {
    test('registers a new lot at Before Issue, stamped with the clock', async () => {
        const lot = unregistered();
        expect((await post('/register-tag', { ...lot, tag_id: 'NEWTAG1' })).data).toEqual({ result: 'OK' });
        expect(db.lots.find((l) => l.lot_no === lot.lot_no)).toMatchObject({
            tag_id: 'NEWTAG1', status_id: 1, created_at: '2026-09-29T10:00:00.000Z',
        });
    });

    test('rejects a lot that is already registered', async () => {
        const lot = lotAt(1);
        expect((await post('/register-tag', { ...lot, tag_id: 'NEWTAG2' })).data.result).toBe('LOT_ALREADY_EXISTS');
    });

    test('rejects a tag used by an active lot', async () => {
        expect((await post('/register-tag', { ...unregistered(), tag_id: lotAt(1).tag_id })).data.result).toBe('TAG_IN_USE');
    });

    test('allows reusing the tag of a completed lot', async () => {
        expect((await post('/register-tag', { ...unregistered(), tag_id: lotAt(4).tag_id })).data.result).toBe('OK');
    });
});

describe('scan flow', () => {
    test('gr_f1 moves Before Issue to Gauging Room F1', async () => {
        const lot = lotAt(1);
        expect((await post('/gr_f1', { tag_id: lot.tag_id })).data.result).toBe('OK');
        expect(lot).toMatchObject({ status_id: 2, updated_at: '2026-09-29T10:00:00.000Z' });
    });

    test('mc_f1 before gr_f1 is INVALID_PROCESS and changes nothing', async () => {
        const lot = lotAt(1);
        expect((await post('/mc_f1', { tag_id: lot.tag_id })).data.result).toBe('INVALID_PROCESS');
        expect(lot.status_id).toBe(1);
    });

    test('an unknown tag is TAG_NOT_FOUND', async () => {
        expect((await post('/gr_f1', { tag_id: 'NOPE' })).data.result).toBe('TAG_NOT_FOUND');
    });

    test('a scan without location_name clears it, like the real SP', async () => {
        const lot = lotAt(2);
        await post('/mc_f1', { tag_id: lot.tag_id });
        expect(lot.location_name).toBeNull();
    });
});

describe('POST /completed', () => {
    test('clears a lot at MC Gauging F1', async () => {
        const lot = lotAt(3);
        const res = await post('/completed', { lot_no: lot.lot_no, remark: '[FROM: MC Gauging F1]', emp_id: 'MOCK001' });
        expect(res.data.result).toBe('OK');
        expect(lot).toMatchObject({
            status_id: 4, cleared_at: '2026-09-29T10:00:00.000Z', remark: '[FROM: MC Gauging F1]', emp_id: 'MOCK001',
        });
    });

    test('rejects a lot not yet at MC Gauging F1', async () => {
        expect((await post('/completed', { lot_no: lotAt(1).lot_no })).data.result).toBe('INVALID_PROCESS');
    });

    test('rejects an unknown lot', async () => {
        expect((await post('/completed', { lot_no: 'NOPE' })).data.result).toBe('LOT_NOT_FOUND');
    });
});

test('full flow: register, scan GR, scan MC, clear', async () => {
    const lot = unregistered();
    await post('/register-tag', { ...lot, tag_id: 'FLOWTAG' });
    await post('/gr_f1', { tag_id: 'FLOWTAG' });
    await post('/mc_f1', { tag_id: 'FLOWTAG' });
    expect((await post('/completed', { lot_no: lot.lot_no, emp_id: 'MOCK001' })).data.result).toBe('OK');
    expect((await callRoute(routes, 'GET', '/lot-by-tag/FLOWTAG')).status).toBe(404);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- --watchAll=false --testPathPattern=mocks/handlers/lots`
Expected: FAIL with `Cannot find module './lots'`.

- [x] **Step 3: Write the implementation**

Create `frontend/src/mocks/handlers/lots.js`:

```js
const BEFORE_ISSUE = 1;
const GAUGING_ROOM_F1 = 2;
const MC_GAUGING_F1 = 3;
const COMPLETED = 4;

const result = (code) => ({ data: { result: code } });
const notFound = (error) => ({ status: 404, data: { error } });

const isActive = (lot) => lot.status_id !== COMPLETED;

const lotView = ({ lot_no, wos, qty, tag_id, status_id, brg_type, spec }) =>
    ({ lot_no, wos, qty, tag_id, status_id, brg_type, spec });

// A tag can belong to several lots over time; the active one wins.
const findByTag = (db, tagId) =>
    db.lots.find((l) => l.tag_id === tagId && isActive(l))
    ?? db.lots.find((l) => l.tag_id === tagId);

// Mirrors Stored_tb_assy_gauging_room_f1 / _mc_gauging_f1: one step forward only.
const advance = (db, fromStatus, toStatus) => ({ body }) => {
    const lot = findByTag(db, body.tag_id);
    if (!lot) return result('TAG_NOT_FOUND');
    if (lot.status_id !== fromStatus) return result('INVALID_PROCESS');
    Object.assign(lot, { status_id: toStatus, location_name: body.location_name ?? null, updated_at: db.now() });
    return result('OK');
};

export const lotRoutes = (db) => [
    {
        method: 'GET',
        path: '/lot/:lot_no',
        handler: ({ params }) => {
            const lot = db.as400Lots.find((a) => a.lot_no === params.lot_no);
            return lot ? { data: { ...lot } } : notFound('LOT_NOT_FOUND');
        },
    },
    {
        method: 'GET',
        path: '/lot-by-lot/:lot_no',
        handler: ({ params }) => {
            const lot = db.lots.find((l) => l.lot_no === params.lot_no && isActive(l));
            return lot ? { data: lotView(lot) } : notFound('LOT_NOT_FOUND');
        },
    },
    {
        method: 'GET',
        path: '/lot-by-tag/:tag_id',
        handler: ({ params }) => {
            const lot = db.lots.find((l) => l.tag_id === params.tag_id && isActive(l));
            return lot ? { data: lotView(lot) } : notFound('TAG_NOT_FOUND');
        },
    },
    {
        method: 'POST',
        path: '/register-tag',
        handler: ({ body }) => {
            const { tag_id, lot_no, wos, brg_type, spec, qty, location_name } = body;
            if (db.lots.some((l) => l.lot_no === lot_no)) return result('LOT_ALREADY_EXISTS');
            if (db.lots.some((l) => l.tag_id === tag_id && isActive(l))) return result('TAG_IN_USE');
            const now = db.now();
            db.lots.push({
                lot_no, wos, brg_type, spec, qty, tag_id,
                status_id: BEFORE_ISSUE,
                location_name: location_name ?? null,
                machine_no: null, emp_id: null, remark: null, cleared_at: null,
                created_at: now, updated_at: now,
            });
            return result('OK');
        },
    },
    { method: 'POST', path: '/gr_f1', handler: advance(db, BEFORE_ISSUE, GAUGING_ROOM_F1) },
    { method: 'POST', path: '/mc_f1', handler: advance(db, GAUGING_ROOM_F1, MC_GAUGING_F1) },
    {
        method: 'POST',
        path: '/completed',
        handler: ({ body }) => {
            const lot = db.lots.find((l) => l.lot_no === body.lot_no);
            if (!lot) return result('LOT_NOT_FOUND');
            if (lot.status_id !== MC_GAUGING_F1) return result('INVALID_PROCESS');
            const now = db.now();
            Object.assign(lot, {
                status_id: COMPLETED, cleared_at: now, updated_at: now,
                remark: body.remark ?? null, emp_id: body.emp_id ?? null, machine_no: body.machine_no ?? null,
            });
            return result('OK');
        },
    },
];
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npm test -- --watchAll=false --testPathPattern=mocks/handlers/lots`
Expected: PASS, 16 tests.

- [x] **Step 5: Hand off**

Changed: `frontend/src/mocks/handlers/lots.js`, `lots.test.js`.
Suggested message: `feat(frontend): add mock lot and process-flow handlers`

---

### Task 7: Dashboard handlers

**Files:**
- Create: `frontend/src/mocks/handlers/dashboard.js`
- Create: `frontend/src/mocks/handlers/dashboard.test.js`

**Interfaces:**
- Consumes: `createTestDb`, `callRoute` from `../testUtils` (Task 4); the `Db` shape.
- Produces: `dashboardRoutes(db) => Route[]` for `GET /dashboard`, `/dashboard/process-summary`, `/dashboard/history`, `/dashboard/locations`.
- Real behaviour mirrored (`Stored_tb_assy_dashboard*`):
  - `/dashboard` returns `{ summary: { total_qty, bf_issue, gr_f1, mc_f1 } }`. `total_qty` excludes completed lots. The real API also returns `top5` and `lots`, but no page reads them, so they are left out.
  - `/dashboard/process-summary` returns `[{ process_code, process_name, inventory_qty }]`, ordered by `process_code`. It sums the qty of active lots through `status.process_id`.
  - `/dashboard/history` returns active lots with `label_status`, filtered case-insensitively ("contains", like SQL `LIKE '%x%'`) on `brg_type`, `wos`, `lot_no`, `location_name`. It filters exactly on `status_id`, and by `created_at` date between `date_from` and `date_to` inclusive. Newest `updated_at` first, max 200 rows.
  - `/dashboard/locations` returns `[{ location_name }]` for each reader with a non-empty name.

- [x] **Step 1: Write the failing test**

Create `frontend/src/mocks/handlers/dashboard.test.js`:

```js
import { dashboardRoutes } from './dashboard';
import { createTestDb, callRoute } from '../testUtils';

let db;
let routes;
beforeEach(() => {
    db = createTestDb();
    routes = dashboardRoutes(db);
});

const get = async (path, query) => (await callRoute(routes, 'GET', path, { query })).data;

describe('GET /dashboard', () => {
    test('total_qty is the sum of the three active steps', async () => {
        const { summary } = await get('/dashboard');
        expect(summary.total_qty).toBe(summary.bf_issue + summary.gr_f1 + summary.mc_f1);
        expect(summary.bf_issue).toBeGreaterThan(0);
    });

    test('reflects a change in the store', async () => {
        const before = (await get('/dashboard')).summary;
        db.lots.find((l) => l.status_id === 1).status_id = 2;
        const after = (await get('/dashboard')).summary;
        expect(after.bf_issue).toBeLessThan(before.bf_issue);
        expect(after.gr_f1).toBeGreaterThan(before.gr_f1);
        expect(after.total_qty).toBe(before.total_qty);
    });
});

describe('GET /dashboard/process-summary', () => {
    test('is ordered by process_code and totals the active inventory', async () => {
        const rows = await get('/dashboard/process-summary');
        expect(rows.map((r) => r.process_code)).toEqual(['1400', '1500']);
        const total = rows.reduce((sum, r) => sum + r.inventory_qty, 0);
        expect(total).toBe((await get('/dashboard')).summary.total_qty);
    });
});

describe('GET /dashboard/history', () => {
    test('the default "today" filter returns rows, all active and created today', async () => {
        const rows = await get('/dashboard/history', { date_from: '2026-09-29', date_to: '2026-09-29' });
        expect(rows.length).toBeGreaterThan(0);
        rows.forEach((r) => {
            expect(r.created_at.startsWith('2026-09-29')).toBe(true);
            expect(r.status_id).not.toBe(4);
        });
    });

    test('filters status_id sent as a string', async () => {
        const rows = await get('/dashboard/history', { status_id: '2' });
        expect(rows.length).toBeGreaterThan(0);
        rows.forEach((r) => expect(r.status_id).toBe(2));
    });

    test('matches part numbers case-insensitively and partially', async () => {
        const rows = await get('/dashboard/history', { brg_type: '6204zz' });
        expect(rows.length).toBeGreaterThan(0);
        rows.forEach((r) => expect(r.brg_type).toBe('6204ZZCM'));
    });

    test('a location filter excludes lots with no location', async () => {
        const rows = await get('/dashboard/history', { location_name: 'GAUGING ROOM F1' });
        expect(rows.length).toBeGreaterThan(0);
        rows.forEach((r) => expect(r.location_name).toBe('GAUGING ROOM F1'));
    });

    test('rows carry label_status and are newest-updated first', async () => {
        const rows = await get('/dashboard/history');
        expect(rows[0].label_status).toBeTruthy();
        const updated = rows.map((r) => r.updated_at);
        expect(updated).toEqual([...updated].sort().reverse());
    });
});

describe('GET /dashboard/locations', () => {
    test('lists reader locations', async () => {
        expect(await get('/dashboard/locations')).toEqual([
            { location_name: 'GAUGING ROOM F1' },
            { location_name: 'MC GAUGING F1' },
        ]);
    });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- --watchAll=false --testPathPattern=mocks/handlers/dashboard`
Expected: FAIL with `Cannot find module './dashboard'`.

- [x] **Step 3: Write the implementation**

Create `frontend/src/mocks/handlers/dashboard.js`:

```js
const COMPLETED = 4;
const MAX_ROWS = 200;

const sumQty = (lots) => lots.reduce((sum, l) => sum + (l.qty || 0), 0);
const dateOf = (timestamp) => timestamp.slice(0, 10);

// SQL LIKE '%x%' under the default case-insensitive collation; NULL never matches.
const contains = (value, needle) =>
    !needle || (value != null && String(value).toUpperCase().includes(String(needle).toUpperCase()));

const matchesFilter = (lot, q) =>
    (!q.date_from || dateOf(lot.created_at) >= q.date_from)
    && (!q.date_to || dateOf(lot.created_at) <= q.date_to)
    && contains(lot.brg_type, q.brg_type)
    && contains(lot.wos, q.wos)
    && contains(lot.lot_no, q.lot_no)
    && (!q.status_id || lot.status_id === Number(q.status_id))
    && contains(lot.location_name, q.location_name);

const activeLots = (db) => db.lots.filter((l) => l.status_id !== COMPLETED);

export const dashboardRoutes = (db) => [
    {
        method: 'GET',
        path: '/dashboard',
        handler: ({ query }) => {
            const lots = db.lots.filter((l) => matchesFilter(l, query));
            const qtyAt = (statusId) => sumQty(lots.filter((l) => l.status_id === statusId));
            return {
                data: {
                    summary: {
                        total_qty: sumQty(lots.filter((l) => l.status_id !== COMPLETED)),
                        bf_issue: qtyAt(1),
                        gr_f1: qtyAt(2),
                        mc_f1: qtyAt(3),
                    },
                },
            };
        },
    },
    {
        method: 'GET',
        path: '/dashboard/process-summary',
        handler: () => {
            const statusIdsOf = (processId) =>
                db.statuses.filter((s) => s.process_id === processId).map((s) => s.id);
            const rows = [...db.processes]
                .sort((a, b) => a.process_code.localeCompare(b.process_code))
                .map((p) => ({
                    process_code: p.process_code,
                    process_name: p.process_name,
                    inventory_qty: sumQty(activeLots(db).filter((l) => statusIdsOf(p.id).includes(l.status_id))),
                }));
            return { data: rows };
        },
    },
    {
        method: 'GET',
        path: '/dashboard/history',
        handler: ({ query }) => {
            const labelOf = (statusId) => db.statuses.find((s) => s.id === statusId)?.label_status ?? null;
            const rows = activeLots(db)
                .filter((l) => matchesFilter(l, query))
                .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
                .slice(0, MAX_ROWS)
                .map((l) => ({ ...l, label_status: labelOf(l.status_id) }));
            return { data: rows };
        },
    },
    {
        method: 'GET',
        path: '/dashboard/locations',
        handler: () => ({
            data: db.readerConfig
                .filter((r) => r.location_name)
                .map((r) => ({ location_name: r.location_name })),
        }),
    },
];
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npm test -- --watchAll=false --testPathPattern=mocks/handlers/dashboard`
Expected: PASS, 9 tests.

- [x] **Step 5: Hand off**

Changed: `frontend/src/mocks/handlers/dashboard.js`, `dashboard.test.js`.
Suggested message: `feat(frontend): add mock dashboard handlers`

---

### Task 8: Clear-tag history + mock-done handlers

**Files:**
- Create: `frontend/src/mocks/handlers/clearTag.js`
- Create: `frontend/src/mocks/handlers/clearTag.test.js`

**Interfaces:**
- Consumes: `nextId` from `../db`; `createTestDb`, `callRoute` from `../testUtils` (Task 4).
- Produces: `clearTagRoutes(db) => Route[]` for `GET /clear-tag/history`, `GET|POST /mock-done`, `DELETE /mock-done/:lot_no`.
- Real behaviour mirrored:
  - `/clear-tag/history` returns completed lots with `cleared_at` date inside `[date_from, date_to]`, newest first, max 200. Row shape: `{ lot_no, tag_id, emp_id, remark, cleared_at, updated_at, brg_type, spec }`.
  - `/mock-done` (`backend/services/mockService.js`): the list is newest first. `POST` returns `{ result: 'OK' | 'ALREADY_EXISTS' }`. `DELETE` returns `{ result: 'OK' | 'NOT_FOUND' }`.

- [x] **Step 1: Write the failing test**

Create `frontend/src/mocks/handlers/clearTag.test.js`:

```js
import { clearTagRoutes } from './clearTag';
import { createTestDb, callRoute } from '../testUtils';

let db;
let routes;
beforeEach(() => {
    db = createTestDb();
    routes = clearTagRoutes(db);
});

describe('GET /clear-tag/history', () => {
    test('the default "today" filter returns lots cleared today', async () => {
        const { data } = await callRoute(routes, 'GET', '/clear-tag/history', {
            query: { date_from: '2026-09-29', date_to: '2026-09-29' },
        });
        expect(data.length).toBeGreaterThan(0);
        data.forEach((h) => {
            expect(h.cleared_at.startsWith('2026-09-29')).toBe(true);
            expect(Object.keys(h).sort()).toEqual(
                ['brg_type', 'cleared_at', 'emp_id', 'lot_no', 'remark', 'spec', 'tag_id', 'updated_at'],
            );
        });
    });

    test('without dates returns every cleared lot, newest first', async () => {
        const { data } = await callRoute(routes, 'GET', '/clear-tag/history');
        expect(data.length).toBe(db.lots.filter((l) => l.status_id === 4).length);
        const cleared = data.map((h) => h.cleared_at);
        expect(cleared).toEqual([...cleared].sort().reverse());
    });
});

describe('/mock-done', () => {
    test('lists newest first', async () => {
        const { data } = await callRoute(routes, 'GET', '/mock-done');
        const created = data.map((m) => m.created_at);
        expect(created).toEqual([...created].sort().reverse());
    });

    test('adds a lot once', async () => {
        const add = () => callRoute(routes, 'POST', '/mock-done', { body: { lot_no: 'DEMO000020' } });
        expect((await add()).data).toEqual({ result: 'OK' });
        expect((await add()).data).toEqual({ result: 'ALREADY_EXISTS' });
        expect(db.mockDone.find((m) => m.lot_no === 'DEMO000020')).toMatchObject({
            id: 3, created_at: '2026-09-29T10:00:00.000Z',
        });
    });

    test('deletes by lot_no, and reports NOT_FOUND for an unknown one', async () => {
        expect((await callRoute(routes, 'DELETE', '/mock-done/DEMO000003')).data).toEqual({ result: 'OK' });
        expect((await callRoute(routes, 'DELETE', '/mock-done/DEMO000003')).data).toEqual({ result: 'NOT_FOUND' });
    });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- --watchAll=false --testPathPattern=mocks/handlers/clearTag`
Expected: FAIL with `Cannot find module './clearTag'`.

- [x] **Step 3: Write the implementation**

Create `frontend/src/mocks/handlers/clearTag.js`:

```js
import { nextId } from '../db';

const COMPLETED = 4;
const MAX_ROWS = 200;

const newestFirst = (key) => (a, b) => b[key].localeCompare(a[key]);
const result = (code) => ({ data: { result: code } });

const historyRow = ({ lot_no, tag_id, emp_id, remark, cleared_at, updated_at, brg_type, spec }) =>
    ({ lot_no, tag_id, emp_id, remark, cleared_at, updated_at, brg_type, spec });

export const clearTagRoutes = (db) => [
    {
        method: 'GET',
        path: '/clear-tag/history',
        handler: ({ query }) => {
            const rows = db.lots
                .filter((l) => l.status_id === COMPLETED)
                .filter((l) => !query.date_from || l.cleared_at.slice(0, 10) >= query.date_from)
                .filter((l) => !query.date_to || l.cleared_at.slice(0, 10) <= query.date_to)
                .sort(newestFirst('cleared_at'))
                .slice(0, MAX_ROWS)
                .map(historyRow);
            return { data: rows };
        },
    },
    {
        method: 'GET',
        path: '/mock-done',
        handler: () => ({ data: [...db.mockDone].sort(newestFirst('created_at')) }),
    },
    {
        method: 'POST',
        path: '/mock-done',
        handler: ({ body }) => {
            if (db.mockDone.some((m) => m.lot_no === body.lot_no)) return result('ALREADY_EXISTS');
            db.mockDone.push({ id: nextId(db.mockDone), lot_no: body.lot_no, created_at: db.now() });
            return result('OK');
        },
    },
    {
        method: 'DELETE',
        path: '/mock-done/:lot_no',
        handler: ({ params }) => {
            const before = db.mockDone.length;
            db.mockDone = db.mockDone.filter((m) => m.lot_no !== params.lot_no);
            return result(db.mockDone.length < before ? 'OK' : 'NOT_FOUND');
        },
    },
];
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npm test -- --watchAll=false --testPathPattern=mocks/handlers/clearTag`
Expected: PASS, 5 tests.

- [x] **Step 5: Hand off**

Changed: `frontend/src/mocks/handlers/clearTag.js`, `clearTag.test.js`.
Suggested message: `feat(frontend): add mock clear-tag history and mock-done handlers`

---

### Task 9: Admin handlers (status, process, readers)

**Files:**
- Create: `frontend/src/mocks/handlers/admin.js`
- Create: `frontend/src/mocks/handlers/admin.test.js`

**Interfaces:**
- Consumes: `nextId` from `../db`; `createTestDb`, `callRoute` from `../testUtils` (Task 4).
- Produces: `adminRoutes(db) => Route[]` for `GET|POST /status`, `PUT|DELETE /status/:id`, `GET|POST /process`, `PUT|DELETE /process/:id`, `GET|PUT /readers-config`, `GET /readers-status`, `POST /readers-restart`.
- Real behaviour mirrored (`backend/services/masterService.js`, `routes/assembly.js`):
  - `GET /status` rows: `{ id, status, label_status, process_id, process_code, process_name }` (LEFT JOIN, so `null` when unlinked).
  - `POST` / `PUT /status` write `process_id = body.process_id ?? null`. The page never sends it, so an edit unlinks the status (a known limitation).
  - `GET /process` is ordered by `process_code`.
  - Create / update return `{ result: 'OK' }`. A `DELETE` blocked by a foreign key returns `{ result: '<SQL Server FK message>' }` and keeps the row; otherwise it returns `{ result: 'OK' }`.
  - `GET /readers-status` returns `{ readers: [{ type, connected }] }`. The mock treats `enabled` readers as connected.
  - `PUT /readers-config` replaces the whole list. `POST /readers-restart` returns `{ result: 'OK' }`.

- [x] **Step 1: Write the failing test**

Create `frontend/src/mocks/handlers/admin.test.js`:

```js
import { adminRoutes } from './admin';
import { createTestDb, callRoute } from '../testUtils';

let db;
let routes;
beforeEach(() => {
    db = createTestDb();
    routes = adminRoutes(db);
});

const call = (method, path, body) => callRoute(routes, method, path, { body });

describe('/status', () => {
    test('lists statuses joined with their process, with numeric ids', async () => {
        const { data } = await call('GET', '/status');
        expect(data.find((s) => s.id === 1)).toMatchObject({ status: 'bf_issue', process_code: '1400' });
        data.forEach((s) => expect(typeof s.id).toBe('number'));
    });

    test('creates a status with the next id', async () => {
        expect((await call('POST', '/status', { status: 'x', label_status: 'X' })).data).toEqual({ result: 'OK' });
        expect(db.statuses.find((s) => s.status === 'x')).toMatchObject({ id: 5, process_id: null });
    });

    test('updates by string id and unlinks the process, like the real API', async () => {
        await call('PUT', '/status/2', { status: 'gr_f1', label_status: 'Renamed' });
        expect(db.statuses.find((s) => s.id === 2)).toMatchObject({ label_status: 'Renamed', process_id: null });
    });

    test('refuses to delete a status used by a lot', async () => {
        const { data } = await call('DELETE', '/status/1');
        expect(data.result).toMatch(/REFERENCE constraint "FK_assy_lot_status"/);
        expect(db.statuses.some((s) => s.id === 1)).toBe(true);
    });

    test('deletes an unused status', async () => {
        await call('POST', '/status', { status: 'x', label_status: 'X' });
        expect((await call('DELETE', '/status/5')).data).toEqual({ result: 'OK' });
        expect(db.statuses.some((s) => s.id === 5)).toBe(false);
    });
});

describe('/process', () => {
    test('lists processes ordered by code', async () => {
        await call('POST', '/process', { process_code: '0100', process_name: 'FIRST' });
        const { data } = await call('GET', '/process');
        expect(data.map((p) => p.process_code)).toEqual(['0100', '1400', '1500']);
    });

    test('updates by string id', async () => {
        await call('PUT', '/process/1', { process_code: '1401', process_name: 'RENAMED' });
        expect(db.processes.find((p) => p.id === 1)).toMatchObject({ process_code: '1401', process_name: 'RENAMED' });
    });

    test('refuses to delete a process used by a status', async () => {
        const { data } = await call('DELETE', '/process/1');
        expect(data.result).toMatch(/REFERENCE constraint "FK_status_process"/);
        expect(db.processes.some((p) => p.id === 1)).toBe(true);
    });
});

describe('readers', () => {
    test('saving the config changes what is read back', async () => {
        const config = [{ type: 'gr_f1', location_name: 'NEW ROOM', enabled: true, ip: '192.0.2.99', power: 20 }];
        expect((await call('PUT', '/readers-config', config)).data).toEqual({ result: 'OK' });
        expect((await call('GET', '/readers-config')).data).toEqual(config);
    });

    test('status reports enabled readers as connected', async () => {
        expect((await call('GET', '/readers-status')).data).toEqual({
            readers: [{ type: 'gr_f1', connected: true }, { type: 'mc_f1', connected: false }],
        });
    });

    test('restart answers OK', async () => {
        expect((await call('POST', '/readers-restart')).data).toEqual({ result: 'OK' });
    });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- --watchAll=false --testPathPattern=mocks/handlers/admin`
Expected: FAIL with `Cannot find module './admin'`.

- [x] **Step 3: Write the implementation**

Create `frontend/src/mocks/handlers/admin.js`:

```js
import { nextId } from '../db';

const OK = { data: { result: 'OK' } };

// The real API returns SQL Server's error text as `result` with HTTP 200.
const fkConflict = (constraint) => ({
    data: { result: `The DELETE statement conflicted with the REFERENCE constraint "${constraint}".` },
});

const byId = (rows, id) => rows.find((row) => row.id === Number(id));

export const adminRoutes = (db) => [
    {
        method: 'GET',
        path: '/status',
        handler: () => ({
            data: db.statuses.map((s) => {
                const process = byId(db.processes, s.process_id);
                return { ...s, process_code: process?.process_code ?? null, process_name: process?.process_name ?? null };
            }),
        }),
    },
    {
        method: 'POST',
        path: '/status',
        handler: ({ body }) => {
            db.statuses.push({
                id: nextId(db.statuses), status: body.status, label_status: body.label_status,
                process_id: body.process_id ?? null,
            });
            return OK;
        },
    },
    {
        method: 'PUT',
        path: '/status/:id',
        handler: ({ params, body }) => {
            const status = byId(db.statuses, params.id);
            if (status) {
                Object.assign(status, {
                    status: body.status, label_status: body.label_status, process_id: body.process_id ?? null,
                });
            }
            return OK;
        },
    },
    {
        method: 'DELETE',
        path: '/status/:id',
        handler: ({ params }) => {
            const id = Number(params.id);
            if (db.lots.some((l) => l.status_id === id)) return fkConflict('FK_assy_lot_status');
            db.statuses = db.statuses.filter((s) => s.id !== id);
            return OK;
        },
    },
    {
        method: 'GET',
        path: '/process',
        handler: () => ({
            data: [...db.processes].sort((a, b) => a.process_code.localeCompare(b.process_code)),
        }),
    },
    {
        method: 'POST',
        path: '/process',
        handler: ({ body }) => {
            db.processes.push({
                id: nextId(db.processes), process_code: body.process_code, process_name: body.process_name,
            });
            return OK;
        },
    },
    {
        method: 'PUT',
        path: '/process/:id',
        handler: ({ params, body }) => {
            const process = byId(db.processes, params.id);
            if (process) Object.assign(process, { process_code: body.process_code, process_name: body.process_name });
            return OK;
        },
    },
    {
        method: 'DELETE',
        path: '/process/:id',
        handler: ({ params }) => {
            const id = Number(params.id);
            if (db.statuses.some((s) => s.process_id === id)) return fkConflict('FK_status_process');
            db.processes = db.processes.filter((p) => p.id !== id);
            return OK;
        },
    },
    {
        method: 'GET',
        path: '/readers-config',
        handler: () => ({ data: db.readerConfig.map((r) => ({ ...r })) }),
    },
    {
        method: 'PUT',
        path: '/readers-config',
        handler: ({ body }) => {
            db.readerConfig = body;
            return OK;
        },
    },
    {
        method: 'GET',
        path: '/readers-status',
        handler: () => ({
            data: { readers: db.readerConfig.map((r) => ({ type: r.type, connected: Boolean(r.enabled) })) },
        }),
    },
    { method: 'POST', path: '/readers-restart', handler: () => OK },
];
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npm test -- --watchAll=false --testPathPattern=mocks/handlers/admin`
Expected: PASS, 11 tests.

- [x] **Step 5: Hand off**

Changed: `frontend/src/mocks/handlers/admin.js`, `admin.test.js`.
Suggested message: `feat(frontend): add mock status, process and reader handlers`

---

### Task 10: Route table + `installMockMode`

**Files:**
- Create: `frontend/src/mocks/handlers/index.js`
- Create: `frontend/src/mocks/handlers/index.test.js`
- Create: `frontend/src/mocks/index.js`
- Create: `frontend/src/mocks/index.test.js`

**Interfaces:**
- Consumes: `authRoutes` (Task 5), `lotRoutes` (Task 6), `dashboardRoutes` (Task 7), `clearTagRoutes` (Task 8), `adminRoutes` (Task 9), `createDb` (Task 4), `createMockAdapter` (Task 3), `seedMockSession` (Task 5), `MOCK_LATENCY_MS` (Task 1).
- Produces:
  - `createRoutes(db) => Route[]`.
  - `installMockMode(api: AxiosInstance) => void`: creates one store, installs the adapter on `api`, and seeds the admin session. This is the only entry point `instance.js` uses.

- [x] **Step 1: Write the failing tests**

Create `frontend/src/mocks/handlers/index.test.js`. The list below holds every method + path the app calls today (34 call sites, 32 pairs). When a page adds a call, add it here too.

```js
import { createRoutes } from './index';
import { matchRoute } from '../router';
import { createTestDb } from '../testUtils';

const CALLED_BY_APP = [
    ['POST', '/login'],
    ['GET', '/login/users'], ['POST', '/login/users'], ['PUT', '/login/users/1'], ['DELETE', '/login/users/1'],
    ['GET', '/status'], ['POST', '/status'], ['PUT', '/status/1'], ['DELETE', '/status/1'],
    ['GET', '/process'], ['POST', '/process'], ['PUT', '/process/1'], ['DELETE', '/process/1'],
    ['GET', '/lot/DEMO000001'], ['GET', '/lot-by-lot/DEMO000001'], ['GET', '/lot-by-tag/E2801160'],
    ['POST', '/register-tag'], ['POST', '/gr_f1'], ['POST', '/mc_f1'], ['POST', '/completed'],
    ['GET', '/clear-tag/history'],
    ['GET', '/dashboard'], ['GET', '/dashboard/process-summary'],
    ['GET', '/dashboard/history'], ['GET', '/dashboard/locations'],
    ['GET', '/mock-done'], ['POST', '/mock-done'], ['DELETE', '/mock-done/DEMO000001'],
    ['GET', '/readers-config'], ['PUT', '/readers-config'], ['GET', '/readers-status'], ['POST', '/readers-restart'],
];

const routes = createRoutes(createTestDb());

test('covers all 32 endpoints the app calls', () => {
    expect(CALLED_BY_APP).toHaveLength(32);
});

test.each(CALLED_BY_APP)('%s %s has a mock', (method, path) => {
    expect(matchRoute(routes, method, path)).not.toBeNull();
});

test('no method + path is registered twice', () => {
    const keys = routes.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
});
```

Create `frontend/src/mocks/index.test.js`:

```js
import axios from 'axios';

beforeEach(() => {
    sessionStorage.clear();
    process.env.REACT_APP_MOCK_LATENCY = '0';
    jest.resetModules();
});

afterEach(() => {
    delete process.env.REACT_APP_MOCK_LATENCY;
});

test('installs the adapter and seeds the admin session', async () => {
    const { installMockMode } = require('./index');
    const api = axios.create({ baseURL: 'http://localhost:5001/api/assembly' });
    installMockMode(api);

    const res = await api.get('/dashboard');
    expect(res.data.summary.total_qty).toBeGreaterThan(0);
    expect(JSON.parse(sessionStorage.getItem('assy_user')).position).toBe('admin');
});

test('a mutation through the API shows on the dashboard', async () => {
    const { installMockMode } = require('./index');
    const api = axios.create({ baseURL: 'http://localhost:5001/api/assembly' });
    installMockMode(api);

    const before = (await api.get('/dashboard')).data.summary.bf_issue;
    const lot = (await api.get('/lot/DEMO000040')).data;
    await api.post('/register-tag', { ...lot, tag_id: 'INSTALLTEST' });
    const after = (await api.get('/dashboard')).data.summary.bf_issue;
    expect(after).toBe(before + lot.qty);
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --watchAll=false --testPathPattern="mocks/(handlers/)?index"`
Expected: FAIL with `Cannot find module './index'`.

- [x] **Step 3: Write the implementation**

Create `frontend/src/mocks/handlers/index.js`:

```js
import { authRoutes } from './auth';
import { lotRoutes } from './lots';
import { dashboardRoutes } from './dashboard';
import { clearTagRoutes } from './clearTag';
import { adminRoutes } from './admin';

export const createRoutes = (db) => [
    ...authRoutes(db),
    ...lotRoutes(db),
    ...dashboardRoutes(db),
    ...clearTagRoutes(db),
    ...adminRoutes(db),
];
```

Create `frontend/src/mocks/index.js`:

```js
import { createDb } from './db';
import { createRoutes } from './handlers';
import { createMockAdapter } from './adapter';
import { seedMockSession } from './session';
import { MOCK_LATENCY_MS } from './config';

export const installMockMode = (api) => {
    const db = createDb();
    api.defaults.adapter = createMockAdapter(createRoutes(db), MOCK_LATENCY_MS);
    seedMockSession(db.users);
};
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --watchAll=false --testPathPattern="mocks/(handlers/)?index"`
Expected: PASS, 36 tests (34 + 2).

- [x] **Step 5: Run the whole suite**

Run: `npm test -- --watchAll=false`
Expected: PASS, 12 suites, 117 tests, no failures.

- [x] **Step 6: Hand off**

Changed: `frontend/src/mocks/handlers/index.js`, `handlers/index.test.js`, `frontend/src/mocks/index.js`, `index.test.js`.
Suggested message: `feat(frontend): add mock route table and installMockMode`

---

### Task 11: Wire into `instance.js` + bundle check + runbook

**Files:**
- Modify: `frontend/src/config/instance.js`
- Create: `frontend/src/config/instance.test.js`
- Create: `frontend/.env.example` (was `frontend/.env`; changed during execution)
- Create: `docs/runbooks/frontend-mock-mode.md` (repo root, via the `runbook-docs` skill)

**Interfaces:**
- Consumes: `installMockMode` from `src/mocks` (Task 10).
- Produces: `backendApi` uses the mock adapter only when `REACT_APP_MOCK` is exactly `'true'`.

- [x] **Step 1: Write the failing test**

Create `frontend/src/config/instance.test.js`:

```js
const loadApi = (mockFlag) => {
    if (mockFlag === undefined) delete process.env.REACT_APP_MOCK;
    else process.env.REACT_APP_MOCK = mockFlag;
    process.env.REACT_APP_MOCK_LATENCY = '0';
    jest.resetModules();
    return require('./instance').backendApi;
};

afterEach(() => {
    delete process.env.REACT_APP_MOCK;
    delete process.env.REACT_APP_MOCK_LATENCY;
    sessionStorage.clear();
});

test('uses the mock adapter when REACT_APP_MOCK is "true"', async () => {
    const api = loadApi('true');
    expect(typeof api.defaults.adapter).toBe('function');
    expect((await api.get('/status')).data.length).toBeGreaterThan(0);
});

test.each([undefined, 'false', '1'])('keeps the real adapter when REACT_APP_MOCK is %p', (flag) => {
    const api = loadApi(flag);
    expect(Array.isArray(api.defaults.adapter)).toBe(true);
    expect(sessionStorage.getItem('assy_user')).toBeNull();
});
```

(axios 1.x's default adapter is the array `['xhr', 'http', 'fetch']`. Ours is a function.)

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- --watchAll=false --testPathPattern=config/instance`
Expected: FAIL. The `"true"` case gets an array adapter.

- [x] **Step 3: Wire the adapter**

Replace `frontend/src/config/instance.js` with:

```js
import axios from 'axios';
import API from './constance';

export const backendApi = axios.create({
    baseURL: API.BACKEND,
    headers: { 'Content-Type': 'application/json' },
});

// Inline env check + require() lets the production build drop the whole mocks tree.
if (process.env.REACT_APP_MOCK === 'true') {
    require('../mocks').installMockMode(backendApi);
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npm test -- --watchAll=false --testPathPattern=config/instance`
Expected: PASS, 5 tests (the production-build test was added with option A).

- [x] **Step 5: Add `frontend/.env.example`** (changed during execution)

`.env` is git-ignored (root `.gitignore:2`) and Claude may not write it. So the guide `frontend/.env.example` is committed instead, with `REACT_APP_MOCK=false` and a commented `REACT_APP_MOCK_LATENCY`. Bundle safety comes from the `NODE_ENV !== 'production'` guard (option A), plus a test for it (5 tests in `instance.test.js`, full suite 13 suites / 122 tests).

- [x] **Step 6: Prove the mocks are not in the production bundle**

```powershell
npm run build
Select-String -Path build/static/js/*.js -Pattern "MOCK001","No mock for" | Measure-Object
```
Expected: `Count : 0`.

Positive control (proves the grep can find the mocks):
```powershell
npx cross-env REACT_APP_MOCK=true react-scripts build
Select-String -Path build/static/js/*.js -Pattern "MOCK001","No mock for" | Measure-Object
npm run build
```
Expected: `Count` greater than 0 for the mock build. The final `npm run build` puts back a clean `build/`.

If the first count is not 0, **stop**. The dead-code removal failed. Do not ship. Report back with the build output.

- [x] **Step 7: Manual smoke test in the browser**

Run `npm run dev:mock` and check each item:

| Route | Check |
|---|---|
| `/assembly/dashboard` | 4 cards > 0; Summary table has 2 rows; Detail tab shows today's rows and the Location dropdown |
| `/assembly/register` | No login prompt. Scan `DEMO000033`, then tag `NEWTAG1`: "Tag registered!" |
| `/assembly/gauging-room-f1` | Scan `NEWTAG1`: "Updated!". Scan it again: `INVALID_PROCESS` |
| `/assembly/mc-gauging-f1` | Scan `NEWTAG1`: "Updated!" |
| `/assembly/clear-tag` | Lot `DEMO000033` + tag `NEWTAG1` show MATCH; pick a process, EMP `MOCK001`, Clear: success. History tab lists it |
| `/assembly/dashboard` | The totals changed |
| `/assembly/mock-done` | 2 rows; add + delete work |
| `/assembly/management` | Users, Status, Process tabs list data; add/delete work (user edit is a known limitation) |
| `/assembly/reader-config` | 2 readers, GR F1 "Connected"; Save succeeds |
| Navbar sign-out, then open `/assembly/management` | Login with `MOCK001` / `DEMO1234` works |

- [x] **Step 8: Write the runbook**

Use the `runbook-docs` skill to write `docs/runbooks/frontend-mock-mode.md`. It must include:

- Purpose: run the UI with no backend, for demos and styling.
- Command: `npm run dev:mock` in `frontend/`.
- Env vars: `REACT_APP_MOCK` (set by the script), `REACT_APP_MOCK_LATENCY` (ms, default 250).
- Demo login: `MOCK001` / `DEMO1234` (admin), `MOCK002` / `DEMO1234` (user). All fake.
- Demo data: unregistered lots `DEMO000033` to `DEMO000040`; seeded lots cycle through the process steps.
- Data resets on page reload.
- The "Known limitations" table from this plan.
- How to add a mock for a new endpoint: a handler in `src/mocks/handlers/<domain>.js` plus a line in `CALLED_BY_APP`.

- [x] **Step 9: Run the full check**

Run: `npm test -- --watchAll=false`, then `npm run build`.
Expected: all tests PASS (13 suites, 122 tests) and the build succeeds with no new warnings.

- [x] **Step 10: Hand off**

Changed: `frontend/src/config/instance.js`, `frontend/src/config/instance.test.js`, `frontend/.env.example`, `docs/runbooks/frontend-mock-mode.md`.
Suggested message: `feat(frontend): enable mock mode via dev:mock`

---

### Task 12: Sidebar nav entries (real, not mock-only)

**Files:**
- Modify: `frontend/src/components/Layout/Sidebar.js:3-10` (imports), `:32-38` (`navItems`)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: sidebar links to all 8 routes in `src/App.js`, in every mode.

Decision (2026-09-29): the three routes become normal nav entries, not mock-only. Sidebar has no test coverage today, so no test is added (house rule: add tests on edit only when the file already has coverage).

- [x] **Step 1: Add the icons**

In the `@ant-design/icons` import, add `ToolOutlined` and `ApiOutlined`:

```js
import {
    ScanOutlined,
    DashboardOutlined,
    CheckOutlined,
    AppstoreOutlined,
    ClearOutlined,
    SettingOutlined,
    ToolOutlined,
    ApiOutlined,
} from '@ant-design/icons';
```

- [x] **Step 2: Add the nav entries**

Replace `navItems` with:

```js
    const navItems = [
        { label: 'Dashboard', icon: <DashboardOutlined />, path: '/assembly/dashboard' },
        { label: 'Register', icon: <ScanOutlined />, path: '/assembly/register' },
        { label: 'Gauging Room F1', icon: <ToolOutlined />, path: '/assembly/gauging-room-f1' },
        { label: 'MC Gauging F1', icon: <ToolOutlined />, path: '/assembly/mc-gauging-f1' },
        { label: 'Clear Tag', icon: <ClearOutlined />, path: '/assembly/clear-tag' },
        { label: 'Mock Done', icon: <CheckOutlined />, path: '/assembly/mock-done' },
        { label: 'Management', icon: <SettingOutlined />, path: '/assembly/management' },
        { label: 'Reader Config', icon: <ApiOutlined />, path: '/assembly/reader-config' },
    ];
```

- [x] **Step 3: Verify**

Run `npm run build`: it must succeed with no new warnings. Then, in `npm run dev:mock`, click each of the 8 entries and confirm the active highlight follows.

- [x] **Step 4: Hand off**

Changed: `frontend/src/components/Layout/Sidebar.js`.
Suggested message: `feat(frontend): link scan and reader-config pages in the sidebar`

---

### Task 13: Bruno collection into the repo + missing requests + example responses

**Files:**
- Create: `bruno/AYT-RFID/` at the repo root. Copy `opencollection.yml`, `.gitignore` and the 17 request files from `C:\Users\bpa8251\Documents\bruno\AYT-RFID\`. Do not change or delete the originals.
- Create: 16 new request files in `bruno/AYT-RFID/`, one per backend route not yet covered.
- Modify: all 33 request files, to add a `docs:` block with example responses.

**Interfaces:**
- Consumes: `backend/routes/assembly.js` (method, path, status codes, body fields) and `backend/services/*.js` (response shapes). Read-only.
- Produces: one request file per route in `backend/routes/assembly.js` (33 active routes).

**Rules:**
- Follow the existing file format exactly: `info` (name, type `http`, seq), `http` (method, url, body, `auth: inherit`), `settings` (same 5 keys as the existing files).
- URL prefix: `"{{urlPrefix}}/api/assembly/..."`. Keep the `urlPrefix` collection variable; do not rename it to `baseUrl`.
- Document the **backend** path. Scans are `POST /gauging-room-f1` and `POST /mc-gauging-f1` (the frontend calls `/gr_f1` and `/mc_f1`; that mismatch is a separate bug, not fixed here).
- Fake data only, matching the mock fixtures: lots `DEMO000001`–`DEMO000040`, tags `E2801160000xxxxx`, emp ids `MOCK001` / `MOCK002`, password `DEMO1234`, reader IPs `192.0.2.10` / `192.0.2.11`, parts `6204ZZCM` / `NS7S`, dates on `2026-09-29`.
- Example responses go in a `docs: |-` Markdown block: one `### <status> <case>` heading per case with a fenced `json` body. Cover the success case and each main error the route returns (e.g. 404 `LOT_NOT_FOUND`, 200 `{ "result": "INVALID_PROCESS" }`, 401 `INVALID_CREDENTIALS`, 500 `{ "error": "..." }` only if the route has a distinct 500 body).
- Response shapes must match what the route and service actually return. Where the frontend reads fewer fields, still document the full backend shape.

**Steps:**

- [x] **Step 1: Copy the collection.** Copy the 19 files to `bruno/AYT-RFID/`.
- [x] **Step 2: Replace real-looking data in the copies.**
  - `TH9H92698` → `DEMO000001` (in `Create Mock Lot.yml`, `Delete Mock Lots.yml`, `Get All Mock Lot.yml`, `Get One lot.yml`).
  - `Login.yml` body: `E001` / `changeme` → `MOCK001` / `DEMO1234`.
  - `User - Create.yml` body: `TEST01` / `changeme` → `MOCK099` / `DEMO1234`.
  - `Get All Mock Lot.yml`: remove the request body (a GET sends none).
- [x] **Step 3: Add the 16 missing requests**, seq 18 onward, file name `<Area> - <Action>.yml`:
  `GET /lot-by-tag/:tag_id`, `GET /lot-by-lot/:lot_no`, `POST /register-tag`, `POST /gauging-room-f1`, `POST /mc-gauging-f1`, `POST /change-process`, `POST /completed`, `GET /readers-config`, `PUT /readers-config`, `GET /readers-status`, `POST /readers-restart`, `GET /dashboard`, `GET /dashboard/history` (with query params `date_from`, `date_to`, `brg_type`, `wos`, `lot_no`, `status_id`, `location_name`), `GET /dashboard/process-summary`, `GET /dashboard/locations`, `GET /clear-tag/history` (query `date_from`, `date_to`).
- [x] **Step 4: Add a `docs:` block** with example responses to all 33 request files.
- [x] **Step 5: Check.**
  - Every route in `backend/routes/assembly.js` (not the commented-out ones) has exactly one request file, with matching method and path.
  - `Select-String -Path bruno/AYT-RFID/*.yml -Pattern "TH9H","changeme","E001"` returns nothing.
  - Every file parses as YAML: `node -e "const y=require('yaml');..."` is not available, so use `npx --yes yaml-lint bruno/AYT-RFID/*.yml` if it works offline; otherwise, report that the check was skipped.
- [x] **Step 6: Hand off.** Do not send any request. The user runs Bruno against a real backend. Suggested message: `docs(api): move Bruno collection into repo and document all assembly routes`

---

## Execution: model, effort, where it runs

```
Subagent `implementer` (Sonnet 5, medium), sequential:   tasks 1 → 2 → 3 → 4
Subagent `implementer` x2 in parallel (Sonnet 5, medium): group A: task 5, task 6
Subagent `implementer` x3 in parallel (Sonnet 5, medium): group B: task 7, task 8, task 9
Subagent `implementer` (Sonnet 5, medium):                task 10
Main session (Opus 5.5, high):                            task 11 (bundle check is the risky step)
Subagent `quick-edit` (Haiku 4.5, low):                   task 12 (any time)
Subagent `implementer` (Sonnet 5, medium):                task 13 (parallel with tasks 1–4; different files)
Subagent `code-reviewer`:                                 whole-branch review at the end
```

The main session checks each subagent report, and runs that task's test command itself, before it marks the task `[x]`.
