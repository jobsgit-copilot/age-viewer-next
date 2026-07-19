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
 * Minimal cytoscape host component: a full-size div wired to
 * `useCytoscape`. Parents grab the instance via `onCy` to attach events,
 * context menus, etc.
 */

import cytoscape from 'cytoscape';
import { stylesheet as defaultStylesheet } from './cytoscapeStyleSheet';
import { defaultLayoutName } from './cytoscapeLayouts';
import type { LayoutName } from './cytoscapeLayouts';
import { useCytoscape } from './useCytoscape';

export interface CytoscapeCanvasProps {
  elements: cytoscape.ElementDefinition[];
  stylesheet?: cytoscape.StylesheetJson;
  layoutName?: LayoutName;
  className?: string;
  minZoom?: number;
  maxZoom?: number;
  wheelSensitivity?: number;
  onCy?: (cy: cytoscape.Core | null) => void;
}

export default function CytoscapeCanvas({
  elements,
  stylesheet = defaultStylesheet,
  layoutName = defaultLayoutName,
  className,
  minZoom,
  maxZoom,
  wheelSensitivity,
  onCy,
}: CytoscapeCanvasProps) {
  const { containerRef } = useCytoscape({
    elements,
    stylesheet,
    layoutName,
    minZoom,
    maxZoom,
    wheelSensitivity,
    onCy,
  });
  return (
    <div
      ref={containerRef}
      className={className}
      // padding:0 is what cytoscape expects of its container; it also keeps
      // cy.width()/height() from going NaN under jsdom (getComputedStyle
      // returns '' for unset paddings there). The mount div is absolutely
      // positioned into the (position:relative) canvas area: percentage
      // heights do not resolve reliably through the flex chain, which left
      // cytoscape's container at height 0 and the graph invisible.
      style={{ position: 'absolute', inset: 0, padding: 0 }}
      data-testid="cytoscape-canvas"
    />
  );
}
