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
import { setConnectionInfo } from '../database/databaseSlice';
import ServerDisconnectFrame from './ServerDisconnectFrame';
import {
  FakeRequest,
  jsonResponse,
  renderWithStore,
  stubBrowserGlobals,
} from './testUtils';
import type { AppStore } from '../../app/store';

function setup() {
  const rendered = renderWithStore(
    <ServerDisconnectFrame frameKey="sd-1" reqString=":server disconnect" isPinned={false} />,
  );
  seedStore(rendered.store);
  return rendered;
}

function seedStore(store: AppStore) {
  store.dispatch(
    setConnectionInfo({
      host: 'localhost',
      version: '14.5',
      port: 5432,
      database: 'agedb',
      user: 'postgres',
      graphs: ['g1'],
      graph: 'g1',
    }),
  );
  store.dispatch(addFrame(':server disconnect', 'ServerDisconnect', 'sd-1'));
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

describe('ServerDisconnectFrame', () => {
  it('renders the confirmation body with Disconnect and Cancel buttons', () => {
    setup();
    expect(
      screen.getByText('Are you sure you want to disconnect from the database?'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('Cancel trims the ServerDisconnect frame and stays connected', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { store } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(store.getState().frames.filter((f) => f.frameName === 'ServerDisconnect')).toHaveLength(0);
    expect(store.getState().database.status).toBe('connected');
    // Cancel never talks to the backend.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Disconnect closes the session (GET /db/disconnect) and trims itself on success', async () => {
    const fetchMock = vi.fn(async (input: FakeRequest) => {
      if (input.url === '/api/v1/db/disconnect') return jsonResponse({ msg: 'Disconnected' });
      return jsonResponse({ severity: 'ERROR', message: 'unexpected', code: '' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { store } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => {
      expect(store.getState().database.status).toBe('disconnected');
    });
    const [disconnectCall] = fetchMock.mock.calls.map(([input]) => input as FakeRequest);
    // Contract §3.3: disconnect is a GET.
    expect(disconnectCall.method).toBe('GET');

    const state = store.getState();
    // The frame trims itself; connection info is cleared (useCloseSession).
    expect(state.frames.filter((f) => f.frameName === 'ServerDisconnect')).toHaveLength(0);
    expect(state.database.host).toBe('');
    expect(state.metadata.status).toBe('init');
    // The disconnect notice fires only after the actual disconnection.
    expect(state.alerts.map((a) => a.alertName)).toEqual(['NoticeServerDisconnected']);
  });

  it('Disconnect failure leaves the frame open and the connection untouched', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ severity: 'ERROR', message: 'boom', code: 'XX000' }, 500));
    vi.stubGlobal('fetch', fetchMock);
    const { store } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    // Let the rejected mutation settle (useCloseSession swallows it).
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(store.getState().database.status).toBe('connected');
    expect(store.getState().frames.filter((f) => f.frameName === 'ServerDisconnect')).toHaveLength(1);
    expect(store.getState().alerts).toEqual([]);
  });
});
