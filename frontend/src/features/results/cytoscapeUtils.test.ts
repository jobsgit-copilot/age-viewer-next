// @vitest-environment node
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

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EDGE_SIZE,
  DEFAULT_NODE_SIZE,
  LabelStyleRegistry,
  commandMessage,
  defaultCaption,
  edgeLabelColors,
  generateCytoscapeElement,
  mergeLegends,
  nodeLabelColors,
  rowsContainGraphElements,
  stringifyCellValue,
} from './cytoscapeUtils';
import type { AgtypeEdge, AgtypeValue, CypherResult } from '../../types';

const person = (id: number, name: string): AgtypeValue => ({
  id,
  label: 'person',
  properties: { id: String(id), name },
});

const company = (id: number): AgtypeValue => ({
  id,
  label: 'company',
  properties: { title: 'ACME' },
});

const knows = (
  id: number,
  startId: number,
  endId: number,
  properties: AgtypeEdge['properties'] = {},
): AgtypeValue => ({
  id,
  label: 'knows',
  start_id: startId,
  end_id: endId,
  properties,
});

function resultOf(rows: CypherResult['rows']): CypherResult['rows'] {
  return rows;
}

describe('defaultCaption', () => {
  it('prefers name, then id, then the gid/label fallback', () => {
    expect(defaultCaption('node', { name: 'x' })).toBe('name');
    expect(defaultCaption('node', { id: 1 })).toBe('id');
    expect(defaultCaption('node', {})).toBe('gid');
    expect(defaultCaption('node', undefined)).toBe('gid');
    expect(defaultCaption('edge', { name: 'x' })).toBe('name');
    expect(defaultCaption('edge', { id: 1 })).toBe('id');
    expect(defaultCaption('edge', {})).toBe('label');
    expect(defaultCaption('edge', undefined)).toBe('label');
  });
});

describe('LabelStyleRegistry', () => {
  it('assigns palette colors round-robin in first-seen order', () => {
    const registry = new LabelStyleRegistry();
    expect(registry.getNodeColor('a')).toEqual(nodeLabelColors[0]);
    expect(registry.getNodeColor('b')).toEqual(nodeLabelColors[1]);
    // Repeat lookup is stable.
    expect(registry.getNodeColor('a')).toEqual(nodeLabelColors[0]);
    expect(registry.getEdgeColor('x')).toEqual(edgeLabelColors[0]);
  });

  it('wraps around the palette after it is exhausted', () => {
    const registry = new LabelStyleRegistry();
    for (let i = 0; i < nodeLabelColors.length; i += 1) {
      registry.getNodeColor(`label-${i}`);
    }
    expect(registry.getNodeColor('overflow')).toEqual(nodeLabelColors[0]);
  });

  it('uses the old default sizes (node 55, edge 1) and honors overrides', () => {
    const registry = new LabelStyleRegistry();
    expect(registry.getNodeSize('a')).toBe(DEFAULT_NODE_SIZE);
    expect(registry.getEdgeSize('a')).toBe(DEFAULT_EDGE_SIZE);
    registry.setNodeSize('a', 99);
    registry.setEdgeSize('a', 21);
    expect(registry.getNodeSize('a')).toBe(99);
    expect(registry.getEdgeSize('a')).toBe(21);
  });

  it('stores explicit color/caption overrides', () => {
    const registry = new LabelStyleRegistry();
    const custom = { color: '#000', borderColor: '#111', fontColor: '#222' };
    registry.setNodeColor('a', custom);
    registry.setNodeCaption('a', 'title');
    expect(registry.getNodeColor('a')).toEqual(custom);
    expect(registry.getNodeCaption('a')).toBe('title');
  });
});

