# Frontend mock mode

## Purpose
Run the frontend UI with no backend and no database. Use it for demos, UI flow reviews and styling work.
Do not use it to test the real API or real data. All data is fake and lives in memory in the browser.

## Prerequisites
- Node.js and npm, with `npm install` done in `frontend/`.
- `frontend/.env` exists. First time: copy `frontend/.env.example` to `frontend/.env`. `.env` is git-ignored; `.env.example` lists every variable and is the guide.
- Environment variables (names only):
  - `VITE_MOCK` — turns mock mode on. The `dev:mock` script sets it to `true`. `frontend/.env` keeps it `false` for normal runs and builds.
  - `VITE_MOCK_LATENCY` — fake network delay in ms. Optional.
- Allowed environment: local dev server only. `npm run build` always drops the mock code, because `import.meta.env.DEV` is `false` in a production build. It also fails if any mock code is left in `build/` (`scripts/check-no-mocks.mjs`).

## Command
Folder: `frontend/`

    npm run dev:mock

## Parameters
| Flag / mode | Meaning | Default | Example |
|---|---|---|---|
| `VITE_MOCK` | `true` = axios uses the in-memory mock adapter. Any other value = real backend. Ignored in production builds | `false` (from `frontend/.env`) | set by `dev:mock` |
| `VITE_MOCK_LATENCY` | Delay in ms added to every mock response, to show loading states | `250` | `npx cross-env VITE_MOCK=true VITE_MOCK_LATENCY=1500 vite` |

## Demo data
All values are fake.

| Item | Value |
|---|---|
| Admin login | `MOCK001` / `DEMO1234` |
| User login | `MOCK002` / `DEMO1234` |
| Session | The admin user is signed in automatically on first load |
| Unregistered lots (use on Register) | `DEMO000033` to `DEMO000040` |
| Registered lots | `DEMO000001` to `DEMO000032`. They cycle through the process steps (registered, Gauging Room F1, MC Gauging F1, cleared), spread over the last 3 days |

Data resets on every page reload.

## Known limitations
These mirror the real API. The pages are not changed for mock mode.

| Behaviour in mock mode | Cause in real code |
|---|---|
| Editing a user always warns "กรอกข้อมูลให้ครบ" | `UserTab.js:47` copies `u.password` into the form, but `GET /login/users` never returns the password |
| A wrong password shows "ไม่สามารถเชื่อมต่อได้" | `/login` returns 401, and `LoginModal.js:26` treats every error as a connection error |
| Editing a status unlinks it from its process | `StatusTab.js:31` does not send `process_id`, and `updateStatus` writes `NULL` |
| Clear Tag succeeds only for lots at MC Gauging F1 | `Stored_tb_assy_completed` requires `status_id = 3`. The Process dropdown only feeds the remark |
| The store resets on every page reload | In-memory by design |
| Between 00:00 and 07:00 local time, the "today" filters show yesterday | The pages build "today" with `toISOString()` (UTC) |

## Add a mock for a new endpoint
1. Add or update the Bruno request first. Build the mock response from its example response.
2. Add a handler to `frontend/src/mocks/handlers/<domain>.js`. Contract: `({ params, query, body }) => ({ status?, data })`. `params` values are strings.
3. Add the method and path to `CALLED_BY_APP` in `frontend/src/mocks/handlers/index.test.js`, and update the count in that test.
4. Run `npx vitest run src/mocks` in `frontend/`.

## Production safety check
Automatic. `npm run build` runs `scripts/check-no-mocks.mjs` after the bundle is written. It fails the build if `build/**/*.js` contains `No mock for` or `MOCK001`.
To prove the guard holds with the flag forced on (folder: `frontend/`):

    $env:VITE_MOCK='true'; npm run build; Remove-Item Env:VITE_MOCK

Pass: `check-no-mocks: OK`. Fail: the build exits with an error and lists the files. Do not ship. Check the mock guard in `src/index.jsx`.

## Expected output
- Pass: the dev server opens the app. Screens show demo data. No request goes to the backend.
- Fail: requests to the backend URL in the browser network tab, or "No mock for ..." errors (an endpoint has no handler).

## Stop and clean up
Stop the dev server with `Ctrl+C`. Nothing to clean up. The data lives only in the browser tab.

## Who runs it
User runs it (browser check). All calls are mocked, so Claude may run the unit tests and the production safety check.
Send back: which screen or step failed, and any console error text.
