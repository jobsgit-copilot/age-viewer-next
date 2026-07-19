# Frontend rewrite — decisions & deviations

Foundation ("skeleton") of the AGE Viewer frontend rewrite. The backend it
talks to is specified by `docs/api-contract.md` (running at
`http://localhost:3001`, proxied under `/api` by Vite in dev).

## Stack

- **Vite 7 + React 19 + TypeScript (strict)** — replaces react-scripts 4 /
  React 17 / JSX.
- **antd 5 is the ONLY UI kit.** The old frontend mixed bootstrap 4 +
  react-bootstrap + antd 4 + FontAwesome; all of that is dropped. Icons will
  come from `@ant-design/icons` (antd dependency) when feature UIs land.
- **Redux Toolkit 2 + RTK Query + react-redux 9.** All server state
  (connection info, metadata, cypher results, keyword matrix) lives in
  `src/features/api/apiSlice.ts`. The UI slices are pure
  `createSlice` reducers — **no thunks** (the old slices were full of
  `createAsyncThunk` fetch wrappers; those are gone).
- **Function components + hooks only.** No `connect()`, no PropTypes —
  TypeScript types instead. Typed hooks in `src/app/hooks.ts`.
- **vitest + @testing-library/react + jsdom** (`npm test` = `vitest run`).
- Build output dir is **`build/`** (not Vite's default `dist/`), because the
  backend statically serves `frontend/build` — same as the old CRA output.
- ESLint 9 flat config (`eslint.config.js`): `@eslint/js` recommended +
  `typescript-eslint` recommended + `react-hooks`.

## Layout

Single page, no router. `src/App.tsx` = antd `ConfigProvider` + `Layout`:
top bar (title + editor placeholder + connection status), left sider
placeholder, contents placeholder. Theme tokens approximate the old
`src/static/style.css` (`#142B80` navy top bar, `#2756FF` accent, `#222430`
dark bg, `#343a40` sidebar); `setting.theme` switches antd's
default/dark algorithm.

On mount the app fires the same hot-path the old `DefaultTemplate` did:
`GET /api/v1/miscellaneous` (keyword matrix) + `GET /api/v1/db`
(connection status), mirroring the result into the `database` slice.

## State layout (state keys keep the old names)

| key         | source slice (old)            | notes |
|-------------|-------------------------------|-------|
| `api`       | — (new, RTK Query)            | all server state; replaces CypherSlice thunks and the fetch calls inside DatabaseSlice/MetadataSlice |
| `database`  | DatabaseSlice                 | status + connection echo |
| `metadata`  | MetadataSlice                 | graphs/currentGraph + client-side `'*'` count aggregation (`processMetadataResponse`) |
| `frames`    | FrameSlice                    | add/remove/pin/trim ported 1:1 (incl. the `-1` splice quirk when all frames are pinned) |
| `editor`    | EditorSlice                   | command/history/favorites; same `/(CREATE\|REMOVE\|DELETE)/g` update-clause regex |
| `setting`   | SettingSlice + conf/config.js | theme + limits + about info |
| `alerts`    | AlertSlice                    | named alert stack (Notice/Error) |
| `modal`     | ModalSlice                    | isOpen/isTutorial/histories |
| `navigator` | MenuSlice                     | active menu toggle |
| `layout`    | LayoutSlice                   | label toggle |

## Deviations from the old frontend

1. **localStorage instead of cookies.** The old app persisted settings via
   `react-cookies` (`features/cookie/CookieUtil.js`). Cookies travel to the
   server on every request for no reason; v2 persists UI-only slices
   (`setting`, editor history/favorites) in `localStorage` under the
   `age-viewer:` prefix (`src/app/persistence.ts`), throttled writes from a
   store subscription. The `connect.sid` session cookie is untouched — it
   is set by the backend and handled by the browser automatically
   (`credentials: 'same-origin'` on every RTK Query call).
2. **No password in the store.** The old DatabaseSlice kept the DB password
   in redux (the old backend even echoed it back — quirk Q4). The v2
   database slice has no `password` field at all; the v2 backend also no
   longer echoes it (contract §9.1). Passwords exist only transiently in
   the connect form / `connect` mutation payload. Nothing sensitive is
   persisted to localStorage.
3. **Hooks-only, single UI kit** — see Stack above.
4. **Menu icons out of redux.** The old MenuSlice stored FontAwesome icon
   objects in state (non-serializable). `navigator.menuList` now holds menu
   id strings; icon mapping is a rendering concern.
5. **`resetMetaData` implements the intent, not the bug.** The old reducer
   `(state) => state.initialState` read a non-existent property and was a
   silent no-op; v2 actually resets to initial state.
6. **CypherSlice not ported as a slice.** Its `queryResult` map is server
   state; frames will consume `executeCypher` mutation results from RTK
   Query when the frames feature lands.
7. **`react-uuid` replaced** by `crypto.randomUUID()` (`src/app/id.ts`,
   with a fallback).
8. **Tutorial dialog intentionally NOT ported (waived).** The old
   `components/modal/Tutorial*` walkthrough is dropped: it duplicates what
   the UI already shows inline, and keeping a second tour in sync is ongoing
   cost. The `modal` slice's `isTutorial` state is retained in case a tour
   is ever reintroduced; no component reads it today.

## Contract quirks honored in the API layer

- All error responses are normalized to `{severity, message, code}`
  (`ApiError`), including `/cypher/init`'s inline `{...pgError, details}`
  shape which has no `message` (quirk Q2). Old display format
  `[severity]:(code) message` is available via `formatApiError`.
- `disconnect` uses **GET** (contract §3.3).
- `executeCypher` sends `{cmd}`, not `{query}` (§3.6).
- `initGraphFromCsv` is multipart FormData (part filename = label name,
  `dropGraph` is the string `'true'`), success is **204** with an empty
  body (§3.7).
- `KeywordMatrix.relationships` rows keep their leading `null` and their
  `"0"/"1"` **strings** — the query builder compares `!== '0'`
  (§3.8).
- `port` is `number | string`, `graph` may be absent, `version` may be
  `null` — mirrored in `ConnectionInfo` (§4.1).

## Tests

- `src/app/store.test.ts` — store smoke test: every slice registers with
  the expected key/initial state; a few reducers exercised (editor
  update-clause regex, frames pin/add, alerts).
- `src/features/api/apiSlice.test.ts` — endpoint shapes with a stubbed
  global `fetch` (no MSW): URL/method/body per endpoint, ApiError
  normalization for 500s and the `/cypher/init` inline shape, 204 handling.
