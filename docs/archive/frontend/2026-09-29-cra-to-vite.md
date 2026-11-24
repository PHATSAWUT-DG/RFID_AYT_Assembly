# CRA to Vite Migration (Phase 1) Implementation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans, one task at a time, in the main session. No subagents. After each task: show the diff, wait for the user's review. Never run `git add` / `git commit` / `git mv` — the user stages and commits. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Create React App (`react-scripts` 5, webpack, Jest) with Vite 8 + Vitest 4 in `frontend/`. The code stays JavaScript. The app, the tests and mock mode work the same as before.

**Architecture:** Five small tasks. Each task leaves the app working. The order lets CRA and the new tools live side by side until the switch: first rename JSX files (CRA accepts `.jsx`), then move the mock guard to a form both bundlers understand, then swap Jest for Vitest while CRA still builds, then swap the dev server/build to Vite, then replace the ESLint config.

**Tech Stack:** React 19.2, Vite 8 (Rolldown bundler + Oxc transform; esbuild is no longer the default in Vite 8), `@vitejs/plugin-react`, Vitest 4.1 + jsdom, Tailwind 3.4 via PostCSS, ESLint 9 flat config.

**Spec:** No separate spec. The design was agreed in chat on 2026-09-29 (option A: Vite first in JS, TypeScript later in a separate Phase 2 plan).

## Status

> **Archived 2026-11-24: completed.** The table below was not updated after Task 3. The code shows Tasks 4–5 are done: `frontend/vite.config.js`, `frontend/eslint.config.js`, Vite scripts in `frontend/package.json`.

| # | Task | Status | Model / where |
|---|---|---|---|
| 1 | Rename JSX files `.js` → `.jsx` | `[DONE]` | Main session (Sonnet 5, medium) |
| 2 | Move mock guard to entry + automatic bundle check | `[DONE]` | Main session (Sonnet 5, high) |
| 3 | Jest → Vitest | `[DONE]` | Main session (Sonnet 5, medium) |
| 4 | CRA → Vite dev server and build, `REACT_APP_*` → `VITE_*` | `[~]` file edits done; install/run steps blocked (shell check failing) | Main session (Opus 5.5, high) |
| 5 | ESLint flat config + README | `[ ]` | Main session (Sonnet 5, medium) |

All tasks share decisions and build on each other, so all run in the main session. Run `/compact` before Task 4 if context is over 50%.

## Global Constraints

- Node/npm commands run in `frontend/`. Shell is PowerShell.
- Baseline before Task 1: Jest, 13 suites / 128 tests pass (measured 2026-09-29).
- Mock code must never be in the production bundle. Markers that must not appear in `build/**/*.js`: `No mock for`, `MOCK001`.
- Dev server port stays `3000`. Build output folder stays `build/` (already git-ignored in `frontend/.gitignore:12`).
- Keep `cross-env` for `dev:mock`. Vite does not override an env var that already exists, same as CRA's dotenv.
- Claude must not create or edit `frontend/.env` (git-ignored, may hold real values). The user renames variables in their own `.env` in Task 4.
- No TypeScript in this plan. `typescript@^4.9.5` stays untouched until Phase 2.

## Review Focus

1. **Mock code in a production bundle.** Expected: `npm run build` fails when a mock marker is in `build/`. Test: Task 2 Step 4 (fake marker) and Task 4 Step 12 (real dev-mode build with mocks on).
2. **An old `REACT_APP_*` variable is still set on a dev machine or build server.** Expected: the build stops with a clear error, instead of silently using the localhost default URL in production. Test: Task 4 Step 13.
3. **Mock mode: the first request goes out before the mock adapter is installed.** Expected: the app renders only after the adapter is in place, so no request reaches the real backend. Test: Task 2 Step 7 and Task 4 Step 15 (user browser check, network tab).
4. **Tailwind classes missing after the switch to Vite's PostCSS.** Expected: the built CSS still contains Tailwind utilities. Test: Task 4 Step 11.
5. **Deep link refresh in dev** (reload on `/management` etc.). Expected: the page loads, no 404. Test: Task 4 Step 15 (user browser check).

---

### Task 1: Rename JSX files `.js` → `.jsx`

