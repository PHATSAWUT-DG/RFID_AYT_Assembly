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
| `npm run typecheck` | TypeScript type checking |
| `npm run build` | Production build to `build/`, then checks that no mock code is in it |
| `npm run preview` | Serve `build/` locally |
| `npm run lint` / `lint:fix` | ESLint |
