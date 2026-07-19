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
 * Query-result visualization chain. `ResultFrame` is the integration
 * point for the frames feature: feed it the query string and the
 * `executeCypher` mutation's result.
 */

export { default as ResultFrame } from './ResultFrame';
export type { ResultFrameProps } from './ResultFrame';

export { default as GraphResultView } from './GraphResultView';
export type { GraphResultViewProps, GraphFilter } from './GraphResultView';
export { default as TableResultView } from './TableResultView';
export type { TableResultViewProps } from './TableResultView';
export { default as TextResultView } from './TextResultView';
export type { TextResultViewProps } from './TextResultView';
export { default as MetaResultView } from './MetaResultView';
export type { MetaResultViewProps } from './MetaResultView';
export { default as CytoscapeCanvas } from './CytoscapeCanvas';
export type { CytoscapeCanvasProps } from './CytoscapeCanvas';

export {
  LabelStyleRegistry,
  defaultRegistry,
  nodeLabelColors,
  edgeLabelColors,
  nodeLabelSizes,
  edgeLabelSizes,
  defaultCaption,
  generateCytoscapeElement,
  mergeLegends,
  rowsContainGraphElements,
  commandMessage,
  stringifyCellValue,
} from './cytoscapeUtils';
export type {
  LabelColor,
  LegendEntry,
  GraphLegend,
  GraphElementData,
  CyElementDefinition,
  GeneratedGraph,
  GenerateOptions,
} from './cytoscapeUtils';

export {
  selectableLayouts,
  defaultLayoutName,
  layoutDisplayNames,
  initialPositions,
} from './cytoscapeLayouts';
export type { LayoutName, LayoutOptions } from './cytoscapeLayouts';

export { useCytoscape, syncElements, runLayout } from './useCytoscape';
export { stylesheet, captionText } from './cytoscapeStyleSheet';

export {
  exportFileBase,
  resultToCsv,
  downloadResultCsv,
  downloadResultJson,
} from './exportUtils';
