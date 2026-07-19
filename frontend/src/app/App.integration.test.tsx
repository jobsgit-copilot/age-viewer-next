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
 * Full-app integration test: real store, real App layout, fetch stubbed at
 * the network boundary (FakeRequest pattern from apiSlice.test.ts).
 *
 * Flow: (a) disconnected → ServerConnect auto-opens; (b) submit the connect
 * form → ServerStatus appears; (c) run a cypher command → CypherResultFrame
 * renders the result.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import App from '../App';
import { createStore } from './store';
import type { AppStore } from './store';
import { FakeRequest, jsonResponse, stubBrowserGlobals } from '../features/frames/testUtils';
import type { ConnectionInfo, CypherResult, KeywordMatrix, MetadataResponse } from '../types';

/**
 * CodeMirror 6 needs layout APIs jsdom does not implement, so the editor is
 * stubbed with a textarea (same approach as EditorBar.test.tsx); the toolbar
 * and run orchestration stay real.
 */
vi.mock('../features/editor/CodeMirrorEditor', () => ({
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

const KEYWORDS: KeywordMatrix = {
  kw: ['MATCH', 'RETURN'],
  relationships: [
    [null, '0', '1'],
    [null, '0', '0'],
  ],
};

const CONNECTION: ConnectionInfo = {
  host: 'localhost',
  version: '14.5',
  port: 5432,
  database: 'agedb',
  user: 'postgres',
  graphs: ['g1'],
  graph: 'g1',
};

const METADATA: MetadataResponse = {
  g1: {
    nodes: [
      {
        label: 'Person',
        cnt: 3,
        namespace_id: 1,
        namespace: 1,
        oid: 1,
        name: 'Person',
        kind: 'v',
        graph: 1,
      },
    ],
    edges: [],
    propertyKeys: [],
    graph: 'g1',
    database: 'agedb',
  },
};

const CYPHER_RESULT: CypherResult = {
  command: 'SELECT',
  rowCount: 1,
  columns: ['v'],
  rows: [{ v: { id: 844424930131969, label: 'person', properties: { name: 'Alice' } } }],
};

/**
 * Stateful backend stub: /db fails until /db/connect succeeds (mirrors the
 * real session lifecycle; the connect mutation invalidates the Connection
 * tag, so App refetches /db right after connecting).
 */
function createFetchMock() {
  let connected = false;
  return vi.fn((input: FakeRequest) => {
    if (input.url === '/api/v1/miscellaneous') return Promise.resolve(jsonResponse(KEYWORDS));
    if (input.url === '/api/v1/db') {
      return Promise.resolve(
        connected
          ? jsonResponse(CONNECTION)
          : jsonResponse({ severity: '', message: 'Not connected', code: '' }, 500),
      );
    }
    if (input.url === '/api/v1/db/connect') {
      connected = true;
      return Promise.resolve(jsonResponse(CONNECTION));
    }
    if (input.url === '/api/v1/db/meta') return Promise.resolve(jsonResponse(METADATA));
    if (input.url === '/api/v1/cypher') return Promise.resolve(jsonResponse(CYPHER_RESULT));
    return Promise.resolve(jsonResponse({ severity: 'ERROR', message: 'unexpected', code: '' }, 500));
  });
}

function fillConnectForm() {
  fireEvent.change(screen.getByLabelText('Connect URL'), { target: { value: 'localhost' } });
  fireEvent.change(screen.getByLabelText('Connect Port'), { target: { value: '5432' } });
  fireEvent.change(screen.getByLabelText('Database Name'), { target: { value: 'agedb' } });
  fireEvent.change(screen.getByLabelText('User Name'), { target: { value: 'postgres' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
}

beforeAll(() => {
  stubBrowserGlobals();
  // GraphResultView renders cytoscape into a canvas — same stubs as
  // ResultFrame.test.tsx.
  const ctx2dStub = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'canvas') return null;
        if (prop === 'measureText') return () => ({ width: 0 });
        if (prop === 'getImageData') return () => ({ data: [] });
        return () => undefined;
      },
      set() {
        return true;
      },
    },
  );
  HTMLCanvasElement.prototype.getContext = (() => ctx2dStub) as never;
  window.requestAnimationFrame = () => 0;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 400 });
});

let store: AppStore;

beforeEach(() => {
  vi.stubGlobal('fetch', createFetchMock());
  vi.stubGlobal('Request', FakeRequest);
  store = createStore();
  render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App integration', () => {
  it('(a) disconnected status auto-opens the ServerConnect frame', async () => {
    await screen.findByText('Connect to Database');
    const { frames } = store.getState();
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      frameName: 'ServerConnect',
      frameProps: { reqString: ':server connect' },
    });
    expect(screen.getByLabelText('Connect URL')).toBeTruthy();
  });

  it('(b)+(c) connect → ServerStatus, then a cypher run renders the result frame', async () => {
    // (a) precondition.
    await screen.findByText('Connect to Database');

    // (b) connect.
    fillConnectForm();
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    await screen.findByText('Connection Status');
    expect(screen.queryByText('Connect to Database')).toBeNull();
    expect(store.getState().database).toMatchObject({
      status: 'connected',
      host: 'localhost',
      graph: 'g1',
    });
    expect(store.getState().metadata.currentGraph).toBe('g1');

    // (c) run a cypher command.
    fireEvent.change(screen.getByTestId('cm-stub'), {
      target: { value: 'MATCH (n) RETURN n' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run Query' }));

    // The frame opens with the query in its header.
    await screen.findByText('MATCH (n) RETURN n');
    await waitFor(() => {
      const frame = store.getState().frames.find((f) => f.frameName === 'CypherResultFrame');
      expect(frame).toBeTruthy();
      expect(store.getState().results[frame!.frameProps.key]?.status).toBe('fulfilled');
    });

    // The result view switch renders; the table shows the returned vertex.
    fireEvent.click(await screen.findByText('Table'));
    await screen.findByText(/Alice/);
    expect(store.getState().editor.commandHistory).toEqual(['MATCH (n) RETURN n']);
  });
});
