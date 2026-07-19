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
 * Cytoscape stylesheet, ported from the old
 * `components/cytoscape/CytoscapeStyleSheet.js`. Element visuals are fully
 * data-driven (`size`, `backgroundColor`, `borderColor`, `fontColor`,
 * `caption` set by `generateCytoscapeElement`), so style changes apply by
 * writing element data — same as the old app.
 *
 * The old `selectedLabel` global bookkeeping (write-only, never read) is
 * not ported.
 */

import type cytoscape from 'cytoscape';
import type { AgtypeValue } from '../../types';

/**
 * Caption text for an element (old `getLabel`):
 * `gid` → `[ <id> ]`, `label` → `[ :<label> ]`, empty → no caption,
 * otherwise the named property ('' when absent).
 */
export function captionText(ele: cytoscape.SingularElementArgument): string {
  const caption = ele.data('caption') as string | undefined;
  if (caption === undefined || caption === null || caption === '') return '';
  if (caption === 'gid') return `[ ${String(ele.data('id'))} ]`;
  if (caption === 'label') return `[ :${String(ele.data('label'))} ]`;
  const props = ele.data('properties') as Record<string, AgtypeValue> | undefined;
  const value = props?.[caption];
  if (value === undefined || value === null) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export const stylesheet: cytoscape.StylesheetJson = [
  {
    selector: 'node',
    style: {
      width: (ele: cytoscape.SingularElementArgument) => (ele ? ele.data('size') : 55),
      height: (ele: cytoscape.SingularElementArgument) => (ele ? ele.data('size') : 55),
      label: (ele: cytoscape.SingularElementArgument) => captionText(ele),
      'background-color': (ele: cytoscape.SingularElementArgument) =>
        ele ? ele.data('backgroundColor') : '#FFF',
      'border-width': '3px',
      'border-color': (ele: cytoscape.SingularElementArgument) =>
        ele ? ele.data('borderColor') : '#FFF',
      'border-opacity': 0.6,
      'text-valign': 'center',
      'text-halign': 'center',
      color: (ele: cytoscape.SingularElementArgument) => (ele ? ele.data('fontColor') : '#FFF'),
      'font-size': '10px',
      'text-wrap': 'ellipsis',
      'text-max-width': (ele: cytoscape.SingularElementArgument) =>
        ele ? ele.data('size') : 55,
    },
  },
  {
    selector: 'node.highlight',
    style: {
      'border-width': '6px',
      'border-color': '#B2EBF4',
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': '6px',
      'border-color': '#B2EBF4',
    },
  },
  {
    selector: 'edge',
    style: {
      width: (ele: cytoscape.SingularElementArgument) => (ele ? ele.data('size') : 1),
      label: (ele: cytoscape.SingularElementArgument) => captionText(ele),
      'text-background-color': '#FFF',
      'text-background-opacity': 1,
      'text-background-padding': '3px',
      'line-color': (ele: cytoscape.SingularElementArgument) =>
        ele ? ele.data('backgroundColor') : '#FFF',
      'target-arrow-color': (ele: cytoscape.SingularElementArgument) =>
        ele ? ele.data('backgroundColor') : '#FFF',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      color: (ele: cytoscape.SingularElementArgument) => (ele ? ele.data('fontColor') : '#FFF'),
      'font-size': '10px',
      'text-rotation': 'autorotate',
    },
  },
  {
    selector: 'edge.highlight',
    style: {
      width: (ele: cytoscape.SingularElementArgument) => (ele ? ele.data('size') : 1),
      'line-color': '#B2EBF4',
      'target-arrow-color': '#B2EBF4',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
    },
  },
  {
    selector: 'edge:selected',
    style: {
      width: (ele: cytoscape.SingularElementArgument) => (ele ? ele.data('size') : 1),
      'line-color': '#B2EBF4',
      'target-arrow-color': '#B2EBF4',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
    },
  },
];
