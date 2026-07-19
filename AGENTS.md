# AGENTS.md — age-viewer-v2 (Node 24 rewrite)

Full rewrite of Apache AGE Viewer (legacy repo: `../age-viewer`) on Node 24 +
TypeScript, following an API-compatible (strangler) strategy: the backend
reproduces the legacy HTTP API 1:1, the frontend is rebuilt on a modern stack.

**Authoritative references in `docs/`:**
- `docs/api-contract.md` — the HTTP API contract. Any backend change MUST keep
  status codes, JSON field names/nesting/types exactly as documented (including
  listed quirks).
- `docs/baseline.md` — legacy test baseline and environment notes.
- `docs/frontend-notes.md`, `docs/parity-battery.sh` — frontend parity checks.

## Working Guidelines

Behavioral guidelines to reduce common LLM coding mistakes.
**Tradeoff:** these bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work")
require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer
rewrites due to overcomplication, and clarifying questions come before
implementation rather than after mistakes.

## Stack & layout

npm workspaces: `backend/` + `frontend/`, orchestrated from the root.

- **Backend**: Node `>=24`, TypeScript (ESM, `"type": "module"`), Express 5,
  `pg` 8 + `pg-types`, `express-session`, `multer` 2.x, `winston` + `morgan`.
  Runs directly on `.ts` via Node's native type stripping — no Babel/nodemon.
- **Frontend**: Vite 7, React 19, TypeScript, antd 5 (only UI library),
  Redux Toolkit 2 (`createSlice` + hooks, no `connect()`), CodeMirror 6
  (`@uiw/react-codemirror` 4 + legacy cypher mode), cytoscape + npm-packaged
  extensions (incl. `cytoscape-cxtmenu`).
- Source layering mirrors the legacy repo on purpose:
  `config/ routes/ controllers/ services/ models/ tools/ util/`
  (`common/Routes`, `bin/www` entry). Frontend code lives in
  `frontend/src/features/<domain>/`.

## Commands

```bash
npm run dev:backend      # node --watch src/bin/www.ts  (:3001)
npm run dev:front        # vite dev server (:3000, proxies /api -> :3001)
npm run build            # both workspaces (backend: tsc -> build/, frontend: vite build)
npm test                 # both workspaces
npm start                # backend from source: node src/bin/www.ts

cd backend
npm test                 # node --test "test/*.test.ts" (needs test DB, see below)
npm run build && npm run start:build   # compiled: build/bin/www.js

cd frontend
npm test                 # vitest run (jsdom)
npm run typecheck        # tsc --noEmit — keep clean
npm run lint             # eslint flat config (eslint.config.js)
```

## Test database

Tests and manual runs need PostgreSQL + AGE at `localhost:5432`, db/user/password
all `TEST` (`backend/test/testDB.ts`). Baseline container:

```bash
docker run -d --name age-testdb -p 5432:5432 \
  -e POSTGRES_USER=TEST -e POSTGRES_PASSWORD=TEST -e POSTGRES_DB=TEST \
  apache/age:latest
```

`backend/test/contract.test.ts`, `graphCreate.test.ts`, `v2endpoints.test.ts`
hit the live DB; `ageParsing.test.ts` / `ageUtil.test.ts` are pure parser
golden tests and must stay green after any parser change.

## Hard rules

- **TypeScript style**: `backend/tsconfig.json` sets `erasableSyntaxOnly`,
  `verbatimModuleSyntax`, `allowImportingTsExtensions` — use only erasable TS
  (no enums, no namespaces, no parameter properties); relative imports keep
  explicit extensions.
- **agtype parser**: hand-written recursive-descent parser in
  `backend/src/tools/agtypeParser.ts` (+ `AGEParser.ts`), hooked via
  `pg-types.setTypeParser`. `Agtype.g4` is kept as the grammar reference only —
  there is no ANTLR runtime dependency. Do not reintroduce ANTLR.
- **Vertex/Edge/Path output shape** must match the legacy parser exactly
  (including `id` construction); golden tests are the judge.
- **Session/connection model**: per-session `pg.Pool` via `sessionRouter`/
  `DatabaseService`, as legacy — but pools must be reclaimed on session
  expiry/disconnect (the legacy leak is fixed here; don't regress it).
- **SQL flavors**: `backend/sql/{11..15}/` are carried over from legacy;
  `SQLFlavorManager` selects per server version. Keep files compatible.
- **Frontend build output is `frontend/build`** (not Vite's `dist`) — the
  backend serves that path in production. Don't change `outDir`.
- **Credentials**: DB credentials are sent only to `/api/v1/db/connect`; never
  store passwords in Redux, localStorage, or cookies.
- New front-end-only query needs (neighbor expansion, node deletion) go through
  the parameterized v2 endpoints — never build SQL via string interpolation in
  the frontend (that was a legacy injection surface).

## Do not reintroduce (dropped on purpose)

axios, Babel, nodemon, pm2 / `ecosystem.config.js`, PropTypes,
react-bootstrap/bootstrap, vendored cxtmenu copy, `html2canvas`/`Capture.js`,
redux-thunk, `connect()` containers, plaintext passwords in the store.
