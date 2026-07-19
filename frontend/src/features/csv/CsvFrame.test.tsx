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
import CsvFrame, { labelFromFileName } from './CsvFrame';
import {
  FakeRequest,
  jsonResponse,
  renderWithStore,
  stubBrowserGlobals,
} from '../frames/testUtils';
import type { MetadataResponse } from '../../types';

const metadataResponse: MetadataResponse = {
  g1: {
    nodes: [],
    edges: [],
    propertyKeys: [],
    graph: 'g1',
    database: 'agedb',
  },
};

function csvFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/csv' });
}

function renderFrame() {
  return renderWithStore(<CsvFrame frameKey="csv-1" reqString=":csv" isPinned={false} />);
}

function fileInputs(): [HTMLElement, HTMLElement] {
  const inputs = document.querySelectorAll('input[type="file"]');
  expect(inputs).toHaveLength(2);
  return [inputs[0] as HTMLElement, inputs[1] as HTMLElement];
}

function fillForm({ dropGraph = true } = {}) {
  fireEvent.change(screen.getByLabelText('Graph Name'), { target: { value: 'g1' } });
  if (dropGraph) {
    fireEvent.click(screen.getByRole('switch'));
  }
  const [nodesInput, edgesInput] = fileInputs();
  fireEvent.change(nodesInput, {
    target: {
      files: [
        csvFile('Person.csv', 'id,name\n1,Alice\n'),
        csvFile('Movie.csv', 'id,title\n10,Matrix\n'),
      ],
    },
  });
  fireEvent.change(edgesInput, {
    target: { files: [csvFile('ACTED_IN.csv', 'start_id,start_vertex_type,end_id,end_vertex_type\n1,Person,10,Movie\n')] },
  });
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

describe('labelFromFileName', () => {
  it('strips the .csv suffix (case-insensitive)', () => {
    expect(labelFromFileName('Person.csv')).toBe('Person');
    expect(labelFromFileName('ACTED_IN.CSV')).toBe('ACTED_IN');
    expect(labelFromFileName('backup.csv.csv')).toBe('backup.csv');
    expect(labelFromFileName('no-extension')).toBe('no-extension');
  });
});

describe('CsvFrame', () => {
  it('keeps the submit button disabled until a graph name and a node file are set', async () => {
    renderFrame();
    const submit = screen.getByRole('button', { name: 'Create Graph' });
    expect(submit).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Graph Name'), { target: { value: 'g1' } });
    expect(submit).toHaveProperty('disabled', true);

    const [nodesInput] = fileInputs();
    fireEvent.change(nodesInput, { target: { files: [csvFile('Person.csv', 'id\n1\n')] } });
    await screen.findByText('Person.csv');
    expect(submit).toHaveProperty('disabled', false);
  });

  it('submits multipart FormData: files under nodes/edges with the label as filename, graphName, dropGraph', async () => {
    const fetchMock = vi.fn(async (input: FakeRequest) => {
      if (input.url === '/api/v1/cypher/init') return new Response(null, { status: 204 });
      if (input.url === '/api/v1/db/meta') return jsonResponse(metadataResponse);
      return jsonResponse({ severity: 'ERROR', message: 'unexpected', code: '' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { store } = renderFrame();

    fillForm({ dropGraph: true });
    // Upload lists reflect the selected files before submit.
    await screen.findByText('Person.csv');
    await screen.findByText('ACTED_IN.csv');

    fireEvent.click(screen.getByRole('button', { name: 'Create Graph' }));

    await waitFor(() => {
      expect(store.getState().alerts.map((a) => a.alertName)).toContain('CreateGraphSuccess');
    });

    const calls = fetchMock.mock.calls.map(([input]) => input as FakeRequest);
    const initCall = calls.find((call) => call.url === '/api/v1/cypher/init') as FakeRequest;
    expect(initCall.method).toBe('POST');
    const body = initCall.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('graphName')).toBe('g1');
    // dropGraph is sent as the string 'true' (contract §3.7).
    expect(body.get('dropGraph')).toBe('true');

    const nodes = body.getAll('nodes') as File[];
    expect(nodes.map((file) => file.name)).toEqual(['Person', 'Movie']);
    // jsdom File has no .text(); size proves the real file content was sent.
    expect(nodes[0].size).toBe('id,name\n1,Alice\n'.length);

    const edges = body.getAll('edges') as File[];
    expect(edges.map((file) => file.name)).toEqual(['ACTED_IN']);

    // Success also refetches metadata and mirrors it into the metadata slice.
    expect(calls.some((call) => call.url === '/api/v1/db/meta')).toBe(true);
    await waitFor(() => {
      expect(store.getState().metadata.currentGraph).toBe('g1');
    });
  });

  it('sends dropGraph as the string false when the switch is off', async () => {
    const fetchMock = vi.fn(async (input: FakeRequest) => {
      if (input.url === '/api/v1/cypher/init') return new Response(null, { status: 204 });
      return jsonResponse(metadataResponse);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderFrame();

    fillForm({ dropGraph: false });
    await screen.findByText('Person.csv');
    fireEvent.click(screen.getByRole('button', { name: 'Create Graph' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const initCall = fetchMock.mock.calls
      .map(([input]) => input as FakeRequest)
      .find((call) => call.url === '/api/v1/cypher/init') as FakeRequest;
    expect((initCall.body as FormData).get('dropGraph')).toBe('false');
  });

  it('on failure: ErrorCypherQuery alert with the normalized {...pgError, details} message', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        { severity: 'ERROR', code: '42601', details: 'syntax error at or near "CHEATE"' },
        500,
      ));
    vi.stubGlobal('fetch', fetchMock);
    const { store } = renderFrame();

    fillForm();
    await screen.findByText('Person.csv');
    fireEvent.click(screen.getByRole('button', { name: 'Create Graph' }));

    await waitFor(() => {
      expect(store.getState().alerts.map((a) => a.alertName)).toContain('ErrorCypherQuery');
    });
    const alert = store.getState().alerts.find((a) => a.alertName === 'ErrorCypherQuery');
    expect(alert?.alertProps.errorMessage).toBe('[ERROR]:(42601) syntax error at or near "CHEATE"');
    expect(store.getState().alerts.map((a) => a.alertName)).not.toContain('CreateGraphSuccess');
  });
});
