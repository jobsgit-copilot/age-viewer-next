# Apache AGE Viewer (v2)

Web-based UI for visualizing graph data stored in PostgreSQL with the
[Apache AGE](https://age.apache.org/) extension. This is a full rewrite of the
original age-viewer on **Node 24 + TypeScript**, API-compatible with the
legacy backend.

- Backend: Express 5, TypeScript (ESM, native type stripping — no build step in dev)
- Frontend: Vite, React 19, TypeScript, antd 5, Redux Toolkit 2 (RTK Query)
- The HTTP API contract is specified in [`docs/api-contract.md`](docs/api-contract.md)

## Requirements

- **Node.js >= 24** (uses native TypeScript type stripping)
- PostgreSQL with the Apache AGE extension

## Quick start

Start a database (credentials expected by the tests are `TEST`/`TEST`/`TEST`):

```bash
docker run -d --name age-testdb -p 5432:5432 \
  -e POSTGRES_USER=TEST -e POSTGRES_PASSWORD=TEST -e POSTGRES_DB=TEST \
  apache/age:latest
```

Install and run (npm workspaces, single install at the root):

```bash
npm install
npm run dev:backend   # Express API on http://localhost:3001
npm run dev:front     # Vite dev server on http://localhost:3000 (proxies /api → 3001)
```

Open http://localhost:3000 and connect with host `localhost`, port `5432`,
database/user/password `TEST`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev:backend` | Backend dev server with `node --watch` (auto-restart) |
| `npm run dev:front` | Frontend Vite dev server |
| `npm run build` | Build both workspaces (`tsc` → `backend/build`, Vite → `frontend/build`) |
| `npm start` | Run the backend from TypeScript source |
| `npm test` | Run both test suites |

In production the backend serves `frontend/build` as static files — build
first, then run the compiled server:

```bash
npm run build
cd backend && npm run start:build   # http://localhost:3001 serves the full app
```

## Testing

```bash
npm test                 # backend node:test + frontend vitest

cd backend && npm test   # backend only (needs the test DB above)
cd frontend && npm test  # frontend only (jsdom, no DB needed)
```

Backend tests include parser golden tests (no DB) and API/contract tests
against the live test database. Useful frontend checks:

```bash
cd frontend
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
```

## Not implemented (yet)

- **Dockerfile** — no container image build; run directly with Node as shown above.
- **GitHub Actions CI** — no automated pipeline; run `npm test` locally (backend + frontend).

## Project layout

```
backend/
  src/
    bin/www.ts        entry point
    routes/           REST endpoints (/api/v1/...)
    controllers/      request handlers
    services/         session + database services (per-session pg.Pool)
    models/           GraphRepository, GraphCreator (CSV import), QueryBuilder
    tools/            agtype parser (hand-written; Agtype.g4 kept as reference),
                      SQLFlavorManager (per-PG-version SQL in backend/sql/)
  test/               node:test suites (contract, parser golden, v2 endpoints)
frontend/
  src/
    app/              Redux store, typed hooks, localStorage persistence
    features/         one folder per domain: api (RTK Query), editor, frames,
                      results (Graph/Table/Text/Meta + cytoscape), sidebar,
                      builder (query generator), csv, database, setting, ...
docs/
  api-contract.md     authoritative HTTP API contract
  baseline.md         legacy-stack test baseline
  frontend-notes.md   frontend architecture decisions and deviations
```

## Notes for production deployments

- The app is single-instance: sessions and their DB connection pools live in
  process memory. Idle sessions (no request for 60 minutes) are reaped
  automatically.
- Run it directly with `node` (as above) or any process supervisor of your
  choice; the legacy pm2 setup is not part of this rewrite.

## License

Apache-2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
