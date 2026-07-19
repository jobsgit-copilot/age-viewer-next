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
 * Port of the old `features/cypher/CypherUtil.js`: label → color/size
 * palettes, caption selection, and the agtype-row → cytoscape-elements
 * conversion (`generateCytoscapeElement`).
 *
 * Deliberate deviations from the old code:
 * - New labels are assigned palette slots **round-robin in first-seen
 *   order** instead of `Math.random()`, so colors are deterministic and
 *   stable within a session (and testable).
 * - Elements are deduplicated by id within one call (the old code pushed
 *   duplicates and relied on cytoscape silently ignoring them).
 * - The old `generateCytoscapeMetadataElement` (la_* rows for the broken
 *   `/db/metaChart` endpoint) is not ported — the v2 meta view is a plain
 *   antd summary (see MetaResultView).
 */

import { isAgtypeEdge, isAgtypeVertex } from '../../types';
import type { AgtypeEdge, AgtypeValue, AgtypeVertex, CypherResult } from '../../types';

export interface LabelColor {
  color: string;
  borderColor: string;
  fontColor: string;
}

export interface LegendEntry extends LabelColor {
  size: number;
  caption: string;
}

export interface GraphLegend {
  nodeLegend: Record<string, LegendEntry>;
  edgeLegend: Record<string, LegendEntry>;
}

/** `data` payload carried by every generated cytoscape element. */
export interface GraphElementData {
  /** Stringified AGE graphid (cytoscape ids are strings). */
  id: string;
  label: string;
  /** Edges only: stringified graphids of the endpoints. */
  source?: string;
  target?: string;
  backgroundColor: string;
  borderColor: string;
  fontColor: string;
  size: number;
  properties: Record<string, AgtypeValue>;
  /** Caption selector: 'gid' | 'label' | a property key | '' (no caption). */
  caption: string;
}

export interface CyNodeDefinition {
  group: 'nodes';
  data: GraphElementData;
  classes: string;
}

export interface CyEdgeDefinition {
  group: 'edges';
  data: GraphElementData;
  classes: string;
}

export type CyElementDefinition = CyNodeDefinition | CyEdgeDefinition;

export interface GeneratedGraph {
  legend: GraphLegend;
  elements: {
    nodes: CyNodeDefinition[];
    edges: CyEdgeDefinition[];
  };
}

/** Same default node palette as the old app (neo4j-browser colors). */
export const nodeLabelColors: LabelColor[] = [
  { color: '#604A0E', borderColor: '#423204', fontColor: '#FFF' },
  { color: '#C990C0', borderColor: '#B261A5', fontColor: '#FFF' },
  { color: '#F79767', borderColor: '#F36924', fontColor: '#FFF' },
  { color: '#57C7E3', borderColor: '#23B3D7', fontColor: '#2A2C34' },
  { color: '#F16667', borderColor: '#EB2728', fontColor: '#FFF' },
  { color: '#D9C8AE', borderColor: '#C0A378', fontColor: '#2A2C34' },
  { color: '#8DCC93', borderColor: '#5DB665', fontColor: '#2A2C34' },
  { color: '#ECB5C9', borderColor: '#DA7298', fontColor: '#2A2C34' },
  { color: '#498EDA', borderColor: '#2870C2', fontColor: '#FFF' },
  { color: '#FFC454', borderColor: '#D7A013', fontColor: '#2A2C34' },
  { color: '#DA7194', borderColor: '#CC3C6C', fontColor: '#FFF' },
  { color: '#569480', borderColor: '#447666', fontColor: '#FFF' },
];

/** Same default edge palette as the old app. */
export const edgeLabelColors: LabelColor[] = [
  { color: '#CCA63D', borderColor: '#997000', fontColor: '#2A2C34' },
  { color: '#C990C0', borderColor: '#B261A5', fontColor: '#2A2C34' },
  { color: '#F79767', borderColor: '#F36924', fontColor: '#2A2C34' },
  { color: '#57C7E3', borderColor: '#23B3D7', fontColor: '#2A2C34' },
  { color: '#F16667', borderColor: '#EB2728', fontColor: '#2A2C34' },
  { color: '#D9C8AE', borderColor: '#C0A378', fontColor: '#2A2C34' },
  { color: '#8DCC93', borderColor: '#5DB665', fontColor: '#2A2C34' },
  { color: '#ECB5C9', borderColor: '#DA7298', fontColor: '#2A2C34' },
  { color: '#498EDA', borderColor: '#2870C2', fontColor: '#2A2C34' },
  { color: '#FFC454', borderColor: '#D7A013', fontColor: '#2A2C34' },
  { color: '#DA7194', borderColor: '#CC3C6C', fontColor: '#2A2C34' },
  { color: '#569480', borderColor: '#447666', fontColor: '#2A2C34' },
];

/** Selectable node sizes (old `nodeLabelSizes`). */
export const nodeLabelSizes: number[] = [11, 33, 55, 77, 99];
/** Selectable edge widths (old `edgeLabelSizes`). */
export const edgeLabelSizes: number[] = [1, 6, 11, 16, 21];

