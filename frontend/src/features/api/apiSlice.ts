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

import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type {
  ApiError,
  ConnectionInfo,
  ConnectRequest,
  CypherResult,
  DeleteElementRequest,
  GetNeighborsRequest,
  InitGraphError,
  KeywordMatrix,
  MetadataResponse,
} from '../../types';

/**
 * All backend errors are HTTP 500 with a `{severity, message, code}` JSON
 * body (contract §1.1, quirk Q1/Q2) — except `POST /cypher/init`, which
 * spreads the pg error and adds `details` without a `message` field.
 * These helpers normalize both shapes to `ApiError` so the UI only ever
 * deals with one error type.
 */
export function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.severity === 'string' &&
    typeof v.message === 'string' &&
    typeof v.code === 'string'
  );
}

function isInitGraphError(value: unknown): value is InitGraphError {
  return typeof value === 'object' && value !== null && 'details' in value;
}

/** The old UI rendered errors as `[severity]:(code) message`. */
export function formatApiError(error: ApiError): string {
  return `[${error.severity}]:(${error.code}) ${error.message}`;
}

function toApiError(error: FetchBaseQueryError): ApiError {
  if ('data' in error) {
    if (isApiError(error.data)) return error.data;
    // /cypher/init inline error format: {...pgError, details} (no message).
    if (isInitGraphError(error.data)) {
      return {
        severity: error.data.severity ?? '',
        message: error.data.details,
        code: error.data.code ?? '',
      };
    }
  }
  if (error.status === 'FETCH_ERROR') {
    return { severity: '', message: error.error, code: 'FETCH_ERROR' };
  }
  if (error.status === 'PARSING_ERROR') {
    return { severity: '', message: error.error, code: 'PARSING_ERROR' };
  }
  return {
    severity: '',
    message: `Unexpected response (status ${String(error.status)})`,
    code: '',
  };
}

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    // Proxied to the backend by Vite in dev; same-origin in production.
    baseUrl: '/api/v1',
    // The session (`connect.sid` cookie) carries all connection state.
    credentials: 'same-origin',
    // Resolve `fetch` at call time (not import time) so tests can stub it.
    fetchFn: (...args) => fetch(...args),
  }),
  tagTypes: ['Connection', 'Metadata', 'Keywords'],
  endpoints: (builder) => ({
    connect: builder.mutation<ConnectionInfo, ConnectRequest>({
      query: (body) => ({ url: '/db/connect', method: 'POST', body }),
      transformErrorResponse: toApiError,
      invalidatesTags: ['Connection', 'Metadata'],
    }),
    getConnectionStatus: builder.query<ConnectionInfo, void>({
      query: () => '/db',
      transformErrorResponse: toApiError,
      providesTags: ['Connection'],
    }),
    // GET, not POST — see contract §3.3.
    disconnect: builder.mutation<{ msg: string }, void>({
      query: () => '/db/disconnect',
      transformErrorResponse: toApiError,
      invalidatesTags: ['Connection', 'Metadata'],
    }),
    getMetaData: builder.mutation<MetadataResponse, { currentGraph?: string } | void>({
      query: (body) => ({ url: '/db/meta', method: 'POST', body: body ?? {} }),
      transformErrorResponse: toApiError,
      invalidatesTags: ['Metadata'],
    }),
    executeCypher: builder.mutation<CypherResult, { cmd: string }>({
      // The request field name is `cmd`, not `query` (contract §3.6).
      query: ({ cmd }) => ({ url: '/cypher', method: 'POST', body: { cmd } }),
      transformErrorResponse: toApiError,
    }),
    /**
     * Expand a vertex's neighborhood (contract §10.1, v2-only). Replaces
     * the old cytoscape context-menu query built with client-side SQL
     * string interpolation. Response has columns ["s","r","t"].
     */
    getNeighbors: builder.mutation<CypherResult, GetNeighborsRequest>({
      query: (body) => ({ url: '/cypher/neighbors', method: 'POST', body }),
      transformErrorResponse: toApiError,
    }),
    /**
     * Delete a graph element (contract §10.2, v2-only): `kind: 'v'`
     * DETACH-DELETEs a vertex, `kind: 'e'` DELETEs an edge.
     */
    deleteElement: builder.mutation<CypherResult, DeleteElementRequest>({
      query: (body) => ({ url: '/cypher/element/delete', method: 'POST', body }),
      transformErrorResponse: toApiError,
    }),
    /**
     * Bulk-create a graph from CSV uploads (contract §3.7).
     * `formData` must carry `graphName`, `dropGraph` ('true'|'false') text
     * fields plus `nodes`/`edges` file parts (part filename = label name).
     * Success is 204 No Content, hence the raw response handling.
     */
    initGraphFromCsv: builder.mutation<void, FormData>({
      query: (formData) => ({
        url: '/cypher/init',
        method: 'POST',
        body: formData,
        // Default JSON parsing would choke on the empty 204 success body;
        // error bodies are parsed so transformErrorResponse can normalize
        // the inline {...pgError, details} shape.
        responseHandler: async (response) => {
          if (response.status === 204) return undefined;
          return response.json().catch(() => ({}));
        },
      }),
      transformErrorResponse: toApiError,
      invalidatesTags: ['Metadata'],
    }),
    getKeywords: builder.query<KeywordMatrix, void>({
      query: () => '/miscellaneous',
      transformErrorResponse: toApiError,
      providesTags: ['Keywords'],
    }),
  }),
});

export const {
  useConnectMutation,
  useGetConnectionStatusQuery,
  useLazyGetConnectionStatusQuery,
  useDisconnectMutation,
  useGetMetaDataMutation,
  useExecuteCypherMutation,
  useGetNeighborsMutation,
  useDeleteElementMutation,
  useInitGraphFromCsvMutation,
  useGetKeywordsQuery,
} = apiSlice;
