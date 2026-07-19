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
 * jsdom smoke test: GraphResultView mounts with a tiny element set.
 * jsdom has no canvas 2d context, so cytoscape's canvas renderer gets a
 * no-op context stub and its render loop is frozen via a rAF stub; layout
 * computation itself is pure JS and runs for real.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactElement } from 'react';
import { createStore } from '../../app/store';
import type { CypherResult } from '../../types';
import GraphResultView from './GraphResultView';

beforeAll(() => {
  const ctx2dStub = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'canvas') return null;
      if (prop === 'measureText') return () => ({ width: 0 });
      if (prop === 'getImageData') return () => ({ data: [] });
      return () => undefined;
    },
    set() {
      return true;
    },
  });
  HTMLCanvasElement.prototype.getContext = (() => ctx2dStub) as never;
  window.requestAnimationFrame = () => 0;
  // cytoscape sizes itself from the container; jsdom reports zeros.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    value: 600,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    value: 400,
  });
  // antd internals want these.
  globalThis.ResizeObserver = class {
    observe() {}

    unobserve() {}

    disconnect() {}
  };
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});

const graphResult: CypherResult = {
  command: 'SELECT',
  rowCount: 1,
  columns: ['v', 'e', 'v2'],
  rows: [
    {
      v: { id: 844424930131969, label: 'person', properties: { id: '1', name: 'Alice' } },
      e: {
        id: 1125899906842625,
        label: 'knows',
        start_id: 844424930131969,
        end_id: 844424930131970,
        properties: { since: 2020 },
      },
      v2: { id: 844424930131970, label: 'person', properties: { id: '2', name: 'Bob' } },
    },
  ],
};

function renderWithStore(ui: ReactElement) {
  const store = createStore();
  return render(<Provider store={store}>{ui}</Provider>);
}

describe('GraphResultView (jsdom smoke)', () => {
  it('mounts: legend badges, footer counts, and a live cytoscape instance', () => {
    const { container } = renderWithStore(
      <GraphResultView result={graphResult} graph="uitest" />,
    );

    // Legend badges from the label palette.
    expect(screen.getByText('person')).toBeTruthy();
    expect(screen.getByText('knows')).toBeTruthy();

    // Footer node/edge counts.
    expect(container.textContent).toContain('Displaying');
    expect(container.textContent).toContain('nodes,');
    expect(container.textContent).toContain('edges');

    // The cytoscape canvas renderer attached its layers to the container.
    const canvasHost = screen.getByTestId('cytoscape-canvas');
    expect(canvasHost.querySelectorAll('canvas').length).toBeGreaterThan(0);
  });

  it('renders an empty graph without crashing', () => {
    const empty: CypherResult = { command: 'SELECT', rowCount: 0, columns: ['v'], rows: [] };
    const { container } = renderWithStore(<GraphResultView result={empty} graph="uitest" />);
    expect(container.textContent).toContain('Displaying');
    expect(screen.getByTestId('cytoscape-canvas')).toBeTruthy();
  });
});
