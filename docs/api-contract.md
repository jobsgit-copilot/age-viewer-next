# Apache AGE Viewer — Backend HTTP API Contract

This document is the authoritative contract for reimplementing the Apache AGE Viewer
backend HTTP API. It was reverse-engineered from the original Node.js/Express 4
backend (`backend/package.json`: name `ag-viewer-backend`, version `0.4.0`).

All file citations refer to paths inside the original repository's `backend/`
directory (e.g. `src/app.js` means `backend/src/app.js`). Frontend call sites are
cited as `frontend/src/...` where they clarify the actual wire format.

A rewrite MUST reproduce the status codes, JSON field names, nesting, and types
documented here, including the quirks listed in section 7, unless a quirk is
explicitly waived by the project.

---

## 1. Server and transport basics

Source: `src/app.js`, `src/bin/www.js`, `src/config/Pg.js`.

- HTTP server: Express 4 (`express ~4.17.1`). Listen port: `process.env.PORT || 3001`.
- The same server hosts the built React frontend statically and the API under `/api/v1`.
- CORS (`cors` middleware, runs before everything):
  `cors({ origin: true, credentials: true })` — the request `Origin` header is
  reflected in `Access-Control-Allow-Origin`, and
  `Access-Control-Allow-Credentials: true` is always sent. Any origin is accepted.
- Body parsing (order matters, both are registered):
  - `express.json()` — `Content-Type: application/json`, default 100 KB limit.
  - `express.urlencoded({ extended: false })` — `application/x-www-form-urlencoded`
    is also accepted on endpoints that read `req.body`.
- `cookieParser()` and `morgan('common')` logging are registered but do not affect
  the API contract.
- A process-level `uncaughtException` handler only logs the exception; the process
  keeps running.

### Middleware pipeline order (`src/app.js`)

1. `cors({ origin: true, credentials: true })`
2. `express.static(<repo>/frontend/build)`
3. `GET /` → sends `<repo>/frontend/build/index.html`
4. `express-session(...)` (see section 2)
5. `morgan('common')` → winston stream
6. `express.json()`
7. `express.urlencoded({ extended: false })`
8. `cookieParser()`
9. `/api/v1/*` → `sessionRouter` (attaches a per-session `DatabaseService`, section 2)
10. Routers: `/api/v1/miscellaneous`, `/api/v1/cypher`, `/api/v1/db`
11. Final error-handling middleware (section 1.1)

### 1.1 Global error response format

Source: `src/app.js` lines 64–75, `src/common/Routes.js`.

Every route handler is wrapped in `wrap(asyncFn)`, which catches any thrown /
rejected error and forwards it to `next(error)`. The final error middleware
responds:

```
status: err.status || 500
Content-Type: application/json

{
  "severity": err.severity || "",
  "message":  err.message || "",
  "code":     err.code     || ""
}
```

- No code in the codebase ever sets `err.status`, so in practice **every error
  produced through this path is HTTP 500**.
- PostgreSQL/`node-pg` errors carry `severity` (e.g. `"ERROR"`) and `code`
  (SQLSTATE, e.g. `"3F000"`, `"42601"`, `"28P01"`, `"3D000"`). Network-level
  failures are plain `Error`s with `code` like `"ECONNREFUSED"` and `severity: ""`.
- Application-thrown errors (`new Error('Not connected')`,
  `new Error('Query not entered!')`, `new Error('graph does not exist')`,
  `new Error('SQL does not exist, name = ...')`) produce
  `{ "severity": "", "message": "<text>", "code": "" }` with status 500.
- The frontend formats these as `[${severity}]:(${code}) ${message}`
  (`frontend/src/features/database/DatabaseSlice.js`), so all three fields must
  always be present, even when empty.
- **Exception:** `POST /api/v1/cypher/init` has its own inline error format that
  does NOT go through this middleware — see section 3.7.

---

## 2. Session model

Source: `src/app.js` lines 42–53, `src/routes/sessionRouter.js`,
`src/services/sessionService.js`.

### 2.1 express-session configuration

```js
session({
  secret: 'apache-age-viewer',
  secure: true,              // NO-OP: not a valid top-level option (see quirks)
  resave: false,
  saveUninitialized: true,
  proxy: true,
  genid: (req) => uuid.v4(),
})
```

Consequences:

- Session cookie: default name **`connect.sid`**, value `s:<uuid-v4>.<signature>`
  (HMAC-signed with the hard-coded secret `apache-age-viewer`).
- Default cookie attributes: `Path=/; HttpOnly`. **No `Secure`, no `Max-Age` /
  `Expires`** (browser-session cookie). The stray top-level `secure: true` is
  ignored by express-session (the real option is `cookie.secure`), so the cookie
  is sent over plain HTTP. `proxy: true` only matters for secure-cookie
  decisions and is therefore also inert.
- `saveUninitialized: true` means **every** first-time request (even to
  `GET /api/v1/miscellaneous`, which needs no session) receives a
  `Set-Cookie: connect.sid=...` response header.
- Default `MemoryStore`: per-process, never clustered, entries effectively never
  expire (no cookie max-age ⇒ no session expiry is set).

### 2.2 Session → DatabaseService mapping

- `sessionService` is a process-wide singleton `Map` keyed by `req.sessionID`
  (the uuid from `genid`).
- The `sessionRouter` middleware is mounted on `/api/v1/*`, so it runs before
  **all** API routers. On every API request:
  ```js
  if (sessionService.get(req.sessionID) == null)
      sessionService.put(req.sessionID, new DatabaseService());
  next();
  ```
  i.e. each session lazily gets exactly one `DatabaseService` instance.
- A `DatabaseService` holds at most one `GraphRepository` (one `pg.Pool`).
  "Connected" is defined purely as `this._graphRepository != null`
  (`DatabaseService.isConnected()`); no live-connection check is involved.