/** Old defaults: new node labels got nodeLabelSizes[2], edges edgeLabelSizes[0]. */
export const DEFAULT_NODE_SIZE = nodeLabelSizes[2];
export const DEFAULT_EDGE_SIZE = edgeLabelSizes[0];

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Default caption for a label, from the first-seen element's properties:
 * `name` wins, then `id`, else `gid` for nodes / `label` for edges
 * (same rules as the old `getCaption`).
 */
export function defaultCaption(
  kind: 'node' | 'edge',
  properties: Record<string, AgtypeValue> | undefined,
): string {
  if (properties) {
    if (hasOwn(properties, 'name')) return 'name';
    if (hasOwn(properties, 'id')) return 'id';
  }
  return kind === 'node' ? 'gid' : 'label';
}

/**
 * Per-session store of label → style assignments (colors, sizes) and
 * user-chosen caption overrides. The old app kept this as mutable
 * module-level state shared across all frames; v2 keeps a shared default
 * instance (`defaultRegistry`) for the same cross-frame stability, while
 * tests can instantiate isolated registries.
 */
export class LabelStyleRegistry {
  private nodeColorMap = new Map<string, LabelColor>();

  private edgeColorMap = new Map<string, LabelColor>();

  private nodeSizeMap = new Map<string, number>();

  private edgeSizeMap = new Map<string, number>();

  private nodeCaptionMap = new Map<string, string>();

  private edgeCaptionMap = new Map<string, string>();

  private static colorFor(
    map: Map<string, LabelColor>,
    palette: LabelColor[],
    label: string,
  ): LabelColor {
    const existing = map.get(label);
    if (existing) return existing;
    // Round-robin in first-seen order (old code used Math.random()).
    const assigned = palette[map.size % palette.length];
    map.set(label, assigned);
    return assigned;
  }

  getNodeColor(label: string): LabelColor {
    return LabelStyleRegistry.colorFor(this.nodeColorMap, nodeLabelColors, label);
  }

  getEdgeColor(label: string): LabelColor {
    return LabelStyleRegistry.colorFor(this.edgeColorMap, edgeLabelColors, label);
  }

  setNodeColor(label: string, color: LabelColor): void {
    this.nodeColorMap.set(label, color);
  }

  setEdgeColor(label: string, color: LabelColor): void {
    this.edgeColorMap.set(label, color);
  }

  getNodeSize(label: string): number {
    return this.nodeSizeMap.get(label) ?? DEFAULT_NODE_SIZE;
  }

  getEdgeSize(label: string): number {
    return this.edgeSizeMap.get(label) ?? DEFAULT_EDGE_SIZE;
  }

  setNodeSize(label: string, size: number): void {
    this.nodeSizeMap.set(label, size);
  }

  setEdgeSize(label: string, size: number): void {
    this.edgeSizeMap.set(label, size);
  }

  /** Explicit caption override, if the user picked one ('' = no caption). */
  getNodeCaption(label: string): string | undefined {
    return this.nodeCaptionMap.get(label);
  }

  getEdgeCaption(label: string): string | undefined {
    return this.edgeCaptionMap.get(label);
  }

  setNodeCaption(label: string, caption: string): void {
    this.nodeCaptionMap.set(label, caption);
  }

  setEdgeCaption(label: string, caption: string): void {
    this.edgeCaptionMap.set(label, caption);
  }
}

/** Shared registry, mirroring the old module-level palette state. */
export const defaultRegistry = new LabelStyleRegistry();

/** An agtype array is treated as a path iff it holds graph elements. */
function isPathValue(
  value: AgtypeValue,
): value is AgtypeValue[] & Array<AgtypeVertex | AgtypeEdge> {
  return (
    Array.isArray(value) &&
    value.some((item) => isAgtypeVertex(item) || isAgtypeEdge(item))
  );
}

/** True when any row entry is a vertex, edge, or path (graph tab default). */
export function rowsContainGraphElements(rows: CypherResult['rows']): boolean {
  return rows.some((row) =>
    Object.values(row).some(
      (value) => isAgtypeVertex(value) || isAgtypeEdge(value) || isPathValue(value),
    ),
  );
}

function sortByKey<T>(data: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  Object.keys(data)
    .sort()
    .forEach((key) => {
      sorted[key] = data[key];
    });
  return sorted;
}

export interface GenerateOptions {
  /** Cap on processed rows; 0/undefined = unlimited (old semantics). */
  maxDataOfGraph?: number;
  /** Mark generated elements with a `new` class (neighbor expansion). */
  isNew?: boolean;
  /** Style source; defaults to the shared session-wide registry. */
  registry?: LabelStyleRegistry;
}

/**
 * Convert cypher result rows (raw agtype objects, contract §4.2) into
 * cytoscape element definitions plus a per-label legend.
 *
 * Rows are keyed by column alias (`Object.entries` covers every alias, so
 * no separate `columns` argument is needed). Each entry may be a vertex
 * (`{id,label,properties}`), an edge (`+ start_id/end_id`), or a path
 * (array alternating vertices/edges). Scalar and non-path array values
 * are skipped — the old code crashed on them and produced an empty graph.
 *
 * Duplicate graphids (shared path endpoints, repeated rows) are emitted
 * once, keeping the first occurrence.
 */
