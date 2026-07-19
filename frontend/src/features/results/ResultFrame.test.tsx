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
 * ResultFrame view-switch tests: default tab selection, disabled graph
 * tab for non-graph results, and utility-command status messages.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactElement } from 'react';
import { createStore } from '../../app/store';
import type { CypherResult } from '../../types';
import ResultFrame from './ResultFrame';

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
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    value: 600,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    value: 400,
  });
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
  columns: ['v'],
  rows: [{ v: { id: 844424930131969, label: 'person', properties: { name: 'Alice' } } }],
};

const scalarResult: CypherResult = {
  command: 'SELECT',
  rowCount: 1,
  columns: ['a'],
  rows: [{ a: 1 }],
};

const utilityResult: CypherResult = {
  command: 'CREATE',
  rowCount: 0,
  columns: [],
  rows: [],
};

function renderWithStore(ui: ReactElement) {
  const store = createStore();
  return render(<Provider store={store}>{ui}</Provider>);
}

describe('ResultFrame', () => {
  it('defaults to the graph view when rows contain graph elements', () => {
    renderWithStore(<ResultFrame reqString="MATCH (v) RETURN v" result={graphResult} />);
    expect(screen.getByTestId('cytoscape-canvas')).toBeTruthy();
    expect(screen.getByText('person')).toBeTruthy();
  });

  it('defaults to the table view and disables the graph tab for scalars', () => {
    const { container } = renderWithStore(
      <ResultFrame reqString="RETURN 1" result={scalarResult} />,
    );
    // Table rendered with the scalar value.
    expect(screen.getByRole('cell', { name: '1' })).toBeTruthy();
    expect(container.querySelector('[data-testid="cytoscape-canvas"]')).toBeNull();
    // Graph segmented option is disabled.
    const graphOption = screen.getByText('Graph').closest('label');
    expect(graphOption?.className).toContain('ant-segmented-item-disabled');
  });

  it('renders the old status message for utility commands', () => {
    renderWithStore(<ResultFrame reqString="CREATE (v:person)" result={utilityResult} />);
    expect(screen.getByText('CREATE')).toBeTruthy();
    expect(screen.queryByText('Graph')).toBeNull();
  });
});