describe('generateCytoscapeElement', () => {
  it('converts a vertex row into a node with palette style and caption', () => {
    const registry = new LabelStyleRegistry();
    const { elements, legend } = generateCytoscapeElement(
      resultOf([{ v: person(844424930131969, 'Alice') }]),
      { registry },
    );
    expect(elements.edges).toHaveLength(0);
    expect(elements.nodes).toHaveLength(1);
    const node = elements.nodes[0];
    expect(node.group).toBe('nodes');
    expect(node.classes).toBe('node');
    expect(node.data.id).toBe('844424930131969');
    expect(node.data.label).toBe('person');
    expect(node.data.properties).toEqual({ id: '844424930131969', name: 'Alice' });
    expect(node.data.caption).toBe('name'); // name property wins
    expect(node.data.size).toBe(DEFAULT_NODE_SIZE);
    expect(node.data.backgroundColor).toBe(nodeLabelColors[0].color);
    expect(node.data.borderColor).toBe(nodeLabelColors[0].borderColor);
    expect(node.data.fontColor).toBe(nodeLabelColors[0].fontColor);
    expect(legend.nodeLegend.person).toMatchObject({
      caption: 'name',
      size: DEFAULT_NODE_SIZE,
      color: nodeLabelColors[0].color,
    });
    expect(legend.edgeLegend).toEqual({});
  });

  it('converts an edge row (start_id/end_id) into an edge', () => {
    const registry = new LabelStyleRegistry();
    const { elements, legend } = generateCytoscapeElement(
      resultOf([{ e: knows(1125899906842625, 844424930131969, 844424930131970) }]),
      { registry },
    );
    expect(elements.nodes).toHaveLength(0);
    expect(elements.edges).toHaveLength(1);
    const edge = elements.edges[0];
    expect(edge.group).toBe('edges');
    expect(edge.classes).toBe('edge');
    expect(edge.data.id).toBe('1125899906842625');
    expect(edge.data.source).toBe('844424930131969');
    expect(edge.data.target).toBe('844424930131970');
    expect(edge.data.caption).toBe('label'); // no name/id properties
    expect(edge.data.size).toBe(DEFAULT_EDGE_SIZE);
    expect(edge.data.backgroundColor).toBe(edgeLabelColors[0].color);
    expect(legend.edgeLegend.knows).toMatchObject({ caption: 'label' });
  });

  it('accepts start/end as an alternative to start_id/end_id', () => {
    const registry = new LabelStyleRegistry();
    const edge: AgtypeValue = {
      id: 1,
      label: 'knows',
      start_id: 10,
      end_id: 20,
      start: 10,
      end: 20,
      properties: {},
    };
    const { elements } = generateCytoscapeElement(resultOf([{ e: edge }]), { registry });
    expect(elements.edges).toHaveLength(1);
    expect(elements.edges[0].data.source).toBe('10');
    expect(elements.edges[0].data.target).toBe('20');
  });

  it('converts path rows (arrays of vertex/edge objects)', () => {
    const registry = new LabelStyleRegistry();
    const v1 = person(844424930131969, 'Alice');
    const v2 = person(844424930131970, 'Bob');
    const e = knows(1125899906842625, 844424930131969, 844424930131970);
    const { elements, legend } = generateCytoscapeElement(
      resultOf([{ p: [v1, e, v2] }]),
      { registry },
    );
    expect(elements.nodes).toHaveLength(2);
    expect(elements.edges).toHaveLength(1);
    expect(Object.keys(legend.nodeLegend)).toEqual(['person']);
    expect(Object.keys(legend.edgeLegend)).toEqual(['knows']);
  });

  it('handles a full MATCH row (v, e, v2 aliases) like the neighbors endpoint', () => {
    const registry = new LabelStyleRegistry();
    const { elements } = generateCytoscapeElement(
      resultOf([
        {
          s: person(844424930131969, 'Alice'),
          r: knows(1125899906842625, 844424930131969, 844424930131970),
          t: person(844424930131970, 'Bob'),
        },
      ]),
      { registry },
    );
    expect(elements.nodes).toHaveLength(2);
    expect(elements.edges).toHaveLength(1);
  });

  it('deduplicates repeated graphids across rows and inside paths', () => {
    const registry = new LabelStyleRegistry();
    const v1 = person(844424930131969, 'Alice');
    const v2 = person(844424930131970, 'Bob');
    const e = knows(1125899906842625, 844424930131969, 844424930131970);
    const { elements } = generateCytoscapeElement(
      resultOf([
        { v: v1, e, v2 },
        { v: v1 }, // duplicate of an existing node
        { p: [v1, e, v2] }, // fully duplicated path
      ]),
      { registry },
    );
    expect(elements.nodes).toHaveLength(2);
    expect(elements.edges).toHaveLength(1);
  });

  it('skips scalars, plain arrays, and null values', () => {
    const registry = new LabelStyleRegistry();
    const { elements } = generateCytoscapeElement(
      resultOf([
        { a: 1, b: 'text', c: [1, 2, 3], d: null, e: { f: 1 } },
        { v: person(844424930131969, 'Alice') },
      ]),
      { registry },
    );
    expect(elements.nodes).toHaveLength(1);
    expect(elements.edges).toHaveLength(0);
  });

  it('honors maxDataOfGraph (0 = unlimited)', () => {
    const registry = new LabelStyleRegistry();
    const rows = resultOf([
      { v: person(1, 'A') },
      { v: person(2, 'B') },
      { v: person(3, 'C') },
    ]);
    expect(
      generateCytoscapeElement(rows, { registry, maxDataOfGraph: 2 }).elements.nodes,
    ).toHaveLength(2);
    expect(
      generateCytoscapeElement(rows, { registry, maxDataOfGraph: 0 }).elements.nodes,
    ).toHaveLength(3);
    expect(generateCytoscapeElement(rows, { registry }).elements.nodes).toHaveLength(3);
  });

  it('assigns different labels different palette slots', () => {
    const registry = new LabelStyleRegistry();
    const { elements, legend } = generateCytoscapeElement(
      resultOf([{ a: person(1, 'A'), b: company(2) }]),
      { registry },
    );
    expect(legend.nodeLegend.person.color).toBe(nodeLabelColors[0].color);
    expect(legend.nodeLegend.company.color).toBe(nodeLabelColors[1].color);
    expect(elements.nodes[0].data.backgroundColor).toBe(nodeLabelColors[0].color);
    expect(elements.nodes[1].data.backgroundColor).toBe(nodeLabelColors[1].color);
  });

  it('uses registry caption overrides when present', () => {
    const registry = new LabelStyleRegistry();
    registry.setNodeCaption('person', 'title');
    registry.setEdgeCaption('knows', 'since');
    const { elements } = generateCytoscapeElement(
      resultOf([{ v: person(1, 'A'), e: knows(2, 1, 3, { since: 2020 }) }]),
      { registry },
    );
    expect(elements.nodes[0].data.caption).toBe('title');
    expect(elements.edges[0].data.caption).toBe('since');
  });

  it('marks expansion elements with a `new` class when isNew is set', () => {
    const registry = new LabelStyleRegistry();
    const { elements } = generateCytoscapeElement(
      resultOf([{ v: person(1, 'A'), e: knows(2, 1, 3) }]),
      { registry, isNew: true },
    );
    expect(elements.nodes[0].classes).toBe('new node');
    expect(elements.edges[0].classes).toBe('new edge');
  });

  it('sorts legend entries by label name', () => {
    const registry = new LabelStyleRegistry();
    const { legend } = generateCytoscapeElement(
      resultOf([
        { b: { id: 2, label: 'zeta', properties: {} } },
        { a: { id: 1, label: 'alpha', properties: {} } },
      ]),
      { registry },
    );
    expect(Object.keys(legend.nodeLegend)).toEqual(['alpha', 'zeta']);
  });

  it('returns an empty graph for empty/null-ish rows', () => {
    const registry = new LabelStyleRegistry();
    const { elements, legend } = generateCytoscapeElement([], { registry });
    expect(elements.nodes).toHaveLength(0);
    expect(elements.edges).toHaveLength(0);
    expect(legend).toEqual({ nodeLegend: {}, edgeLegend: {} });
  });
});