- Entries are **never removed** from the map. `disconnect` only nulls the
  service's internal repository; the map entry (and thus the session) lives
  until process restart.
- All connection state is therefore tied to the `connect.sid` cookie. A client
  that loses the cookie gets a fresh, disconnected `DatabaseService`.

---

## 3. Endpoint reference

Overview:

| Method | Path                      | Purpose                              | Auth needed |
|--------|---------------------------|--------------------------------------|-------------|
| GET    | `/`                       | Static SPA entry (index.html)        | no          |
| POST   | `/api/v1/db/connect`      | Open DB connection pool              | session     |
| GET    | `/api/v1/db`              | Connection status + info             | connected   |
| GET    | `/api/v1/db/disconnect`   | Close DB connection pool             | connected   |
| POST   | `/api/v1/db/meta`         | Graph metadata                       | connected   |
| GET    | `/api/v1/db/metaChart`    | **Broken** — always 500              | —           |
| POST   | `/api/v1/cypher`          | Execute cypher/SQL                   | connected   |
| POST   | `/api/v1/cypher/init`     | Bulk-create graph from CSV uploads   | connected   |
| GET    | `/api/v1/miscellaneous`   | Cypher keyword adjacency matrix      | no          |

"connected" means the handler throws `Error('Not connected')` →
`500 {severity:"", message:"Not connected", code:""}` when the session's
`DatabaseService` has no repository.

### 3.1 `POST /api/v1/db/connect`

Source: `src/routes/databaseRouter.js` → `DatabaseController.connectDatabase`
(`src/controllers/databaseController.js`) → `DatabaseService.connectDatabase`
(`src/services/databaseService.js`) → `GraphRepository`
(`src/models/GraphRepository.js`).

- **Request:** `Content-Type: application/json` (urlencoded also works).
  Body fields are destructured by the `GraphRepository` constructor:
  ```json
  {
    "host":     "string, required in practice",
    "port":     "number|string, required in practice",
    "database": "string, required in practice",
    "user":     "string",
    "password": "string",
    "graph":    "string, optional — initial current graph name",
    "graphs":   "array of string, optional — initial graph-name cache (default [])",
    "server":   "string, optional — overrides auto-detected server_version"
  }
  ```
  The frontend sends `{host, port, database, user, password}` from the connect
  form (`frontend/src/features/database/DatabaseSlice.js`).