Vite 8's Oxc transform skips JSX in `.js` files by default (`exclude: /\.js$/`). CRA accepts `.jsx` too, so this rename is safe while CRA still runs. No file content changes. No import changes (no import in `src/` uses an explicit `.js` extension — checked).

**Files (rename only, 19 files):**
- `src/index.js`, `src/App.js`
- `src/components/LoginModal.js`, `src/components/SecureRoute.js`
- `src/components/Layout/Footer.js`, `Layout.js`, `Navbar.js`, `Sidebar.js`
- `src/pages/Assembly/ClearTag.js`, `Dashboard.js`, `Management.js`, `MockDone.js`, `ReaderConfig.js`, `Register.js`, `RegisterSingle.js`, `ScanTag.js`
- `src/pages/Assembly/Management/ProcessTab.js`, `StatusTab.js`, `UserTab.js`

Stays `.js`: everything in `src/mocks/`, `src/config/`, `reportWebVitals.js`, `setupTests.js`, all `*.test.js` (none contain JSX).

**Interfaces:** Produces: entry file is `src/index.jsx`.

Principle bent: 19 files > 5-file task size. It is one mechanical rename with zero content change, so it stays one task.

- [x] **Step 1: Rename the files**

Run in `frontend/` (PowerShell `Move-Item`, not `git mv`, because `git mv` stages):

```powershell
$files = @(
  'src/index.js','src/App.js',
  'src/components/LoginModal.js','src/components/SecureRoute.js',
  'src/components/Layout/Footer.js','src/components/Layout/Layout.js','src/components/Layout/Navbar.js','src/components/Layout/Sidebar.js',
  'src/pages/Assembly/ClearTag.js','src/pages/Assembly/Dashboard.js','src/pages/Assembly/Management.js','src/pages/Assembly/MockDone.js',
  'src/pages/Assembly/ReaderConfig.js','src/pages/Assembly/Register.js','src/pages/Assembly/RegisterSingle.js','src/pages/Assembly/ScanTag.js',
  'src/pages/Assembly/Management/ProcessTab.js','src/pages/Assembly/Management/StatusTab.js','src/pages/Assembly/Management/UserTab.js'
)
foreach ($f in $files) { Move-Item $f ($f -replace '\.js$', '.jsx') }
```

- [x] **Step 2: Check no JSX is left in `.js` files**

Use the Grep tool: pattern `return \(|<[A-Z][A-Za-z]*[ />]|</`, path `frontend/src`, glob `*.js`.
Expected: no matches.

- [x] **Step 3: Run tests**

Run: `$env:CI='true'; npx react-scripts test --watchAll=false`
Expected: 13 suites / 128 tests pass.

- [ ] **Step 4: Run the CRA build**

Run: `npm run build`
Expected: `Compiled successfully` (warnings that existed before are fine).

- [x] **Step 5: Hand off**

Show `git status` to the user. Suggested commit: `refactor(frontend): rename JSX files to .jsx`.

---

### Task 2: Move mock guard to the entry file + automatic bundle check

Today `src/config/instance.js:11-13` installs mocks with a synchronous `require()`. Vite and Vitest run ES modules, so `require()` of an ESM source file fails there. The new form is a dynamic `import()` in the entry file, and the app renders only after mock mode is installed. Webpack (now) and Rolldown (Task 4) both drop a dynamic import inside a branch that is constant-false in production.

The unit test for the guard (`src/config/instance.test.js`) goes away, because `instance.js` has no logic left. The production guard is proven better by checking the real build output. A new script runs after every `npm run build` and fails the build if a mock marker is found. This turns the manual "Production safety check" in the runbook into an automatic one.

**Files:**
- Modify: `src/index.jsx` (whole file)
- Modify: `src/config/instance.js:1-13`
- Delete: `src/config/instance.test.js` (5 tests; "mock adapter works" is still covered by `src/mocks/index.test.js`)
- Create: `scripts/check-no-mocks.mjs`
- Modify: `package.json:26` (`build` script)
- Modify: `docs/runbooks/frontend-mock-mode.md` (`../docs/runbooks/...` from `frontend/`): section "Production safety check", line 13

**Interfaces:**
- Consumes: `installMockMode(api)` from `src/mocks/index.js` (unchanged), `backendApi` from `src/config/instance.js`.
- Produces: `node scripts/check-no-mocks.mjs [dir]` — `dir` defaults to `build`. Exit code 0 = clean, 1 = marker found (prints file and marker), 2 = folder missing.