export function generateCytoscapeElement(
  rows: CypherResult['rows'],
  options: GenerateOptions = {},
): GeneratedGraph {
  const { maxDataOfGraph = 0, isNew = false, registry = defaultRegistry } = options;
  const nodes: CyNodeDefinition[] = [];
  const edges: CyEdgeDefinition[] = [];
  const seenNodeIds = new Set<string>();
  const seenEdgeIds = new Set<string>();
  const nodeLegend: Record<string, LegendEntry> = {};
  const edgeLegend: Record<string, LegendEntry> = {};

  function generateEdge(val: AgtypeEdge & { start?: number; end?: number }): void {
    const labelName = val.label.trim();
    // `start`/`end` appear in cytoscape-re-serialized data; the wire
    // shape carries `start_id`/`end_id` (old code checked both).
    const source = val.start ?? val.start_id;
    const target = val.end ?? val.end_id;
    const id = String(val.id);
    if (!hasOwn(edgeLegend, labelName)) {
      edgeLegend[labelName] = {
        size: registry.getEdgeSize(labelName),
        caption:
          registry.getEdgeCaption(labelName) ?? defaultCaption('edge', val.properties),
        ...registry.getEdgeColor(labelName),
      };
    }
    if (seenEdgeIds.has(id)) return;
    seenEdgeIds.add(id);
    edges.push({
      group: 'edges',
      data: {
        id,
        source: String(source),
        target: String(target),
        label: val.label,
        backgroundColor: edgeLegend[labelName].color,
        borderColor: edgeLegend[labelName].borderColor,
        fontColor: edgeLegend[labelName].fontColor,
        size: edgeLegend[labelName].size,
        properties: val.properties ?? {},
        caption: edgeLegend[labelName].caption,
      },
      classes: isNew ? 'new edge' : 'edge',
    });
  }

  function generateNode(val: AgtypeVertex): void {
    const labelName = val.label.trim();
    const id = String(val.id);
    if (!hasOwn(nodeLegend, labelName)) {
      nodeLegend[labelName] = {
        size: registry.getNodeSize(labelName),
        caption:
          registry.getNodeCaption(labelName) ?? defaultCaption('node', val.properties),
        ...registry.getNodeColor(labelName),
      };
    }
    if (seenNodeIds.has(id)) return;
    seenNodeIds.add(id);
    nodes.push({
      group: 'nodes',
      data: {
        id,
        label: val.label,
        backgroundColor: nodeLegend[labelName].color,
        borderColor: nodeLegend[labelName].borderColor,
        fontColor: nodeLegend[labelName].fontColor,
        size: nodeLegend[labelName].size,
        properties: val.properties ?? {},
        caption: nodeLegend[labelName].caption,
      },
      classes: isNew ? 'new node' : 'node',
    });
  }

  function generateValue(val: AgtypeValue): void {
    if (isAgtypeEdge(val)) {
      generateEdge(val);
    } else if (isAgtypeVertex(val)) {
      generateNode(val);
    } else if (isPathValue(val)) {
      // Path (e.g. `MATCH p = (v)-[r]->(v2) RETURN p`): alternating
      // vertex/edge objects; non-graph members are ignored.
      val.forEach((item) => {
        if (isAgtypeEdge(item)) generateEdge(item);
        else if (isAgtypeVertex(item)) generateNode(item);
      });
    }
    // Scalars / plain arrays are not graph elements — skipped on purpose.
  }

  if (rows) {
    rows.forEach((row, index) => {
      if (maxDataOfGraph !== 0 && index >= maxDataOfGraph) return;
      Object.values(row).forEach((val) => {
        if (val !== null && val !== undefined) generateValue(val);
      });
    });
  }

  return {
    legend: {
      nodeLegend: sortByKey(nodeLegend),
      edgeLegend: sortByKey(edgeLegend),
    },
    elements: { nodes, edges },
  };
}

/** Merge expansion legend entries into the current legend (new labels only). */
export function mergeLegends(current: GraphLegend, added: GraphLegend): GraphLegend {
  return {
    nodeLegend: { ...added.nodeLegend, ...current.nodeLegend },
    edgeLegend: { ...added.edgeLegend, ...current.edgeLegend },
  };
}

/**
 * Message for results that have no meaningful Graph/Table/Text rendering
 * (ported from the old CypherResultTable command checks). Returns null
 * when the result is a regular row set.
 */
export function commandMessage(result: CypherResult): string | null {
  if (result.command === null || result.command === undefined) {
    return 'Query not entered!';
  }
  const cmd = result.command.toUpperCase();
  if (cmd.match('(GRAPH|COPY|UPDATE).*')) return 'Successfully ran the query!';
  if (cmd === 'CREATE') return 'CREATE';
  return null;
}

/** Cell → display text used by the table/text views and CSV export. */
export function stringifyCellValue(value: AgtypeValue | undefined): string {
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
