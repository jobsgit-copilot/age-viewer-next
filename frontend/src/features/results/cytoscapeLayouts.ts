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
 * Layout option sets, ported from the old
 * `components/cytoscape/CytoscapeLayouts.js` (the `seletableLayouts` map).
 * The old 12 layouts are kept, and three newly available extensions are
 * added: fcose, cise, d3-force.
 *
 * Extension quirks (verified against cytoscape 3.34, headless + jsdom):
 * - `cise` throws unless a `clusters` function is supplied.
 * - `d3-force` throws `node not found: <id>` unless `linkId` maps link
 *   endpoints to node ids.
 */

import type cytoscape from 'cytoscape';

/**
 * Loose layout-options shape: every extension accepts its own extra keys
 * on top of the core `{name}`. Cast to `cytoscape.LayoutOptions` at the
 * call site.
 */
export type LayoutOptions = { name: string } & Record<string, unknown>;

/**
 * Initial positions recorded on every layoutstop (old `initLocation`);
 * used by the context-menu "reset position" command.
 */
export const initialPositions: Record<string, { x: number; y: number }> = {};

function trackPositions(event: { cy: cytoscape.Core }): void {
  event.cy.nodes().forEach((ele) => {
    initialPositions[ele.id()] = { x: ele.position('x'), y: ele.position('y') };
  });
}

const stop = (event: { cy: cytoscape.Core }) => trackPositions(event);

const randomLayout: LayoutOptions = {
  name: 'random',
  fit: true,
  padding: 30,
  animate: false,
  stop,
};

const gridLayout: LayoutOptions = {
  name: 'grid',
  fit: true,
  padding: 30,
  avoidOverlap: true,
  avoidOverlapPadding: 10,
  animate: false,
  stop,
};

const breadthFirstLayout: LayoutOptions = {
  name: 'breadthfirst',
  fit: true,
  directed: false,
  padding: 30,
  circle: false,
  grid: false,
  spacingFactor: 1.75,
  avoidOverlap: true,
  animate: false,
  stop,
};

const concentricLayout: LayoutOptions = {
  name: 'concentric',
  fit: false,
  height: 100,
  width: 100,
  stop,
};

const colaLayout: LayoutOptions = {
  name: 'cola',
  animate: true,
  fit: false,
  avoidOverlap: true,
  stop,
};

const coseLayout: LayoutOptions = {
  name: 'cose',
  animate: true,
  animationThreshold: 250,
  refresh: 20,
  fit: true,
  padding: 30,
  componentSpacing: 40,
  nodeRepulsion: 2048,
  nodeOverlap: 4,
  idealEdgeLength: 32,
  edgeElasticity: 32,
  nestingFactor: 1.2,
  gravity: 1,
  numIter: 1000,
  initialTemp: 1000,
  coolingFactor: 0.99,
  minTemp: 1.0,
  stop,
};

const coseBilkentLayout: LayoutOptions = {
  name: 'cose-bilkent',
  idealEdgeLength: 100,
  refresh: 300,
  nodeDimensionsIncludeLabels: true,
  fit: false,
  randomize: true,
  padding: 10,
  nodeRepulsion: 9500,
  stop,
};

const fcoseLayout: LayoutOptions = {
  name: 'fcose',
  quality: 'default',
  randomize: true,
  animate: true,
  fit: true,
  padding: 30,
  nodeDimensionsIncludeLabels: true,
  idealEdgeLength: 100,
  nodeRepulsion: 9500,
  stop,
};

const dagreLayout: LayoutOptions = {
  name: 'dagre',
  fit: true,
  padding: 30,
  animate: false,
  animationDuration: 500,
  stop,
};

