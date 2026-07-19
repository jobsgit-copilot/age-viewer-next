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
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import EditorBar from './EditorBar';
import { createStore } from '../../app/store';
import type { AppStore } from '../../app/store';
import { setConnectionInfo, clearConnection } from '../database/databaseSlice';
import { setCommand } from './editorSlice';
import type { ConnectionInfo } from '../../types';

/**
 * CodeMirror 6 needs layout APIs jsdom does not implement, so the editor
 * itself is stubbed with a textarea; toolbar + orchestration stay real.
 */
vi.mock('./CodeMirrorEditor', () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (next: string) => void;
  }) => (
    <textarea
      data-testid="cm-stub"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

type FetchMock = ReturnType<typeof vi.fn>;

/** Same trick as apiSlice.test.ts: keep relative URLs working for fetchBaseQuery. */
class FakeRequest {
  url: string;
  method: string;
  body: unknown;

  constructor(url: string, init: { method?: string; body?: unknown } = {}) {
    this.url = url;
    this.method = init.method ?? 'GET';
    this.body = init.body;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const KEYWORDS = { kw: ['MATCH', 'RETURN'], relationships: [[null, '0', '1'], [null, '0', '0']] };
const CYPHER_OK = { rows: [], columns: [], rowCount: 0, command: 'SELECT' };

function urlsCalled(fetchMock: FetchMock): string[] {
  return fetchMock.mock.calls.map(([input]) => (input as FakeRequest).url);
}

const CONNECTION: ConnectionInfo = {
  host: 'localhost',
  version: '14.5',
  port: 5432,
  database: 'agedb',
  user: 'postgres',
  graphs: [],
};

let fetchMock: FetchMock;
let store: AppStore;

function renderBar() {
  return render(
    <Provider store={store}>
      <EditorBar />
    </Provider>,
  );
}

beforeEach(() => {
  fetchMock = vi.fn((input: FakeRequest) => {
    if (input.url === '/api/v1/miscellaneous') return Promise.resolve(jsonResponse(KEYWORDS));
    if (input.url === '/api/v1/cypher') return Promise.resolve(jsonResponse(CYPHER_OK));
    if (input.url === '/api/v1/db/meta') return Promise.resolve(jsonResponse({}));
    return Promise.resolve(jsonResponse({}));
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('Request', FakeRequest);
  store = createStore();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('EditorBar', () => {
  it('renders the toolbar (run, favorite, favorites/history dropdowns, label toggle)', () => {
    renderBar();
    expect(screen.getByRole('button', { name: 'Run Query' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Toggle favorite' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Favorites' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'History' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Labels' })).toBeDefined();
  });

  it('runs a cypher command: CypherResultFrame + executeCypher + history + clear', async () => {
    store.dispatch(setConnectionInfo(CONNECTION));
    store.dispatch(setCommand('MATCH (n) RETURN n'));
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'Run Query' }));

    const state = store.getState();
    expect(state.frames).toHaveLength(1);
    expect(state.frames[0].frameName).toBe('CypherResultFrame');
    expect(state.frames[0].frameProps.reqString).toBe('MATCH (n) RETURN n');
    expect(state.editor.command).toBe('');
    expect(state.editor.commandHistory).toEqual(['MATCH (n) RETURN n']);

    await waitFor(() => expect(urlsCalled(fetchMock)).toContain('/api/v1/cypher'));
    const cypherCall = fetchMock.mock.calls.find(
      ([input]) => (input as FakeRequest).url === '/api/v1/cypher',
    );
    expect(JSON.parse(String((cypherCall![0] as FakeRequest).body))).toEqual({
      cmd: 'MATCH (n) RETURN n',
    });
    expect(store.getState().alerts).toEqual([]);
  });

  it('on rejected cypher: ErrorCypherQuery alert with formatted ApiError + command restored', async () => {
    fetchMock = vi.fn((input: FakeRequest) => {
      if (input.url === '/api/v1/cypher') {
        return Promise.resolve(
          jsonResponse({ severity: 'ERROR', message: 'syntax error', code: '42601' }, 500),
        );
      }
      if (input.url === '/api/v1/miscellaneous') return Promise.resolve(jsonResponse(KEYWORDS));
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    store.dispatch(setConnectionInfo(CONNECTION));
    store.dispatch(setCommand('MATCH ('));
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'Run Query' }));

    await waitFor(() => expect(store.getState().alerts).toHaveLength(1));
    const alert = store.getState().alerts[0];
    expect(alert.alertName).toBe('ErrorCypherQuery');
    expect(alert.alertProps.errorMessage).toBe('[ERROR]:(42601) syntax error');
    // Old behavior: the failed command is restored into the cleared editor.
    expect(store.getState().editor.command).toBe('MATCH (');
  });

  it('CREATE/REMOVE/DELETE commands refresh metadata after a successful run', async () => {
    store.dispatch(setConnectionInfo(CONNECTION));
    store.dispatch(setCommand('CREATE (n:Person) RETURN n'));
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'Run Query' }));

    await waitFor(() => expect(urlsCalled(fetchMock)).toContain('/api/v1/db/meta'));
  });

  it('read-only commands do not refresh metadata', async () => {
    store.dispatch(setConnectionInfo(CONNECTION));
    store.dispatch(setCommand('MATCH (n) RETURN n'));
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'Run Query' }));

    await waitFor(() => expect(urlsCalled(fetchMock)).toContain('/api/v1/cypher'));
    expect(urlsCalled(fetchMock)).not.toContain('/api/v1/db/meta');
  });

  it("':server status' adds a ServerStatus frame without touching the backend", async () => {
    store.dispatch(setCommand(':server status'));
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'Run Query' }));

    const state = store.getState();
    expect(state.frames[0]?.frameName).toBe('ServerStatus');
    expect(urlsCalled(fetchMock)).not.toContain('/api/v1/cypher');
    expect(state.editor.commandHistory).toEqual([':server status']);
  });

  it('cypher while disconnected adds an error alert + ServerConnect frame, no query', () => {
    store.dispatch(clearConnection());
    store.dispatch(setCommand('MATCH (n) RETURN n'));
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'Run Query' }));

    const state = store.getState();
    expect(state.frames[0]?.frameName).toBe('ServerConnect');
    expect(state.alerts.map((a) => a.alertName)).toEqual(['ErrorNoDatabaseConnected']);
    expect(urlsCalled(fetchMock)).not.toContain('/api/v1/cypher');
  });

  it('ignores an empty command (old app fired an empty query)', () => {
    store.dispatch(setConnectionInfo(CONNECTION));
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'Run Query' }));

    expect(store.getState().frames).toEqual([]);
    expect(store.getState().editor.commandHistory).toEqual([]);
    expect(urlsCalled(fetchMock)).not.toContain('/api/v1/cypher');
  });

  it('star toggles the current command in/out of favorites', () => {
    store.dispatch(setCommand('MATCH (n) RETURN n'));
    renderBar();

    const star = screen.getByRole('button', { name: 'Toggle favorite' });
    fireEvent.click(star);
    expect(store.getState().editor.commandFavorites).toEqual(['MATCH (n) RETURN n']);

    fireEvent.click(star);
    expect(store.getState().editor.commandFavorites).toEqual([]);
  });

  it('history dropdown sets the command back into the editor', async () => {
    store.dispatch(setConnectionInfo(CONNECTION));
    store.dispatch(setCommand('MATCH (n) RETURN n'));
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Run Query' }));
    await waitFor(() => expect(urlsCalled(fetchMock)).toContain('/api/v1/cypher'));

    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    const item = await screen.findByText('MATCH (n) RETURN n');
    fireEvent.click(item);

    expect(store.getState().editor.command).toBe('MATCH (n) RETURN n');
  });

  it('label toggle flips layout.isLabel', () => {
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Labels' }));
    expect(store.getState().layout.isLabel).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Labels' }));
    expect(store.getState().layout.isLabel).toBe(false);
  });
});