- [x] **Step 1: Write the check script**

`scripts/check-no-mocks.mjs`:

```js
// Fails the build when mock-only code reaches the production bundle.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MARKERS = ['No mock for', 'MOCK001'];
const dir = process.argv[2] ?? 'build';

if (!existsSync(dir)) {
    console.error(`check-no-mocks: folder "${dir}" not found. Run the build first.`);
    process.exit(2);
}

const jsFiles = readdirSync(dir, { recursive: true })
    .filter((file) => file.endsWith('.js'))
    .map((file) => join(dir, file));

const hits = jsFiles.flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    return MARKERS.filter((marker) => text.includes(marker)).map((marker) => `${file}: "${marker}"`);
});

if (hits.length > 0) {
    console.error('check-no-mocks: mock code found in the production bundle:');
    hits.forEach((hit) => console.error(`  ${hit}`));
    process.exit(1);
}

console.log(`check-no-mocks: OK (${jsFiles.length} JS files checked)`);
```

- [x] **Step 2: Prove the script fails on a marker (red)**

Run:

```powershell
$d = Join-Path $env:TEMP 'no-mocks-red'; New-Item -ItemType Directory -Force $d | Out-Null
Set-Content -Encoding utf8 (Join-Path $d 'a.js') 'console.warn("[mock] No mock for GET /x")'
node scripts/check-no-mocks.mjs $d; "exit=$LASTEXITCODE"
Remove-Item -Recurse -Force $d
```

Expected: prints `...a.js: "No mock for"` and `exit=1`.

(The `Set-Content` line writes a throwaway test file in the temp folder, not project content.)

- [x] **Step 3: Wire it into the build**

`package.json` scripts:

```json
"build": "react-scripts build && node scripts/check-no-mocks.mjs",
```

- [x] **Step 4: Replace the guard in `src/config/instance.js`**

Whole file:

```js
import axios from 'axios';
import API from './constance';

export const backendApi = axios.create({
    baseURL: API.BACKEND,
    headers: { 'Content-Type': 'application/json' },
});
```

- [x] **Step 5: Install mock mode from the entry file**

`src/index.jsx`, whole file:

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { backendApi } from './config/instance';

const root = ReactDOM.createRoot(document.getElementById('root'));
const renderApp = () => root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Inline env check + dynamic import let the production build drop the whole mocks tree.
// Render waits for the install, so no request can reach the real backend in mock mode.
if (process.env.NODE_ENV !== 'production' && process.env.REACT_APP_MOCK === 'true') {
  import('./mocks').then(({ installMockMode }) => {
    installMockMode(backendApi);
    renderApp();
  });
} else {
  renderApp();
}

reportWebVitals();
```

- [x] **Step 6: Delete the old guard test**

Run: `Remove-Item src/config/instance.test.js`

- [x] **Step 7: Run tests and the build (green)**

Run: `$env:CI='true'; npx react-scripts test --watchAll=false`
Expected: 12 suites / 123 tests pass.

Run: `$env:REACT_APP_MOCK='true'; npm run build; Remove-Item Env:REACT_APP_MOCK`
Expected: `Compiled successfully` and `check-no-mocks: OK (...)`. The flag is forced on to prove the guard holds even then.

Ask the user to run `npm run dev:mock`, open the browser network tab, and reload. Expected: screens show demo data; no request goes to the backend URL.

- [x] **Step 8: Update the runbook**

In `docs/runbooks/frontend-mock-mode.md`:
- Line 13 becomes: `- Allowed environment: local dev server only. \`npm run build\` always drops the mock code, and fails if any mock code is left in \`build/\` (\`scripts/check-no-mocks.mjs\`).`
- Replace the section "Production safety check" (lines 57-63) with:

```markdown
## Production safety check
Automatic. `npm run build` runs `scripts/check-no-mocks.mjs` after the bundle is written. It fails the build if `build/**/*.js` contains `No mock for` or `MOCK001`.
To prove the guard holds with the flag forced on (folder: `frontend/`):

    $env:REACT_APP_MOCK='true'; npm run build; Remove-Item Env:REACT_APP_MOCK

Pass: `check-no-mocks: OK`. Fail: the build exits with an error and lists the files. Do not ship. Check the mock guard in `src/index.jsx`.
```

