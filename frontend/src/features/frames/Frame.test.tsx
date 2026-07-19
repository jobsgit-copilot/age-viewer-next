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
import { act, fireEvent, screen } from '@testing-library/react';
import { useAppSelector } from '../../app/hooks';
import { addFrame } from '../frame/frameSlice';
import Frame from './Frame';
import { renderWithStore, stubBrowserGlobals } from './testUtils';

/**
 * Renders the first frame of the frames slice, the same way FrameArea does —
 * so store updates (pin/remove) flow back into the rendered Frame props.
 */
function FirstFrame() {
  const frame = useAppSelector((state) => state.frames[0]);
  if (!frame) return null;
  return (
    <Frame
      frameKey={frame.frameProps.key}
      reqString={frame.frameProps.reqString}
      isPinned={frame.isPinned}
    >
      <div>the-body</div>
    </Frame>
  );
}

beforeAll(() => {
  stubBrowserGlobals();
});

describe('Frame', () => {
  it('shows the trimmed reqString in the header', () => {
    renderWithStore(
      <Frame frameKey="k1" reqString="  MATCH (n) RETURN n  " isPinned={false}>
        <div>body</div>
      </Frame>,
    );

    expect(screen.getByText('MATCH (n) RETURN n')).toBeTruthy();
  });

  it('pin toggle pins and unpins the frame', () => {
    const { store } = renderWithStore(<FirstFrame />);
    act(() => {
      store.dispatch(addFrame('q', 'CypherFrame', 'k1'));
    });
    expect(store.getState().frames[0].isPinned).toBe(false);

    fireEvent.click(screen.getByTitle('Pin'));
    expect(store.getState().frames[0].isPinned).toBe(true);

    fireEvent.click(screen.getByTitle('Unpin'));
    expect(store.getState().frames[0].isPinned).toBe(false);
  });

  it('close removes the frame after confirming the popconfirm', () => {
    const { store } = renderWithStore(<FirstFrame />);
    act(() => {
      store.dispatch(addFrame('q', 'CypherFrame', 'k1'));
    });

    fireEvent.click(screen.getByTitle('Close Window'));
    expect(screen.getByText('Are you sure you want to close this window?')).toBeTruthy();
    fireEvent.click(screen.getByText('OK'));

    expect(store.getState().frames).toEqual([]);
    expect(screen.queryByText('the-body')).toBeNull();
  });

  it('collapse toggle hides the body', () => {
    renderWithStore(
      <Frame frameKey="k1" reqString="q" isPinned={false}>
        <div>the-body</div>
      </Frame>,
    );

    const body = screen.getByText('the-body').parentElement as HTMLElement;
    expect(body.className).not.toContain('contract');

    fireEvent.click(screen.getByTitle('Hide'));
    expect(body.className).toContain('contract');

    fireEvent.click(screen.getByTitle('Show'));
    expect(body.className).not.toContain('contract');
  });
});