describe('rowsContainGraphElements', () => {
  it('detects vertices, edges, and paths', () => {
    expect(rowsContainGraphElements([{ v: person(1, 'A') }])).toBe(true);
    expect(rowsContainGraphElements([{ e: knows(2, 1, 3) }])).toBe(true);
    expect(rowsContainGraphElements([{ p: [person(1, 'A'), knows(2, 1, 3)] }])).toBe(true);
  });

  it('is false for scalar-only results', () => {
    expect(rowsContainGraphElements([{ a: 1, b: 'x' }])).toBe(false);
    expect(rowsContainGraphElements([{ c: [1, 2, 3] }])).toBe(false);
    expect(rowsContainGraphElements([])).toBe(false);
  });
});

describe('mergeLegends', () => {
  it('keeps existing entries and fills in new labels', () => {
    const current = {
      nodeLegend: {
        person: {
          color: '#111', borderColor: '#222', fontColor: '#333', size: 55, caption: 'name',
        },
      },
      edgeLegend: {},
    };
    const added = {
      nodeLegend: {
        person: {
          color: '#999', borderColor: '#888', fontColor: '#777', size: 55, caption: 'name',
        },
        company: {
          color: '#444', borderColor: '#555', fontColor: '#666', size: 55, caption: 'gid',
        },
      },
      edgeLegend: {
        knows: {
          color: '#abc', borderColor: '#def', fontColor: '#fff', size: 1, caption: 'label',
        },
      },
    };
    const merged = mergeLegends(current, added);
    // Existing label keeps the current (possibly user-edited) style.
    expect(merged.nodeLegend.person.color).toBe('#111');
    expect(merged.nodeLegend.company.color).toBe('#444');
    expect(merged.edgeLegend.knows.color).toBe('#abc');
  });
});

describe('commandMessage', () => {
  const make = (command: string): CypherResult => ({
    rows: [],
    columns: [],
    rowCount: 0,
    command,
  });

  it('is null for regular row results', () => {
    expect(commandMessage(make('SELECT'))).toBeNull();
  });

  it('maps utility commands to the old status messages', () => {
    expect(commandMessage(make('GRAPH'))).toBe('Successfully ran the query!');
    expect(commandMessage(make('COPY'))).toBe('Successfully ran the query!');
    expect(commandMessage(make('UPDATE'))).toBe('Successfully ran the query!');
    expect(commandMessage(make('CREATE'))).toBe('CREATE');
    expect(commandMessage({ ...make(''), command: null as unknown as string })).toBe(
      'Query not entered!',
    );
  });
});

describe('stringifyCellValue', () => {
  it('stringifies objects, keeps primitives raw, handles null/undefined', () => {
    expect(stringifyCellValue({ a: 1 })).toBe('{"a":1}');
    expect(stringifyCellValue([1, 2])).toBe('[1,2]');
    expect(stringifyCellValue('text')).toBe('text');
    expect(stringifyCellValue(42)).toBe('42');
    expect(stringifyCellValue(true)).toBe('true');
    expect(stringifyCellValue(null)).toBe('null');
    expect(stringifyCellValue(undefined)).toBe('');
  });
});