- [x] **Step 9: Hand off**

Suggested commit: `refactor(frontend): install mock mode from entry and check bundle for mock code`.

---

### Task 3: Jest → Vitest

CRA still runs `start` and `build` in this task. Only the test runner changes. Source code still reads `process.env.*`; `vi.stubEnv` sets both `process.env` and `import.meta.env`, so the tests work now and after Task 4.

**Files:**
- Create: `vite.config.js`
- Modify: `package.json` (`test` script, remove `jest` block at lines 30-34, add dev deps)
- Modify: `src/setupTests.js`
- Modify: `src/mocks/config.test.js`, `src/mocks/index.test.js`, `src/mocks/adapter.test.js`

**Interfaces:**
- Produces: `npm test` = Vitest watch; `npx vitest run` = single run. `vite.config.js` holds the `test` block that Task 4 extends.
- Test globals: `describe/test/expect/beforeEach/afterEach` stay global (`globals: true`), so the 9 other test files do not change. `vi` is always imported from `vitest` explicitly.

- [ ] **Step 1: Install**

Run: `npm i -D vitest@^4.1 jsdom`
Then: `npm ls vitest vite` — expected: no `UNMET PEER` or `invalid` lines.

- [ ] **Step 2: Create `vite.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: './src/setupTests.js',
        unstubEnvs: true,
    },
});
```

- [ ] **Step 3: Update `package.json`**

- `"test": "vitest",`
- Delete the `"jest": { ... }` block (the axios `moduleNameMapper` was only a Jest CJS workaround).

- [ ] **Step 4: Update `src/setupTests.js`**

```js
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Update `src/mocks/config.test.js`**

Whole file:

```js
import { vi } from 'vitest';

describe('mock config', () => {
    afterEach(() => {
        vi.resetModules();
    });

    test('MOCK_LATENCY_MS defaults to 250', async () => {
        vi.stubEnv('REACT_APP_MOCK_LATENCY', undefined);
        expect((await import('./config')).MOCK_LATENCY_MS).toBe(250);
    });

    test('MOCK_LATENCY_MS reads REACT_APP_MOCK_LATENCY, including 0', async () => {
        vi.stubEnv('REACT_APP_MOCK_LATENCY', '0');
        expect((await import('./config')).MOCK_LATENCY_MS).toBe(0);
    });
});
```

- [ ] **Step 6: Update `src/mocks/index.test.js` lines 1-14 and 24**

```js
import axios from 'axios';
import { vi } from 'vitest';

beforeEach(() => {
    sessionStorage.clear();
    vi.stubEnv('REACT_APP_MOCK_LATENCY', '0');
    vi.resetModules();
});

