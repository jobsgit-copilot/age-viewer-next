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

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { addFrame } from '../frame/frameSlice';
import ServerConnectFrame from './ServerConnectFrame';
import { FakeRequest, jsonResponse, renderWithStore, stubBrowserGlobals } from './testUtils';
import type { ConnectionInfo, MetadataResponse } from '../../types';

const connectionInfo: ConnectionInfo = {
  host: 'localhost',
  version: '14.5',
  port: 5432,
  database: 'agedb',
  user: 'postgres',
  graphs: [],
};

const metadataResponse: MetadataResponse = {
  g1: {
    nodes: [],
    edges: [],
    propertyKeys: [],
    graph: 'g1',
    database: 'agedb',
  },
};

function renderFrame() {
  return renderWithStore(
    <ServerConnectFrame frameKey="sc-1" reqString=":server connect" isPinned={false} />,
  );
}

function fillForm() {
  fireEvent.change(screen.getByLabelText('Connect URL'), { target: { value: 'localhost' } });
  fireEvent.change(screen.getByLabelText('Connect Port'), { target: { value: '5432' } });
  fireEvent.change(screen.getByLabelText('Database Name'), { target: { value: 'agedb' } });
  fireEvent.change(screen.getByLabelText('User Name'), { target: { value: 'postgres' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
}

beforeAll(() => {
  stubBrowserGlobals();
});

beforeEach(() => {
  vi.stubGlobal('Request', FakeRequest);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ServerConnectFrame', () => {
  it('renders the required connect form fields', () => {
    renderFrame();

    expect(screen.getByLabelText('Connect URL')).toBeTruthy();
    expect(screen.getByLabelText('Connect Port')).toBeTruthy();
    expect(screen.getByLabelText('Database Name')).toBeTruthy();
    expect(screen.getByLabelText('User Name')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    // All five fields are required (old form rules).
    expect(document.querySelectorAll('.ant-form-item-required')).toHaveLength(5);
  });

  it('connect success: notice alert, ServerConnect trimmed, metadata + graph set, ServerStatus opened', async () => {
    const fetchMock = vi.fn(async (input: FakeRequest) => {
      if (input.url === '/api/v1/db/connect') return jsonResponse(connectionInfo);
      if (input.url === '/api/v1/db/meta') return jsonResponse(metadataResponse);
      return jsonResponse({ severity: 'ERROR', message: 'unexpected', code: '' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { store } = renderFrame();
    store.dispatch(addFrame(':server connect', 'ServerConnect', 'sc-1'));

    fillForm();
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(store.getState().alerts.map((a) => a.alertName)).toContain('NoticeServerConnected');
    });

    const state = store.getState();
    // ServerConnect trimmed, ServerStatus opened.
    expect(state.frames).toHaveLength(1);
    expect(state.frames[0]).toMatchObject({ frameName: 'ServerStatus' });
    // Metadata mirrored into the slice and the database points at the first graph.
    expect(state.metadata.currentGraph).toBe('g1');
    expect(state.database.graph).toBe('g1');
    expect(state.alerts.map((a) => a.alertName)).not.toContain('ErrorMetaFail');

    const [connectCall, metaCall] = fetchMock.mock.calls.map(([input]) => input as FakeRequest);
    expect(connectCall.url).toBe('/api/v1/db/connect');
    expect(JSON.parse(String(connectCall.body))).toEqual({
      host: 'localhost',
      port: 5432,
      database: 'agedb',
      user: 'postgres',
      password: 'secret',
    });
    expect(metaCall.url).toBe('/api/v1/db/meta');
  });

  it('connect failure: ErrorServerConnectFail alert with the old formatted message', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        { severity: 'FATAL', message: 'password authentication failed', code: '28P01' },
        500,
      ));
    vi.stubGlobal('fetch', fetchMock);
    const { store } = renderFrame();

    fillForm();
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(store.getState().alerts.map((a) => a.alertName)).toContain('ErrorServerConnectFail');
    });
    const alert = store.getState().alerts[0];
    expect(alert.alertProps.alertType).toBe('Error');
    expect(alert.alertProps.errorMessage).toBe('[FATAL]:(28P01) password authentication failed');
    // No ServerStatus frame opened on failure.
    expect(store.getState().frames).toEqual([]);
  });
});