- **Behavior:**
  - If the session is already connected, the body is **ignored** and the
    existing connection info is returned (idempotent connect).
  - Otherwise a `pg.Pool` is created with pool options from `src/config/Pg.js`:
    `max: 10`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 2000`.
  - A single client is acquired to validate the connection; on that first
    connect the server version is fetched with `show server_version` and stored
    (unless `server` was supplied in the body).
  - On failure the internal repository is discarded (`isConnected()` stays
    false) and the error propagates to the global error handler.
  - Note: every client later checked out via `getConnection()` runs
    `CREATE EXTENSION IF NOT EXISTS age; LOAD 'age'; SET search_path = ag_catalog, "$user", public;`
    and registers a custom parser for the `agtype` OID
    (`src/tools/AGEParser.js`). If Apache AGE is not installed, queries fail,
    not connect.
- **Success 200** — `GraphRepository.getConnectionInfo()`:
  ```json
  {
    "host":     "string",
    "version":  "string — PostgreSQL server_version, e.g. \"14.5\"; null if unknown",
    "port":     "number|string — echoed as supplied",
    "database": "string",
    "user":     "string",
    "password": "string — the DB password is echoed back verbatim",
    "graphs":   ["string — cached graph names; [] until /api/v1/db/meta runs"],
    "graph":    "string — current graph; ABSENT from the JSON if undefined (JSON.stringify drops undefined)"
  }
  ```
- **Errors:** 500 `{severity, message, code}` — e.g. SQLSTATE `28P01`
  (password auth failed), `3D000` (database does not exist), `28000`,
  or `{severity:"", message:"connect ECONNREFUSED ...", code:"ECONNREFUSED"}`.

### 3.2 `GET /api/v1/db` — connection status

Source: `DatabaseController.getStatus` (`src/controllers/databaseController.js`).

- **Request:** no body.
- **Behavior:** calls `getConnectionStatus()` (acquires and releases a pool
  client) but **ignores its return value** — a dead backend still yields 200.
- **Success 200:** same connection-info object as 3.1.
- **Errors:** not connected → 500 `{severity:"", message:"Not connected", code:""}`.

### 3.3 `GET /api/v1/db/disconnect`

Source: `DatabaseController.disconnectDatabase` (`src/controllers/databaseController.js`).
Note the method is **GET**, not POST.

- **Request:** no body.
- **Behavior:** ends the `pg.Pool` and nulls the repository.
- **Success 200:** `{ "msg": "Disconnect Successful" }`
- **Errors:**
  - Not connected → 500 `{severity:"", message:"Not connected", code:""}`.
  - The code path returning 500 `{ "msg": "Already Disconnected" }` exists but
    is effectively unreachable (guarded by `isConnected()`; `releaseConnection()`
    either returns `true` or throws, and a throw goes to the global 500 handler).

### 3.4 `POST /api/v1/db/meta` — graph metadata

Source: `DatabaseController.getMetadata` → `DatabaseService.getMetaData*`
(`src/services/databaseService.js`), SQL in `sql/get_graph_names.sql`,
`sql/analyze_graph.sql`, `sql/<major>/meta_data.sql`, `sql/property_keys.sql`,
`sql/get_role.sql`.

- **Request:** `Content-Type: application/json`. Body is either empty/`{}` or:
  ```json
  { "currentGraph": "string — graph name to expand" }
  ```
  (Frontend: `getMetaData()` or `getMetaData({ currentGraph })`,
  `frontend/src/features/database/MetadataSlice.js`.)
- **Behavior (side effects, in order):**
  1. `SELECT * FROM ag_catalog.ag_graph` refreshes the cached graph-name list
     (`graphs`) and **resets the current graph to the first row returned**
     (`initGraphNames()` → `setCurrentGraph(_graphs[0])`).
  2. `ANALYZE;` is executed on every call.
  3. Graph selection: if `body.currentGraph` is one of the graph names, it is
     used; otherwise the just-reset current graph (first graph) is used. The
     `body` object is truthy even when `{}`, so the "all graphs empty" branch
     (`graphNameInitialize`) only runs for a literal falsy body (e.g. JSON
     `null`) — see Ambiguities.
  4. If the database contains **no graphs**: throws
     `Error('graph does not exist')` → 500.
- **Success 200:** an object **keyed by every graph name in the database**.
  The selected graph maps to a full metadata object; **all other graphs map to
  `{}`**:
  ```json
  {
    "<selectedGraph>": {
      "nodes":        [ <labelMetaRow>, ... ],
      "edges":        [ <labelMetaRow>, ... ],
      "propertyKeys": [],
      "graph":        "<selectedGraph>",
      "database":     "<database name>",
      "role":         { "user_name": "string", "role_name": "admin" | "user" }
    },
    "<otherGraph1>": {},
    "<otherGraph2>": {}
  }
  ```
  - `nodes` / `edges`: rows of the version-specific `meta_data` query
    (`sql/11..15/meta_data.sql`, chosen by `server_version.split('.')[0]`),
    split by `parseMeta()`: rows with `kind === 'v'` go to `nodes`,
    `kind === 'e'` to `edges`; rows named `_ag_label_vertex` /
    `_ag_label_edge` are filtered out. Each row is the raw join of
    `pg_class`/`pg_namespace`, `ag_graph`, and `ag_label`, with duplicate
    column names collapsed by node-pg (later columns win), yielding these
    effective fields:
    ```json
    {
      "label":        "string — label name (= pg_class.relname)",
      "namespace_id": "number — pg_namespace.oid",
      "cnt":          "number — pg_class.reltuples estimate (float4; may be -1 or fractional)",
      "namespace":    "number — ag_graph.namespace",
      "oid":          "number — ag_label.oid (overwrites ag_graph.oid in the join)",
      "name":         "string — ag_label.name (same value as label)",
      "kind":         "string — 'v' or 'e'",
      "graph":        "number — ag_label.graph (graph oid)"
    }
    ```
    (`label`, `namespace_id`, `cnt` come first in the SQL; the PG11 variant
    joins on `ag_graph.oid`, PG12+ on `ag_graph.graphid` — that column is
    shadowed by `ag_label.oid` in the row object either way.)
  - `propertyKeys`: **always `[]`** (`sql/property_keys.sql` is
    `SELECT null as key, null as keytype ... LIMIT 0`).
  - `role`: first row of `sql/get_role.sql` for the connected user:
    `role_name` is `"admin"` when `usesuper` else `"user"`. If the user row is
    missing, `role` is `undefined` and the key is **absent** from the JSON.
  - The frontend sums `cnt` over `nodes`/`edges` and unshifts a synthetic
    `{label:'*', cnt: total}` client-side — the backend must therefore keep
    `cnt` numeric (`frontend/src/features/database/MetadataSlice.js`).
- **Errors:** not connected → 500 `"Not connected"`; no graphs → 500
  `"graph does not exist"`; unsupported server major (no `sql/<major>/meta_data.sql`
  — only 11–15 ship) → 500 `{severity:"", message:"SQL does not exist, name = meta_data", code:""}`;
  SQLSTATE errors from the metadata queries pass through with pg severity/code.

### 3.5 `GET /api/v1/db/metaChart` — registered but broken

Source: `src/routes/databaseRouter.js` line 30; the controller method
`getMetaChart` is **commented out** (`src/controllers/databaseController.js`
lines 67–91), so `wrap(undefined)` is registered.

- Any request throws `TypeError: asyncFn is not a function` inside the wrapper,
  caught and forwarded to the global error handler.
- **Response: 500** `{ "severity": "", "message": "asyncFn is not a function", "code": "" }`
  (exact `message` text is Node-version dependent).
- The commented-out code shows the intended shape (array of
  `{la_oid, la_name, la_kind, label, cnt}` merged rows); see Ambiguities. The
  SQL it would use (`label_count_vertex` / `label_count_edge`) does not exist in
  `sql/` and would have thrown anyway. The frontend still calls this endpoint
  (`MetadataSlice.js`) and tolerates the failure.

### 3.6 `POST /api/v1/cypher` — execute query

Source: `src/routes/cypherRouter.js` → `CypherController.executeCypher`
(`src/controllers/cypherController.js`) → `CypherService`
(`src/services/cypherService.js`) → `GraphRepository.execute`.

- **Request:** `Content-Type: application/json` (urlencoded also works):
  ```json
  { "cmd": "string — the query text" }
  ```
  The field name is **`cmd`**, not `query`
  (`frontend/src/features/cypher/CypherSlice.js`: `JSON.stringify({ cmd: args[1] })`).
  The text is passed verbatim to `client.query(text)` — typically
  `SELECT * FROM cypher('<graph>', $$ ... $$) AS (a agtype);`, but any SQL is
  accepted, including multiple `;`-separated statements.
- **Behavior:**
  - Missing/empty `cmd` → `Error('Query not entered!')` → 500.
  - node-pg uses the simple query protocol: a multi-statement string yields an
    **array of result objects**. `createResult()` then takes **only the last
    result** (`resultSet.pop()`); all earlier statement results are silently
    discarded. A single statement yields one result object.
- **Success 200** (`CypherService.createResult`):
  ```json
  {
    "rows":     [ { "<columnName>": <value>, ... }, ... ],
    "columns":  ["<columnName>", ...],
    "rowCount": "number|null — node-pg rowCount of the last result",
    "command":  "string — node-pg command tag of the last result, e.g. \"SELECT\""
  }
  ```
  - `columns`: `result.fields.map(f => f.name)` of the last result, in order.
  - `rows`: raw node-pg row objects — **no Vertex/Edge/Path conversion is
    applied** (see section 4.2 and quirk Q6). Values in `agtype` columns are
    pre-parsed into plain JS values by the custom type parser
    (`src/tools/AGEParser.js`); values in non-agtype columns use node-pg's
    default type parsers (notably `int8`/`bigint` → **string**, `int4` →
    number, `float8` → number, timestamps → `Date` → ISO strings in JSON).
- **Errors:** not connected → 500 `"Not connected"`; empty cmd → 500
  `"Query not entered!"`; otherwise the pg/AGE error (severity `"ERROR"`,
  SQLSTATE `code`, e.g. `42601` syntax error, `3F000` graph does not exist).

### 3.7 `POST /api/v1/cypher/init` — bulk graph creation from CSVs

Source: `src/routes/cypherRouter.js` (multer setup) →
`CypherController.createGraph` (`src/controllers/cypherController.js`) →
`GraphCreator` (`src/models/GraphCreator.js`), `QueryBuilder`
(`src/models/QueryBuilder.js`), `src/util/ObjectExtras.js`.

- **Request:** `multipart/form-data`. Parsed by multer with in-memory storage:
  `upload.fields([{ name: "edges" }, { name: "nodes" }])`.
  - `nodes` — **zero or more file parts**, one CSV per vertex label. The
    **label name is the part's `filename` attribute** (`file.originalname`),
    NOT anything inside the CSV. The frontend sends the user-typed label as
    the filename (`GraphInitializer.jsx`: `sendFiles.append('nodes', node.data, node.name)`).
  - `edges` — **zero or more file parts**, one CSV per edge label; filename =
    edge label name, same mechanism.
  - `graphName` — text field, required; target graph. Interpolated raw into SQL.
  - `dropGraph` — text field; graph is dropped first only when exactly the
    string `'true'` (`req.body.dropGraph === 'true'`).
- **Node CSV format** (parsed by papaparse, `header: true`):
  - First row is the header. Every column becomes a vertex property.
    An `id` column is expected (edges match on it) but nothing enforces it.
  - One `CREATE` statement per data row, label = file part filename:
    ```sql
    SELECT * FROM cypher('<graphName>', $$CREATE (:<label> {col1:'v1', col2:'v2'})$$) as (v agtype);
    ```
- **Edge CSV format** (papaparse, `header: true`):
  - MUST contain columns `start_id`, `start_vertex_type`, `end_id`,
    `end_vertex_type`. These four are extracted (`getDelete`) and removed from
    the property set; **all remaining columns become edge properties**.
  - One statement per data row, edge label = file part filename:
    ```sql
    SELECT * FROM cypher('<graphName>', $$
      MATCH (a:<start_vertex_type> {id:'<start_id>'}), (b:<end_vertex_type> {id:'<end_id>'})
      CREATE (a)-[e:<label> {prop1:'v1', ...}]->(b)
    $$) as (e agtype);
    ```
- **Value typing:** papaparse without `dynamicTyping` produces only strings;
  `toAgeProps()` single-quotes string values, so **all CSV-imported properties
  are stored as strings**. Values are not escaped — embedded quotes/newlines
  break or inject Cypher. Rows with a column-count mismatch
  (papaparse `FieldMismatch`) are dropped (see quirk Q14).
- **Execution order** (single pool client):
  1. If `dropGraph === 'true'`: `SELECT * FROM drop_graph('<graphName>', true);`
     — **outside any transaction**; error code `3F000` (graph did not exist)
     is swallowed, other errors abort.
  2. `SELECT * FROM create_graph('<graphName>');` — also outside the
     transaction. Fails (and aborts with 500) if the graph already exists and
     was not dropped.
  3. `BEGIN`, then all `create_vlabel` / `create_elabel` statements
     (`Promise.all`), then all node `CREATE`s (`Promise.all`), then all edge
     statements (`Promise.all`), then `COMMIT`. On any error: `ROLLBACK`.
- **Success: `204 No Content`** — empty body.
- **Failure: 500** with an inline, non-standard error body:
  ```json
  { ...all enumerable own properties of the caught error..., "details": "<err.toString()>" }
  ```
  For pg errors this yields fields like `severity`, `code`, `detail`, `hint`,
  `position`, `where`, `file`, `line`, `routine`, plus `details`
  (e.g. `"error: syntax error at or near ..."`). **`message` is NOT present**
  because `Error.prototype.message` is non-enumerable and spread drops it —
  this differs from the global `{severity,message,code}` format. The frontend
  checks `res.status !== 204` and throws the parsed body.
- **Not-connected behavior (quirk):** if the session has no connection, the
  handler falls through **without sending any response** — the request hangs
  until client/proxy timeout. There is no 4xx/5xx.
- **Missing `nodes` or `edges` parts:** `req.files.nodes` is `undefined` →
  `TypeError` inside `parseData()` → 500 with
  `details: "TypeError: Cannot read properties of undefined (reading 'map')"`.

### 3.8 `GET /api/v1/miscellaneous` — cypher keyword matrix

Source: `src/routes/miscellaneous.js` → `src/services/queryList.js`,
data file `misc/graph_kw.csv`.

- **Request:** none. No connection required (a session cookie is still issued).
- **Behavior:** reads and parses `misc/graph_kw.csv` with papaparse
  (`skipEmptyLines: true`) on every request. A `transform` hook returns
  `undefined` for column 0 of every row (papaparse uses the transform result
  unconditionally), so the first cell of each row becomes `undefined`, which
  JSON serializes as `null`. All other cells remain **strings** (no
  `dynamicTyping`).
- **Success 200:**
  ```json
  {
    "kw": ["MATCH","WITH","DELETE","CREATE","RETURN","ORDER BY","SKIP","LIMIT",
           "SET","REMOVE","MERGE","AS","WHERE","DETACH"],
    "relationships": [
      [null, "0","1","1","0","1","0","0","0","0","1","0","0","0","0"],
      [null, "0","0","0","0","0","1","0","0","0","0","0","1","1","0"],
      [null, "0","0","0","0","0","0","0","0","0","0","0","0","0","0"],
      [null, "0","0","0","0","1","0","0","0","0","0","0","0","0","0"],
      [null, "0","0","0","0","1","0","0","0","0","0","0","0","0","0"],
      [null, "0","0","0","0","1","0","1","1","0","0","0","0","0","0"],
      [null, "0","0","0","0","0","0","0","0","0","0","0","0","0","0"],
      [null, "0","0","0","0","0","0","0","0","0","0","0","0","0","0"],
      [null, "0","0","0","0","0","0","0","0","0","0","0","0","0","0"],
      [null, "0","0","0","0","0","0","0","0","0","0","0","0","0","0"],
      [null, "0","0","0","0","1","0","0","0","0","0","0","0","0","0"],
      [null, "0","0","0","0","0","0","0","0","0","0","0","0","0","0"],
      [null, "0","0","0","0","0","0","0","0","0","0","0","0","0","0"],
      [null, "0","0","1","0","0","0","0","0","0","0","0","0","0","0"]
    ]
  }
  ```
  - `kw`: the CSV header row minus its first (empty) cell
    (`results.data[0].splice(1)` — `splice` returns the removed tail).
  - `relationships`: the 14 data rows, in the same keyword order as `kw`; each
    row has 15 elements: a leading `null` (the nulled row-label cell — the
    frontend discards it with `row.slice(1)`) followed by 14 `"0"`/`"1"`
    **strings**. The frontend compares with `element !== '0'`
    (`frontend/src/features/query_builder/KeyWordFinder.js`), so the values
    must remain strings, not numbers.
  - A missing `misc/graph_kw.csv` rejects the handler → global 500
    `{severity:"", message:"ENOENT: ...", code:"ENOENT"}`.

### 3.9 `GET /` and static assets

Source: `src/app.js` lines 37–40. `express.static` serves the built frontend
from `frontend/build`; `GET /` explicitly sends `frontend/build/index.html`.
No API semantics; a headless rewrite may omit this or replace it with its own
serving strategy, but no `/api/*` path may be shadowed by static handling.

---

## 4. Data shapes

### 4.1 Connection-info object

Returned by `POST /api/v1/db/connect` and `GET /api/v1/db`
(`GraphRepository.getConnectionInfo()`):

| field      | type          | notes                                              |
|------------|---------------|----------------------------------------------------|
| `host`     | string        | echoed from connect body                           |
| `version`  | string\|null  | `show server_version`, e.g. `"14.5.0"`; `null` until first connect; overridable via `server` body field |
| `port`     | number\|string| echoed exactly as supplied in the connect body     |
| `database` | string        | echoed                                             |
| `user`     | string        | echoed                                             |
| `password` | string        | **DB password echoed back** (quirk Q4)             |
| `graphs`   | string[]      | graph-name cache; `[]` until `/db/meta` refreshes it (or supplied at connect) |
| `graph`    | string        | current graph; key **omitted** when `undefined`    |

### 4.2 agtype → JSON mapping (cypher result rows)

Source: `src/tools/AGEParser.js`, `src/tools/Agtype.g4`,
`src/tools/CustomAgTypeListener.js`, tests in `test/ageParsing.test.js`.

On every pool checkout, a type parser is registered for the `agtype` OID
(looked up via `select typelem from pg_type where typname = '_agtype'`). The
ANTLR grammar parses agtype text into plain JS values; **`::vertex`, `::edge`,
`::path`, `::numeric` and any other `::IDENT` type annotation is parsed and
then discarded**. Mapping:

| agtype text                                   | JSON value                                                        |
|-----------------------------------------------|-------------------------------------------------------------------|
| `"..."` (string)                              | string (JSON escape rules; parsed via `JSON.parse`)               |
| integer                                       | number (`parseInt`) — **precision loss above 2^53** (quirk Q8)    |
| decimal/exponent float                        | number (`parseFloat`)                                             |
| `NaN`, `Infinity`, `-Infinity`                | JS `NaN`/`±Infinity` → **`null` in JSON** (quirk Q9)              |
| `true` / `false` / `null`                     | boolean / null                                                    |
| object `{...}`                                | plain object                                                      |
| array `[...]`                                 | array                                                             |
| vertex `{"id":N,"label":S,"properties":{...}}::vertex` | `{ "id": number, "label": string, "properties": object }`  |
| edge `{"id":N,"label":S,"end_id":N,"start_id":N,"properties":{...}}::edge` | `{ "id": number, "label": string, "end_id": number, "start_id": number, "properties": object }` |
| path `[<vertex>,<edge>,...]::path`            | array alternating vertex and edge objects as above                |

Consequences a rewrite must preserve:

- Vertices and edges are **indistinguishable by type marker** on the wire;
  edges are identifiable only by the presence of `start_id`/`end_id` keys.
  Key order inside properties follows the agtype text; AGE serializes edge
  keys as `id, label, end_id, start_id, properties`.
- A result row is an object keyed by the column aliases of the query, e.g.
  `SELECT ... AS (v agtype, e agtype)` → `{"v": {...}, "e": {...}}`.
- Scalar cypher results (`RETURN 1`, `RETURN 'x'`) arrive as agtype too →
  plain numbers/strings in the row object.
- Known parsing quirk: a float literal that is a **direct array element** is
  duplicated — the raw text is pushed first, then the parsed number
  (`exitFloatLiteral` and `exitFloatValue` both fire; only arrays are
  affected). `[1.5]` parses to `["1.5", 1.5]`. Object property values are NOT
  affected (the string is overwritten by the number). See quirk Q7.

### 4.3 Dead conversion code — `${oid}.${id}` ids are NOT on the wire

`CypherService` (`src/services/cypherService.js` lines 68–121) and
`DatabaseService` (line 201) define `_convertRowToResult` / `convertVertex` /
`convertEdge` / `convertPath`, which would format ids as `"${id.oid}.${id.id}"`
and rename `props` → `properties`. **This code is never executed:**

- `createResult()` returns `targetItem.rows` directly.
- No `Vertex`/`Edge`/`Path` classes exist anywhere in the backend, so the
  `constructor.name` checks could never match even if the functions ran.

Contract tests must therefore target the plain agtype-object shape of
section 4.2, **not** the `${oid}.${id}` format. (The dead code is presumably a
leftover from the older `age-viewer` Go backend, whose JSON did use
`label_id.entry_id` style ids.)

---

## 5. Typical client lifecycle

1. `POST /api/v1/db/connect` (any session; a `connect.sid` cookie is issued on
   the first request and must be retained — all state hangs off it).
2. `POST /api/v1/db/meta` with `{}` or `{currentGraph}` → graph list +
   metadata for the selected graph; side effect: current graph reset to first
   graph, `ANALYZE` run.
3. `POST /api/v1/cypher` with `{cmd}` as often as needed.
4. Optionally `POST /api/v1/cypher/init` (multipart) to bulk-load a graph.
5. `GET /api/v1/db/disconnect` to close the pool. The session itself (and its
   `DatabaseService` shell) persists server-side forever.

---

## 6. Status-code summary

| Status | Where | Body |
|--------|-------|------|
| 200 | connect, status, meta, cypher, disconnect, miscellaneous | endpoint-specific JSON |
| 204 | cypher/init success | empty |
| 500 | **every** failure (`err.status` is never set anywhere) | `{severity,message,code}`, except cypher/init's inline `{...pgError, details}` |
| (hang) | cypher/init when not connected | no response ever |

---

## 7. Quirks a rewrite must preserve (or explicitly waive)

- **Q1. Universal 500.** All errors are HTTP 500; there are no 4xx codes.
  `severity`/`code` are empty strings for non-pg errors.
- **Q2. Error body always has exactly `severity`, `message`, `code`** — except
  `POST /api/v1/cypher/init`, whose 500 body spreads the pg error and adds
  `details`, and has **no `message`** field.
- **Q3. `GET /api/v1/db/metaChart` always 500s** with a TypeError message.
- **Q4. Password echo.** Connect/status responses contain the cleartext DB
  password.
- **Q5. Multi-statement discard.** `/api/v1/cypher` returns only the **last**
  result of a multi-statement string (`resultSet.pop()`), silently dropping
  earlier results.
- **Q6. No vertex/edge conversion.** `${oid}.${id}` id formatting exists only
  in dead code; rows carry raw agtype-parsed objects (section 4.2/4.3).
- **Q7. Float duplication in agtype arrays.** `[1.5, 2.5]::...` parses to
  `["1.5", 1.5, "2.5", 2.5]` (only floats, only as direct array elements).
  Almost certainly a bug; decide whether contract tests pin or waive it.
- **Q8. Integer precision.** agtype integers become JS Numbers; AGE ids above
  2^53 lose precision on the wire.
- **Q9. `NaN`/`Infinity` → `null`.** Via `JSON.stringify` semantics.
- **Q10. Session quirks.** Hard-coded secret `apache-age-viewer`; cookie
  `connect.sid` without `Secure`/expiry; the top-level `secure: true` option
  is a no-op; `MemoryStore`; a `DatabaseService` map entry is created for
  every session and never deleted; connection pools of abandoned sessions
  leak until process exit.
- **Q11. Status check is a no-op.** `GET /api/v1/db` returns 200 with cached
  info even if the database has gone away.
- **Q12. Connect is idempotent.** Re-connecting an already-connected session
  ignores the request body and returns the existing info.
- **Q13. `/db/meta` side effects.** Refreshes the graph list, resets the
  current graph to the first graph, and runs `ANALYZE` on every call. Response
  always includes **all** graph names as keys (`{}` for non-selected ones).
  Only PostgreSQL majors 11–15 have `meta_data.sql` files.
- **Q14. CSV import leniency.** Rows with the wrong column count
  (`FieldMismatch`) are silently dropped; because the code splices
  `res.data` while iterating over the error list, multiple bad rows can
  shift indices and leave some bad rows in. All imported property values are
  strings; no escaping of quotes/backslashes/dollar-quotes is performed
  (SQL/Cypher injection is possible through CSV content, graph names, and
  label names).
- **Q15. init transactional boundaries.** `drop_graph` and `create_graph` run
  **outside** the `BEGIN…COMMIT` block; a failed import can still leave the
  old graph dropped. Label/node/edge inserts run concurrently (`Promise.all`)
  on a single client inside one transaction.
- **Q16. init hangs when not connected.** No response is ever sent.
- **Q17. CORS reflects any origin with credentials.**
- **Q18. `propertyKeys` is always `[]`.**
- **Q19. `role` key omitted** when the user is not found in `pg_user`.
- **Q20. Body parsers are lenient.** JSON endpoints also accept
  `application/x-www-form-urlencoded`; `express.json` has the default 100 KB
  body limit (413 from body-parser, HTML error page, on oversize bodies).

---

## 8. Ambiguities and dead code found in the old backend

- **`getMetaData` falsy-body branch.** `getMetaData(req.body)` treats any
  truthy body (including `{}`) via the `currentGraph` path; the
  `graphNameInitialize()` branch (all graphs → `{}`) requires a falsy body
  (e.g. JSON literal `null`). With `express.json()`, an empty request body
  parses to `{}`, so the branch is nearly unreachable. A rewrite may collapse
  this, but the "all graphs present as keys" behavior must stay.
- **Unreachable `{msg:'Already Disconnected'}`.** Kept for completeness; only
  reachable if `pool.end()` returned falsy without throwing, which it does
  not.
- **metaChart intent.** The commented-out implementation would have returned
  an array of `ag_label` rows (`la_oid`, `la_name`, `la_kind`) merged with
  per-label `{label, cnt}` count rows, duplicating multi-count labels with
  `name-idx` suffixes and fractional oid offsets — and it referenced SQL
  files (`label_count_vertex`, `label_count_edge`) that do not exist in
  `sql/`. It cannot be reconstructed faithfully; treat the endpoint as
  "always 500".
- **`DatabaseService.getGraphLabels` / `getGraphLabelCount`** are only called
  from the commented-out metaChart code (dead). `graph_labels.sql`,
  `meta_nodes.sql`, `meta_edges.sql`, `pg_version.sql` exist but are only
  referenced by dead code paths.
- **`GraphRepository.createTransaction()`** returns `[client, fn]` where `fn`
  returns `[result, client]`; only used by cypher/init. The `BEGIN`/`COMMIT`
  strings are passed through the same helper.
- **`version` field** in connection info is the raw `server_version` string
  (e.g. `"14.5 (Ubuntu ...)"` on some builds — whatever `show server_version`
  returns), not a parsed number. `meta_data` SQL selection uses only its
  first `.`-separated segment.
- **Row-label `null` in `/api/v1/miscellaneous`** is an artifact of the
  papaparse `transform` returning `undefined` for column 0; the frontend
  immediately discards it (`row.slice(1)`). A rewrite could send the label
  instead of `null` without breaking the known frontend, but the byte-exact
  contract is `[null, ...]`.
- **Float-array duplication (Q7)** is untested in the old repo's own test
  suite (`test/ageParsing.test.js` covers objects, paths, edges, strings —
  not float arrays); pinning it in contract tests is a judgment call.
- **Multiple same-named columns** in cypher result rows collapse to the last
  value (node-pg row-object semantics), matching the metadata-row behavior.

---

## 9. Rewrite deviations

The Node 24 + TypeScript + ESM + Express 5 rewrite (`age-viewer-v2/backend`)
deliberately deviates from the original backend in the following places.
Everything else in this document applies unchanged.

### 9.1 No password echo on connection-info responses

`GraphRepository.getConnectionInfo()` no longer includes the `password`
field, so neither `POST /api/v1/db/connect` nor `GET /api/v1/db` echoes the
cleartext DB password (waives quirk Q4). All other fields (`host`,
`version`, `port`, `database`, `user`, `graphs`, `graph`) are unchanged;
`graph` is still omitted from the JSON when undefined.

### 9.2 `/cypher/init` fails fast when not connected

`POST /api/v1/cypher/init` without an active connection now throws
immediately, producing the standard error body
`500 {"severity":"","message":"Not connected","code":""}` instead of hanging
forever without a response (waives quirk Q16). The inline
`{...pgError, details}` error format for failures *after* a connection
exists is unchanged.

### 9.3 `/db/metaChart` returns a stable "not implemented" 500

The route stays registered, but instead of the accidental
`TypeError: asyncFn is not a function` it now responds
`500 {"severity":"","message":"not implemented","code":""}` (replaces quirk
Q3's Node-version-dependent message with a stable one).

### 9.4 Session store gains an idle-pool reaper

`sessionService` keeps its process-wide `Map` semantics, but entries now
carry a `lastSeen` timestamp (refreshed on every `get()`). An `unref()`'d
timer sweeps every 10 minutes and, for entries idle for more than
60 minutes, ends the entry's `pg.Pool` (when connected) and removes the
entry from the map (mitigates the pool-leak part of quirk Q10).
`GET /api/v1/db/disconnect` still ends the pool via
`GraphRepository.releaseConnection()` → `pool.end()` and nulls the
repository; that path now provably executes.

### 9.5 Dead code removed

The following dead code paths from the original backend were dropped; wire
shapes are unaffected (section 4.2/4.3 raw agtype objects remain the
contract):

- `CypherService._convertRowToResult` / `convertVertex` / `convertEdge` /
  `convertPath` (never executed; `${oid}.${id}` ids were never on the wire).
- `DatabaseService.convertEdge`, the commented-out
  `getMetaDataMultiple`, and all commented code blocks.
- `DatabaseService.getGraphLabels` / `getGraphLabelCount` (only reachable
  from the commented-out metaChart implementation).
- `DatabaseController.getMetaChart`'s commented-out body (replaced by 9.3).
- Dead imports (`winston/lib/winston/config` in `AGEParser.js`,
  `repl`/`http` in `databaseService.js`) and the commented-out
  `GraphRepository.getConnection` static.

### 9.6 SQL flavor fallback for newer PostgreSQL majors

`SQLFlavorManager.getQuery(name, version)` first tries
`sql/<requestedMajor>/<name>.sql` exactly as before. If that file is
missing and `version` is an integer, it now falls back to the highest
available flavor directory `<=` the requested major (e.g. PG 18 →
`sql/15`); it only throws `Error('SQL does not exist, name = ...')` when no
flavor `<=` the requested version exists (softens the Q13 error case for
PG 16+). Verified working against PostgreSQL 18.1 + Apache AGE 1.7.0: the
`sql/15/meta_data.sql` query runs and returns label rows.

### 9.7 Incidental platform adjustments (behavior-neutral)

- Express 5 does not accept the `/api/v1/*` wildcard mount; the session
  middleware is mounted at the equivalent prefix `/api/v1` (same coverage —
  no bare-`/api/v1` route exists).
- The stray no-op `secure: true` express-session option is kept for parity
  (express-session ignores it, exactly as in the original).
- body-parser 2.x (Express 5) leaves `req.body` `undefined` when no body
  was sent; handlers default it to `{}` so the original truthy-branch
  behavior of `/db/meta` and the `'Query not entered!'` response of
  `/cypher` are preserved.
- `uuid.v4()` is replaced by `crypto.randomUUID()` for session ids
  (same UUIDv4 format).
- Source files use `.ts` import specifiers (required by Node's native type
  stripping); `tsc` rewrites them to `.js` on emit via
  `rewriteRelativeImportExtensions`. The ANTLR 4.9-generated parser in
  `src/tools/antlr/` is ESM JavaScript and is imported (and emitted)
  unchanged.
- `GET /db/meta` etc. behave as documented; the `/db/meta` response rows on
  PG 18 / AGE 1.7 carry AGE 1.7's wider `ag_label` column set (e.g.
  `graphid`, `relation`, `seq_name`) instead of the PG11-era columns listed
  in section 3.4 — a server-side difference, not a rewrite one.

### 9.8 ANTLR parser replaced by a hand-written parser; float-array bug fixed

The agtype text parser is no longer the ANTLR 4.9-generated parser: the
`antlr4` dependency, the generated `src/tools/antlr/` files, and
`CustomAgTypeListener` are removed. `AGTypeParse` (same public interface in
`src/tools/AGEParser.ts`) now delegates to a hand-written recursive-descent
parser (`src/tools/agtypeParser.ts`); the grammar file `src/tools/Agtype.g4`
is kept as documentation only. Semantics are identical to section 4.2
(strings unescaped via JSON semantics, integers via `parseInt`, floats via
`parseFloat`, `NaN`/`±Infinity` as JS numbers, `::IDENT` annotations parsed
and discarded at any nesting level), with one deliberate fix that waives
quirk Q7:

- **Float array duplication fixed.** The old listener pushed every direct
  float array element twice — raw text then parsed number (`[1.5]` parsed
  to `["1.5", 1.5]`) because both `exitFloatLiteral` and `exitFloatValue`
  fired. The new parser emits each float exactly once as a number
  everywhere (`[1.5, 2.5]` → `[1.5, 2.5]`), matching how non-array floats
  always behaved. The fix is pinned in `test/ageParsing.test.ts`; the
  golden parsing cases are unchanged and stay green.

---

## 10. v2-only endpoints

These endpoints exist only in the rewrite. They replace the old frontend's
client-side SQL string interpolation (graph names and element ids were
concatenated into the `cmd` string in the browser) with validated,
server-side parameterized queries. All v1 endpoints above are unchanged.

Both endpoints require a connected session and use the standard error format
(section 1.1): validation failures are
`500 {"severity":"","message":"<text>","code":""}`.

### 10.1 `POST /api/v1/cypher/neighbors`

Replaces the cytoscape context-menu expansion query the old frontend built
in `CypherResultCytoscapeChart.jsx`:

```sql
SELECT * FROM cypher('<graph>', $$ MATCH (S)-[R]-(T) WHERE id(S) = <vertexId> RETURN S, R, T $$) as (S agtype, R agtype, T agtype);
```

- **Request:** `Content-Type: application/json`
  ```json
  { "graph": "string, required — must exist in ag_catalog.ag_graph",
    "vertexId": "number|string, required — integer (AGE graphid)",
    "limit": "number|string, optional — positive integer" }
  ```
- **Behavior:** runs the same `MATCH (S)-[R]-(T) WHERE id(S) = … RETURN S, R, T`
  expansion as the old client-side query, with `LIMIT <n>` appended when
  `limit` is given. The graph name is looked up in `ag_catalog.ag_graph`
  with a bind parameter and embedded as an escaped SQL string literal
  (`'` doubled); the id and limit are coerced to integers (BigInt) before
  being embedded in the cypher text. (Binding the graph name as
  `cypher($1, …)` was considered and rejected: AGE 1.7 answers
  `ERROR: a name constant is expected`.)
- **Success 200:** same shape as `POST /cypher` (section 3.6):
  `{rows, columns, rowCount, command}` with columns `["s","r","t"]`
  (PostgreSQL folds the unquoted aliases to lowercase, exactly as when the
  old frontend ran the same query through `/cypher`).
- **Errors:**
  - not connected → `500 {"severity":"","message":"Not connected","code":""}`
  - missing/empty/non-string `graph` → `500 … "graph must be a non-empty string"`
  - `graph` not in `ag_catalog.ag_graph` → `500 … "graph does not exist"`
  - non-integer `vertexId` → `500 … "vertexId must be an integer"`
  - `limit` present but not an integer → `500 … "limit must be an integer"`;
    integer < 1 → `500 … "limit must be a positive integer"`

### 10.2 `POST /api/v1/cypher/element/delete`

Replaces the delete query the old frontend built in `ModalDialog.jsx`
(vertex delete; the old frontend had no edge delete — the edge form is the
standard openCypher counterpart):

```sql
-- kind = 'v' (exact old query):
SELECT * FROM cypher('<graph>', $$ MATCH (S) WHERE id(S) = <id> DETACH DELETE S $$) as (S agtype);
-- kind = 'e':
SELECT * FROM cypher('<graph>', $$ MATCH ()-[S]-() WHERE id(S) = <id> DELETE S $$) as (S agtype);
```

- **Request:** `Content-Type: application/json`
  ```json
  { "graph": "string, required — must exist in ag_catalog.ag_graph",
    "id": "number|string, required — integer (AGE graphid)",
    "kind": "'v' | 'e', required" }
  ```
- **Behavior:** `kind: 'v'` DETACH-DELETEs the vertex (and its edges);
  `kind: 'e'` DELETEs the edge. Same validation and escaping rules as 10.1.
- **Success 200:** same shape as `POST /cypher`
  (`{rows, columns, rowCount, command}`, columns `["s"]`).
- **Errors:** same as 10.1, plus `kind` other than `'v'`/`'e'` →
  `500 {"severity":"","message":"kind must be 'v' or 'e'","code":""}`,
  non-integer `id` → `500 … "id must be an integer"`.