test('installs the adapter and seeds the admin session', async () => {
    const { installMockMode } = await import('./index');
```

(The `afterEach` that deleted the env var is removed; `unstubEnvs: true` restores it.) In the second test, line 24 becomes:

```js
    const { installMockMode } = await import('./index');
```

- [ ] **Step 7: Update `src/mocks/adapter.test.js`**

- Line 1-2: add `import { vi } from 'vitest';` under the axios import.
- Lines 21, 32: `jest.fn(` → `vi.fn(`
- Line 55: `jest.spyOn(` → `vi.spyOn(`

- [ ] **Step 8: Check no Jest API is left**

Use the Grep tool: pattern `jest\.`, path `frontend/src`. Expected: no matches.

- [ ] **Step 9: Run tests**

Run: `npx vitest run`
Expected: 12 files / 123 tests pass. Same count as the end of Task 2.

Run: `npm run build` — expected: still passes (CRA ignores `vite.config.js`).

- [ ] **Step 10: Hand off**

Suggested commit: `test(frontend): switch test runner from Jest to Vitest`.

---

### Task 4: CRA → Vite dev server and build, `REACT_APP_*` → `VITE_*`

This is the atomic switch. `react-scripts` is removed as the **last** code step, because the lint hook depends on it until Task 5.

Principle bent: about 13 files, over the 5-file size. The switch cannot be split: CRA and Vite read different env names, and a half-switch does not run. Each file change is small (about 150 lines in total).

**Files:**
- Move + modify: `public/index.html` → `index.html`
- Modify: `vite.config.js`
- Create: `postcss.config.js`
- Modify: `tailwind.config.js:2` (`module.exports` → `export default`)
- Modify: `package.json` (scripts, `"type": "module"`, deps; `eslintConfig` stays until Task 5)
- Modify: `src/index.jsx` (guard line)
- Modify: `src/config/constance.js:2`
- Modify: `src/mocks/config.js:1-3`
- Modify: `src/mocks/config.test.js`, `src/mocks/index.test.js` (env names)
- Modify: `.env.example`
- Modify: `docs/runbooks/frontend-mock-mode.md` (env names, commands)

**Interfaces:**
- Consumes: `vite.config.js` `test` block (Task 3), `scripts/check-no-mocks.mjs` (Task 2).
- Produces: env names `VITE_MOCK`, `VITE_MOCK_LATENCY`, `VITE_API_BACKEND`. Scripts: `start`, `dev:mock`, `build`, `preview`, `test`.

- [!] BLOCKED **Step 1: Install** — shell safety check returned no verdict (transient). Unblock: re-run, or the user runs it.

Run: `npm i -D vite@^8 @vitejs/plugin-react@latest postcss autoprefixer`
Then: `npm ls vite vitest @vitejs/plugin-react` — expected: one `vite@8.x`, no `UNMET PEER` / `invalid`. If `@vitejs/plugin-react@latest` does not accept Vite 8, stop and report (do not force install).

- [~] **Step 2: Move and update `index.html`** — `frontend/index.html` written; `public/index.html` not yet deleted (needs shell)

Run: `Move-Item public/index.html index.html`

Then write `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="/logo.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="RFID Assembly AYT" />
    <link rel="apple-touch-icon" href="/logo192.png" />
    <link rel="manifest" href="/manifest.json" />
    <title>RFID Assembly AYT</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
    <script type="module" src="/src/index.jsx"></script>
  </body>
</html>
```

- [x] **Step 3: Update `vite.config.js`** — done, `vite.config.js:1-23`

```js
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // Old CRA names are ignored by Vite. Fail loudly instead of silently using defaults.
    const legacy = Object.keys({ ...loadEnv(mode, process.cwd(), 'REACT_APP_'), ...process.env })
        .filter((key) => key.startsWith('REACT_APP_'));
    if (legacy.length > 0) {
        throw new Error(`Rename these env variables to VITE_*: ${legacy.join(', ')}. See .env.example.`);
    }

    return {
        plugins: [react()],
        server: { port: 3000 },
        build: { outDir: 'build' },
        test: {
            environment: 'jsdom',
            globals: true,
            setupFiles: './src/setupTests.js',
            unstubEnvs: true,
        },
    };
});
```

Note: `test` inside a `vite` `defineConfig` is read by Vitest; the import changes from `vitest/config` to `vite` because the config is now a function with `loadEnv`.

- [x] **Step 4: PostCSS and Tailwind config** — `postcss.config.js` created, `tailwind.config.js:2`

`postcss.config.js`:

```js
export default {
    plugins: {
        tailwindcss: {},
        autoprefixer: {},
    },
};
```

`tailwind.config.js` line 2: `module.exports = {` → `export default {`

- [x] **Step 5: Update `package.json`** — `"type": "module"` at `package.json:5`, scripts at `package.json:24-29`

- Add top-level `"type": "module",` after `"private": true,`.
- Scripts:

```json
"scripts": {
  "start": "vite",
  "dev:mock": "cross-env VITE_MOCK=true vite",
  "build": "vite build && node scripts/check-no-mocks.mjs",
  "preview": "vite preview",
  "test": "vitest"
},
```

- Keep `browserslist` (autoprefixer reads it). Keep `eslintConfig` for now (Task 5).

- [x] **Step 6: Env reads in source** — `src/index.jsx:17`, `src/config/constance.js:2`, `src/mocks/config.js:1-3`

`src/index.jsx`, guard line:

```jsx
if (import.meta.env.DEV && import.meta.env.VITE_MOCK === 'true') {
```

`src/config/constance.js:2`:

```js
    BACKEND: import.meta.env.VITE_API_BACKEND || 'http://localhost:5001/api/assembly',
```

`src/mocks/config.js`, whole file:

```js
export const MOCK_LATENCY_MS = import.meta.env.VITE_MOCK_LATENCY === undefined
    ? 250
    : Number(import.meta.env.VITE_MOCK_LATENCY);
```

- [x] **Step 7: Env names in tests** — `src/mocks/config.test.js:9,13,14`, `src/mocks/index.test.js:6`

`src/mocks/config.test.js`: every `REACT_APP_MOCK_LATENCY` → `VITE_MOCK_LATENCY` (3 places, including the test name).
`src/mocks/index.test.js`: `vi.stubEnv('REACT_APP_MOCK_LATENCY', '0')` → `vi.stubEnv('VITE_MOCK_LATENCY', '0')`.

- [ ] **Step 8: Remove CRA**

Run: `npm uninstall react-scripts`
Then use the Grep tool: pattern `REACT_APP_|process\.env|react-scripts`, path `frontend`, glob `!{node_modules,build,docs}/**`. Expected: matches only in `vite.config.js` (the legacy check) and `.env.example` (the rename note, after Step 9). Any other match is a missed rename: fix it.

- [x] **Step 9: `.env.example`** — whole file replaced

Whole file:

```bash
# Frontend environment. Copy this file to `.env` in this folder (frontend/).
# `.env` is git-ignored. Put no secrets here: every VITE_* value is compiled into the browser bundle.
# Vite reads these at start/build time. Restart `npm start` after a change.
# Old REACT_APP_* names stop the build with an error. Rename them to VITE_*.

# Mock mode. `true` = axios uses the in-memory mock adapter (no backend). Any other value = real backend.
# Keep `false` here. `npm run dev:mock` sets it to `true` for that run only.
# Ignored by `npm run build`: a production build never contains the mock code (see src/index.jsx).
VITE_MOCK=false

# Optional. Fake network delay in ms for every mock response, to show loading states. Default 250.
# Used only when VITE_MOCK=true.
# VITE_MOCK_LATENCY=250

# Backend API URL. Defaults to localhost for development.
VITE_API_BACKEND=http://localhost:5001/api/assembly
```

- [ ] **Step 10: User renames their own `.env`**

Ask the user to rename in `frontend/.env`: `REACT_APP_MOCK` → `VITE_MOCK`, `REACT_APP_MOCK_LATENCY` → `VITE_MOCK_LATENCY`, `REACT_APP_API_BACKEND` → `VITE_API_BACKEND`. Same for any build server or CI that sets these. Wait for "done".

- [ ] **Step 11: Tests + build + Tailwind check**

Run: `npx vitest run` — expected: 12 files / 123 tests pass.
Run: `npm run build` — expected: Vite build succeeds, then `check-no-mocks: OK (...)`.
Use the Grep tool: pattern `\.flex\{`, path `frontend/build/assets`, glob `*.css`. Expected: at least one match (Tailwind utilities are in the CSS).

- [ ] **Step 12: Prove the bundle check catches a dev build with mocks (red)**

Run:

```powershell
npx cross-env NODE_ENV=development VITE_MOCK=true vite build --mode development
node scripts/check-no-mocks.mjs; "exit=$LASTEXITCODE"
npm run build
```

Expected: first check prints mock markers and `exit=1` (mocks are included when `DEV` is true). The last `npm run build` passes with `check-no-mocks: OK` and leaves a clean `build/`.

If the dev build does **not** contain markers, the red test proves nothing: stop and report.

- [ ] **Step 13: Prove the legacy env check (red)**

Run: `$env:REACT_APP_API_BACKEND='http://example.invalid'; npx vite build; "exit=$LASTEXITCODE"; Remove-Item Env:REACT_APP_API_BACKEND`
Expected: error `Rename these env variables to VITE_*: REACT_APP_API_BACKEND` and a non-zero exit.

- [x] **Step 14: Update the runbook** — `docs/runbooks/frontend-mock-mode.md:11-13,23-24,55,61`

In `docs/runbooks/frontend-mock-mode.md` replace every `REACT_APP_MOCK_LATENCY` → `VITE_MOCK_LATENCY`, `REACT_APP_MOCK` → `VITE_MOCK`. Also:
- Parameters table example: `npx cross-env VITE_MOCK=true VITE_MOCK_LATENCY=1500 vite`
- "Add a mock" step 4: `npx vitest run src/mocks`
- Production safety check command: `$env:VITE_MOCK='true'; npm run build; Remove-Item Env:VITE_MOCK`
- Line 13: `npm run build` drops the mock code because `import.meta.env.DEV` is `false` in a production build.

- [ ] **Step 15: User browser check**

Ask the user to run in `frontend/`:
1. `npm run dev:mock` → open `http://localhost:3000`. Network tab: no request to the backend URL. Screens show demo data. Log in / out works.
2. Go to a deep route (for example the Management page), press F5. Expected: the page reloads, no 404.
3. `npm start` with the real backend running → one screen loads real data.
Send back: pass/fail per item, any console error text.

- [ ] **Step 16: Hand off**

Suggested commit: `build(frontend): migrate from Create React App to Vite`, with body noting the `REACT_APP_*` → `VITE_*` rename (breaking for local `.env` files).

---

### Task 5: ESLint flat config + README

`eslint-config-react-app` came with `react-scripts` and is gone after Task 4. The PostToolUse lint hook needs a working config. The new config keeps the same level as CRA for hooks: `rules-of-hooks` = error, `exhaustive-deps` = warn. The newer React Compiler rules in `eslint-plugin-react-hooks` "recommended" are **not** turned on here; they would flag existing code and change behavior, which is out of scope.

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json` (remove `eslintConfig`, add `lint` / `lint:fix` scripts, dev deps)
- Modify: `README.md` (replace CRA boilerplate)

**Interfaces:** Produces: `npm run lint`, `npm run lint:fix`.

- [ ] **Step 1: Install**

Run: `npm i -D eslint@^9 @eslint/js@^9 globals eslint-plugin-react-hooks eslint-plugin-react-refresh`
Then: `npm ls eslint` — expected: no `UNMET PEER` / `invalid`.

- [ ] **Step 2: Create `eslint.config.js`**

```js
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
    globalIgnores(['build']),
    {
        files: ['**/*.{js,jsx,mjs}'],
        extends: [js.configs.recommended],
        plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
        languageOptions: {
            globals: globals.browser,
            parserOptions: { ecmaFeatures: { jsx: true } },
        },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
            // Components used only in JSX look unused to core ESLint.
            'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
        },
    },
    {
        files: ['**/*.test.js', 'src/setupTests.js'],
        languageOptions: { globals: globals.jest },
    },
    {
        files: ['vite.config.js', 'postcss.config.js', 'tailwind.config.js', 'eslint.config.js', 'scripts/**'],
        languageOptions: { globals: globals.node },
    },
]);
```

- [ ] **Step 3: Update `package.json`**

- Delete the `"eslintConfig": { ... }` block.
- Add scripts: `"lint": "eslint .",` and `"lint:fix": "eslint . --fix",`

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: exit 0, or only warnings. If errors appear, list them to the user with `file:line` and rule. Fix only config-caused errors (for example a missing global). Real code errors are reported, not fixed, unless the user says so.

- [ ] **Step 5: Replace `README.md`**

```markdown
# RFID Assembly — frontend

React 19 + Vite. Tests: Vitest.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and set the values. Only `VITE_*` names are read.

## Scripts (run in `frontend/`)
| Command | What it does |
|---|---|
| `npm start` | Dev server on http://localhost:3000, real backend |
| `npm run dev:mock` | Dev server with fake data, no backend. See `../docs/runbooks/frontend-mock-mode.md` |
| `npm test` | Vitest in watch mode. `npx vitest run` for one run |
| `npm run build` | Production build to `build/`, then checks that no mock code is in it |
| `npm run preview` | Serve `build/` locally |
| `npm run lint` / `lint:fix` | ESLint |
```

- [ ] **Step 6: Full check**

Run: `npm run lint`, `npx vitest run`, `npm run build`.
Expected: lint exit 0 (warnings OK), 12 files / 123 tests pass, `check-no-mocks: OK`.

- [ ] **Step 7: Hand off**

Suggested commit: `build(frontend): replace CRA ESLint config with flat config`.

---

## After Phase 1 (not in this plan)

- Phase 2: TypeScript (completed via `frontend/docs/2026-09-29-jsx-to-tsx.md`, Tasks 1–19).
- `frontend/docs/2026-09-14-frontend-mock-mode.md` still describes the CRA setup. It is a finished historical plan; leave it as is.
