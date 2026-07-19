// @vitest-environment node
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { apiSlice, formatApiError, isApiError } from './apiSlice';
import type { ApiError, ConnectionInfo, KeywordMatrix } from '../../types';

type FetchMock = ReturnType<typeof vi.fn>;

function createApiStore() {
  return configureStore({
    reducer: { [apiSlice.reducerPath]: apiSlice.reducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(apiSlice.middleware),
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * fetchBaseQuery always does `new Request(url, config)` before calling fetch.
 * Node's undici Request rejects relative URLs, so tests stub Request with a
 * recorder that keeps (url, config) verbatim and normalizes header casing.
 */
class FakeRequest {
  url: string;
  method: string;
  body: unknown;
  credentials: string;
  headers: Record<string, string>;

  constructor(url: string, init: { method?: string; body?: unknown; credentials?: string; headers?: unknown } = {}) {
    this.url = url;
    this.method = init.method ?? 'GET';
    this.body = init.body;
    this.credentials = init.credentials ?? 'same-origin';
    const h = init.headers ?? {};
    const entries: Array<[string, string]> =
      typeof (h as Headers).entries === 'function'
        ? [...(h as Headers).entries()]
        : Object.entries(h as Record<string, string>);
    this.headers = Object.fromEntries(entries.map(([k, v]) => [k.toLowerCase(), v]));
  }
}

/** Capture the (url, request) pairs the stubbed fetch receives. */
function calls(fetchMock: FetchMock): Array<[string, FakeRequest]> {
  return fetchMock.mock.calls.map(([input]) => [
    (input as FakeRequest).url,
    input as FakeRequest,
  ]);
}

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('Request', FakeRequest);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiSlice endpoint shapes', () => {
  it('connect → POST /api/v1/db/connect with JSON body', async () => {
    const info: ConnectionInfo = {
      host: 'localhost',
      version: '14.5',
      port: 5432,
      database: 'agedb',
      user: 'postgres',
      graphs: [],
    };
    fetchMock.mockResolvedValue(jsonResponse(info));
    const store = createApiStore();

    const form = {
      host: 'localhost',
      port: 5432,
      database: 'agedb',
      user: 'postgres',
      password: 'secret',
    };
    const result = await store.dispatch(apiSlice.endpoints.connect.initiate(form));

    expect(result.data).toEqual(info);
    const [[url, init]] = calls(fetchMock);
    expect(url).toBe('/api/v1/db/connect');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(form);
    expect(init.credentials).toBe('same-origin');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('getConnectionStatus → GET /api/v1/db', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ host: 'h' }));
    const store = createApiStore();

    await store.dispatch(apiSlice.endpoints.getConnectionStatus.initiate());

    const [[url, init]] = calls(fetchMock);
    expect(url).toBe('/api/v1/db');
    expect(init.method ?? 'GET').toBe('GET');
    expect(init.credentials).toBe('same-origin');
  });

  it('disconnect → GET /api/v1/db/disconnect (GET, not POST)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ msg: 'Disconnect Successful' }));
    const store = createApiStore();

    const result = await store.dispatch(apiSlice.endpoints.disconnect.initiate());

    expect(result.data).toEqual({ msg: 'Disconnect Successful' });
    const [[url, init]] = calls(fetchMock);
    expect(url).toBe('/api/v1/db/disconnect');
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('getMetaData → POST /api/v1/db/meta, {} body when no graph given', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ g1: {} }));
    const store = createApiStore();

    await store.dispatch(apiSlice.endpoints.getMetaData.initiate());
    await store.dispatch(apiSlice.endpoints.getMetaData.initiate({ currentGraph: 'g2' }));

    const [first, second] = calls(fetchMock);
    expect(first[0]).toBe('/api/v1/db/meta');
    expect(first[1].method).toBe('POST');
    expect(JSON.parse(String(first[1].body))).toEqual({});
    expect(JSON.parse(String(second[1].body))).toEqual({ currentGraph: 'g2' });
  });

  it('executeCypher → POST /api/v1/cypher with {cmd}', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ rows: [{ n: 1 }], columns: ['n'], rowCount: 1, command: 'SELECT' }),
    );
    const store = createApiStore();

    const result = await store.dispatch(
      apiSlice.endpoints.executeCypher.initiate({ cmd: 'MATCH (n) RETURN n' }),
    );

    expect(result.data).toMatchObject({ columns: ['n'], rowCount: 1, command: 'SELECT' });
    const [[url, init]] = calls(fetchMock);
    expect(url).toBe('/api/v1/cypher');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ cmd: 'MATCH (n) RETURN n' });
  });

  it('getKeywords → GET /api/v1/miscellaneous', async () => {
    const matrix: KeywordMatrix = {
      kw: ['MATCH', 'RETURN'],
      relationships: [
        [null, '0', '1'],
        [null, '0', '0'],
      ],
    };
    fetchMock.mockResolvedValue(jsonResponse(matrix));
    const store = createApiStore();

    const result = await store.dispatch(apiSlice.endpoints.getKeywords.initiate());

    expect(result.data).toEqual(matrix);
    const [[url, init]] = calls(fetchMock);
    expect(url).toBe('/api/v1/miscellaneous');
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('initGraphFromCsv → POST /api/v1/cypher/init multipart, 204 on success', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const store = createApiStore();

    const formData = new FormData();
    formData.append('graphName', 'g1');
    formData.append('dropGraph', 'true');
    formData.append('nodes', new Blob(['id,name\n1,a']), 'Person');

    const result = await store.dispatch(apiSlice.endpoints.initGraphFromCsv.initiate(formData));

    expect(result.error).toBeUndefined();
    const [[url, init]] = calls(fetchMock);
    expect(url).toBe('/api/v1/cypher/init');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    // fetchBaseQuery must not force a JSON content type on FormData.
    expect((init.headers as Record<string, string>)['content-type']).toBeUndefined();
  });
});

describe('apiSlice error normalization', () => {
  it('normalizes the global {severity,message,code} error shape', async () => {
    const apiError: ApiError = { severity: 'ERROR', message: 'syntax error', code: '42601' };
    fetchMock.mockResolvedValue(jsonResponse(apiError, 500));
    const store = createApiStore();

    const result = await store.dispatch(
      apiSlice.endpoints.executeCypher.initiate({ cmd: 'broken' }),
    );

    expect(result.error).toEqual(apiError);
    expect(isApiError(result.error)).toBe(true);
    expect(formatApiError(result.error as ApiError)).toBe('[ERROR]:(42601) syntax error');
  });

  it('normalizes /cypher/init inline {...pgError, details} errors (no message field)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { severity: 'ERROR', code: '42601', details: 'error: syntax error at or near "x"' },
        500,
      ),
    );
    const store = createApiStore();

    const formData = new FormData();
    formData.append('graphName', 'g1');
    formData.append('dropGraph', 'false');
    const result = await store.dispatch(apiSlice.endpoints.initGraphFromCsv.initiate(formData));

    expect(result.error).toEqual({
      severity: 'ERROR',
      code: '42601',
      message: 'error: syntax error at or near "x"',
    });
  });

  it('normalizes network failures', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const store = createApiStore();

    const result = await store.dispatch(apiSlice.endpoints.getKeywords.initiate());

    expect(isApiError(result.error)).toBe(true);
    expect((result.error as ApiError).code).toBe('FETCH_ERROR');
    expect((result.error as ApiError).message).toContain('Failed to fetch');
  });
});
