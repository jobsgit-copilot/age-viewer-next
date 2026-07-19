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

import { beforeAll, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import { clearConnection, setConnectionInfo } from '../database/databaseSlice';
import FrameArea from './FrameArea';
import { renderWithStore, stubBrowserGlobals } from './testUtils';

beforeAll(() => {
  stubBrowserGlobals();
});

describe('FrameArea auto-open', () => {
  it('opens a ServerConnect frame when the status is disconnected', async () => {
    const { store } = renderWithStore(<FrameArea />);
    act(() => {
      store.dispatch(clearConnection());
    });

    await screen.findByText('Connect to Database');
    const { frames } = store.getState();
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      frameName: 'ServerConnect',
      frameProps: { reqString: ':server connect' },
    });
    // The required connect form is rendered inside the auto-opened frame.
    expect(screen.getByLabelText('Connect URL')).toBeTruthy();
  });

  it('does not duplicate an already-open ServerConnect frame', () => {
    const { store } = renderWithStore(<FrameArea />);
    act(() => {
      store.dispatch(clearConnection());
    });
    expect(store.getState().frames).toHaveLength(1);

    // Re-renders triggered by further dispatches must not add a second one.
    act(() => {
      store.dispatch(clearConnection());
    });
    expect(store.getState().frames.filter((f) => f.frameName === 'ServerConnect')).toHaveLength(1);
  });

  it('trims the ServerConnect frame when the status becomes connected', async () => {
    const { store } = renderWithStore(<FrameArea />);
    act(() => {
      store.dispatch(clearConnection());
    });
    await screen.findByText('Connect to Database');

    act(() => {
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
    });

    expect(store.getState().frames.filter((f) => f.frameName === 'ServerConnect')).toHaveLength(0);
    expect(screen.queryByText('Connect to Database')).toBeNull();
  });
});
