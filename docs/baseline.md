# Phase 0 Baseline — Old Stack Verification (2026-07-17)

## Environment

- Node v24.16.0, npm 11.10.0, Docker 28.2.2 (Docker Desktop, Linux engine)
- Test DB: `apache/age:latest` image = **PostgreSQL 18.1 + AGE 1.7.0**,
  container `age-testdb` at `localhost:5432`, credentials `TEST/TEST/TEST`
  (matches `backend/test/testDB.js`)

## Old backend test results: 7 passing

| Suite | Tests | Needs DB | Result |
|---|---|---|---|
| `test/ageParsing.test.js` | 5 (Object Circulating, Null Properties, Path, Edge, String) | no | all pass |
| `test/ageUtil.test.js` | 1 (toAgeProps serialize) | no | pass |
| `test/graphCreate.test.js` | 1 (connect → /cypher/init CSV upload → drop graph) | yes | pass (~47 ms) |

Command: `cd age-viewer/backend && npm test`
(mocha + @babel/register, after workarounds below)

## Dependency rot found while reproducing the baseline

The old stack does NOT run out-of-the-box on Node 24 / npm 11:

1. `@babel/runtime` is required at runtime (babel transform-runtime output)
   but missing from `package.json` — must `npm install --no-save @babel/runtime`.
2. Latest `@babel/runtime` breaks old Babel 7.12 output:
   `Package subpath './regenerator' is not defined by "exports"`.
   Workaround: pin `@babel/runtime@7.16.7`.
3. `npm install` deprecation warnings include: multer 1.x (CVE-2022-24434),
   glob 7, uuid 8, supertest 6, inflight, old babel plugins.
4. `npm audit` (saved to `baseline-audit-backend.json`):
   **21 vulnerabilities — 12 high, 5 moderate, 4 low** across 596 deps.
5. Runtime warning on pg: "Calling client.query() when the client is already
   executing a query is deprecated and will be removed in pg@9.0".

## Compatibility gaps

- Old backend has SQL flavors only for PG 11–15 (`backend/sql/{11..15}/`).
  Against the PG 18 test DB, `/api/v1/db/meta` fails with
  `SQL does not exist, name = meta_data`. The rewrite must decide how to
  handle PG 16+ (add flavors or default to the newest).
- Docker Hub mirror (daocloud) returned 403 for pinned `apache/age` tags
  (PG13/PG14/PG15); only `latest` was pullable in this environment.

## Feature checklist (parity target for the rewrite)

Backend endpoints (full contract: `api-contract.md`):

- `POST /api/v1/db/connect`, `GET /api/v1/db`, `GET /api/v1/db/disconnect`
- `POST /api/v1/db/meta`, `GET /api/v1/db/metaChart` (broken upstream: always 500)
- `POST /api/v1/cypher` (body field `cmd`), `POST /api/v1/cypher/init` (multipart CSV)
- `GET /api/v1/miscellaneous` (keyword matrix)
- Static hosting of `frontend/build` + `GET /`

Frontend features (for phase 3 parity):

- Server connect/disconnect/status frames
- Cypher editor (CodeMirror, Shift/Ctrl-Enter run, history nav, drag-resize)
- Result frames: graph (cytoscape + layouts + context menu), table, text, meta
- Sidebar home/settings, graph initializer (CSV import), query builder
- Alerts, modals, command history/favorites, theme + limits persisted in cookies
