/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * Domain types mirroring the backend HTTP API contract
 * (`docs/api-contract.md`, esp. section 4 "Data shapes").
 */

/** A parsed agtype value (contract §4.2). */
export type AgtypeValue =
  | string
  | number
  | boolean
  | null
  | AgtypeValue[]
  | { [key: string]: AgtypeValue };

/** Vertex as it arrives on the wire: `{id, label, properties}` (§4.2). */
export interface AgtypeVertex {
  id: number;
  label: string;
  properties: Record<string, AgtypeValue>;
}

/**
 * Edge as it arrives on the wire (§4.2). There is no type marker —
 * edges are identifiable only by the presence of `start_id`/`end_id`.
 */
export interface AgtypeEdge {
  id: number;
  label: string;
  start_id: number;
  end_id: number;
  properties: Record<string, AgtypeValue>;
}

/** Path: alternating vertex/edge objects (`::path` annotation discarded). */
export type AgtypePath = Array<AgtypeVertex | AgtypeEdge>;

/** Type guard: an agtype object is an edge iff it carries start/end ids. */
export function isAgtypeEdge(value: unknown): value is AgtypeEdge {
  return (
    typeof value === 'object' &&
    value !== null &&
    'start_id' in value &&
    'end_id' in value
  );
}

/** Type guard for the vertex shape (has label+properties but no edge ids). */
export function isAgtypeVertex(value: unknown): value is AgtypeVertex {
  return (
    typeof value === 'object' &&
    value !== null &&
    'label' in value &&
    'properties' in value &&
    !isAgtypeEdge(value)
  );
}

/** `POST /api/v1/cypher` success body (§3.6). */
export interface CypherResult {
  /** Raw node-pg row objects keyed by column alias; agtype columns pre-parsed. */
  rows: Array<Record<string, AgtypeValue>>;
  columns: string[];
  /** node-pg rowCount of the last result; null for utility statements. */
  rowCount: number | null;
  /** node-pg command tag of the last result, e.g. "SELECT". */
  command: string;
}

/** Body of `POST /api/v1/cypher/neighbors` (§10.1, v2-only). */
export interface GetNeighborsRequest {
  /** Graph name — must exist in ag_catalog.ag_graph. */
  graph: string;
  /** Integer AGE graphid of the vertex to expand. */
  vertexId: number | string;
  /** Optional positive-integer LIMIT on the expansion rows. */
  limit?: number | string;
}

/** Body of `POST /api/v1/cypher/element/delete` (§10.2, v2-only). */
export interface DeleteElementRequest {
  /** Graph name — must exist in ag_catalog.ag_graph. */
  graph: string;
  /** Integer AGE graphid of the element to delete. */
  id: number | string;
  /** 'v' DETACH-DELETEs a vertex (and its edges); 'e' DELETEs an edge. */
  kind: 'v' | 'e';
}

/**
 * Global error body (§1.1). Every backend error is HTTP 500 with exactly
 * these three fields, except `POST /cypher/init` which spreads the pg error
 * plus `details` and has no `message` (quirk Q2).
 */
export interface ApiError {
  severity: string;
  message: string;
  code: string;
}

/** Inline error shape of `POST /api/v1/cypher/init` failures (§3.7). */
export interface InitGraphError {
  details: string;
  severity?: string;
  code?: string;
  [key: string]: unknown;
}

/**
 * Connection-info object returned by `POST /db/connect` and `GET /db` (§4.1).
 * The v2 backend no longer echoes `password` (rewrite deviation §9.1).
 */
export interface ConnectionInfo {
  host: string;
  /** Raw `server_version` string; null until first connect. */
  version: string | null;
  /** Echoed exactly as supplied in the connect body. */
  port: number | string;
  database: string;
  user: string;
  /** Graph-name cache; [] until /db/meta refreshes it. */
  graphs: string[];
  /** Current graph; ABSENT from the JSON when undefined. */
  graph?: string;
}

/** Body of `POST /api/v1/db/connect` (§3.1). */
export interface ConnectRequest {
  host: string;
  port: number | string;
  database: string;
  user: string;
  /** Sent to the backend over the wire but NEVER kept in the redux store. */
  password: string;
  graph?: string;
  graphs?: string[];
  server?: string;
}

/** One row of the version-specific `meta_data` query (§3.4). */
export interface LabelMetaRow {
  label: string;
  namespace_id: number;
  /** reltuples estimate; float4, may be -1 or fractional. */
  cnt: number;
  namespace: number;
  oid: number;
  name: string;
  kind: 'v' | 'e';
  graph: number;
  /** AGE 1.7 servers return a wider column set (contract §9.7). */
  [extra: string]: unknown;
}

export interface RoleInfo {
  user_name: string;
  role_name: 'admin' | 'user';
}

/** Full metadata for the selected graph (§3.4). */
export interface GraphMetadata {
  nodes: LabelMetaRow[];
  edges: LabelMetaRow[];
  /** Always [] server-side (quirk Q18). */
  propertyKeys: unknown[];
  graph: string;
  database: string;
  /** Absent when the user is not found in pg_user (quirk Q19). */
  role?: RoleInfo;
}

/**
 * `POST /api/v1/db/meta` success body (§3.4): keyed by EVERY graph name in
 * the database; the selected graph maps to full metadata, all others to {}.
 */
export type MetadataResponse = Record<string, GraphMetadata | Record<string, never>>;

/** `GET /api/v1/miscellaneous` success body (§3.8). */
export interface KeywordMatrix {
  /** Cypher keywords, e.g. ["MATCH", "WITH", ...]. */
  kw: string[];
  /**
   * One row per keyword; each row is a leading null (artifact of the
   * backend's papaparse transform) followed by "0"/"1" STRINGS — the
   * query builder compares with `!== '0'`, so they must stay strings.
   */
  relationships: Array<Array<null | string>>;
}
