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
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import QueryBuilderDrawer from './QueryBuilderDrawer';
import { createStore } from '../../app/store';
import type { AppStore } from '../../app/store';
import { setMetaData } from '../database/metadataSlice';

/** CodeMirror needs layout APIs jsdom lacks — stub it like EditorBar.test does. */
vi.mock('../editor/CodeMirrorEditor', () => ({
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

// MATCH → RETURN, everything else unconnected.
const KEYWORDS = { kw: ['MATCH', 'RETURN'], relationships: [[null, '0', '1'], [null, '0', '0']] };

let store: AppStore;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(KEYWORDS))));
  vi.stubGlobal('Request', FakeRequest);
  store = createStore();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDrawer() {
  return render(
    <Provider store={store}>
      <QueryBuilderDrawer />
    </Provider>,
  );
}

describe('QueryBuilderDrawer', () => {
  it('builds a wrapped cypher command from clicked keywords + selected graph', async () => {
    store.dispatch(setMetaData({ testgraph: {} }));
    renderDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'Query Generator' }));

    // INITIAL suggestions, then MATCH → RETURN after clicking it.
    const matchButton = await screen.findByRole('button', { name: 'MATCH' });
    fireEvent.click(matchButton);
    const returnButton = await screen.findByRole('button', { name: 'RETURN' });
    fireEvent.click(returnButton);

    expect(screen.getByTestId('cm-stub')).toHaveProperty('value', 'MATCH\nRETURN');

    // Submit is disabled until a graph is picked.
    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit).toHaveProperty('disabled', true);

    fireEvent.mouseDown(document.body.querySelector('.ant-select-selector') as Element);
    // Click the visible dropdown item (the role=option node is a hidden a11y clone).
    fireEvent.click(document.body.querySelector('.ant-select-item-option') as Element);

    expect(submit).toHaveProperty('disabled', false);
    fireEvent.click(submit);

    expect(store.getState().editor.command).toBe(
      "SELECT * FROM cypher('testgraph', $$ MATCH\nRETURN $$) as (V agtype)",
    );
  });

  it('submit without a graph or query is a no-op', () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'Query Generator' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(store.getState().editor.command).toBe('');
  });
});