const klayLayout: LayoutOptions = {
  name: 'klay',
  fit: true,
  padding: 20,
  animate: false,
  animationDuration: 500,
  klay: {
    addUnnecessaryBendpoints: false,
    aspectRatio: 1.6,
    borderSpacing: 20,
    compactComponents: false,
    crossingMinimization: 'LAYER_SWEEP',
    cycleBreaking: 'GREEDY',
    direction: 'UNDEFINED',
    edgeRouting: 'ORTHOGONAL',
    edgeSpacingFactor: 0.5,
    feedbackEdges: false,
    fixedAlignment: 'NONE',
    inLayerSpacingFactor: 1.0,
    layoutHierarchy: false,
    linearSegmentsDeflectionDampening: 0.3,
    mergeEdges: false,
    mergeHierarchyCrossingEdges: true,
    nodeLayering: 'NETWORK_SIMPLEX',
    nodePlacement: 'BRANDES_KOEPF',
    randomizationSeed: 1,
    routeSelfLoopInside: false,
    separateConnectedComponents: true,
    spacing: 20,
    thoroughness: 7,
  },
  stop,
};

const eulerLayout: LayoutOptions = {
  name: 'euler',
  springLength: 80,
  springCoeff: 0.0008,
  mass: 4,
  gravity: -1.2,
  pull: 0.001,
  theta: 0.666,
  dragCoeff: 0.02,
  movementThreshold: 1,
  timeStep: 20,
  refresh: 10,
  animate: true,
  maxIterations: 1000,
  maxSimulationTime: 4000,
  ungrabifyWhileSimulating: false,
  fit: true,
  padding: 30,
  randomize: false,
  stop,
};

const avsdfLayout: LayoutOptions = {
  name: 'avsdf',
  refresh: 30,
  fit: true,
  padding: 10,
  ungrabifyWhileSimulating: false,
  animate: 'end',
  animationDuration: 500,
  nodeSeparation: 60,
  stop,
};

const ciseLayout: LayoutOptions = {
  name: 'cise',
  fit: true,
  padding: 30,
  animate: false,
  // cise throws without a clusters function; empty clusters = one circle.
  clusters: () => [],
  stop,
};

const spreadLayout: LayoutOptions = {
  name: 'spread',
  animate: true,
  fit: true,
  minDist: 20,
  padding: 20,
  expandingFactor: -1.0,
  prelayout: { name: 'cose' },
  maxExpandIterations: 4,
  randomize: false,
  stop,
};

const d3ForceLayout: LayoutOptions = {
  name: 'd3-force',
  animate: true,
  fit: true,
  // d3's forceLink resolves string endpoints through this id accessor —
  // without it the layout throws `node not found: <id>`.
  linkId: (node: { id?: string }) => node.id,
  stop,
};

/** Selectable layouts keyed like the old footer's option values. */
export const selectableLayouts = {
  random: randomLayout,
  grid: gridLayout,
  breadthFirst: breadthFirstLayout,
  concentric: concentricLayout,
  cola: colaLayout,
  cose: coseLayout,
  coseBilkent: coseBilkentLayout,
  fcose: fcoseLayout,
  dagre: dagreLayout,
  klay: klayLayout,
  euler: eulerLayout,
  avsdf: avsdfLayout,
  cise: ciseLayout,
  spread: spreadLayout,
  d3Force: d3ForceLayout,
} as const;

export type LayoutName = keyof typeof selectableLayouts;

/** The old default layout. */
export const defaultLayoutName: LayoutName = 'coseBilkent';

/** Display labels for the layout selector (old footer option text). */
export const layoutDisplayNames: Record<LayoutName, string> = {
  random: 'Random',
  grid: 'Grid',
  breadthFirst: 'Breadth-First',
  concentric: 'Concentric',
  cola: 'Cola',
  cose: 'Cose',
  coseBilkent: 'Cose-Bilkent',
  fcose: 'fCoSE',
  dagre: 'Dagre',
  klay: 'Klay',
  euler: 'Euler',
  avsdf: 'Avsdf',
  cise: 'CiSE',
  spread: 'Spread',
  d3Force: 'D3-Force',
};
