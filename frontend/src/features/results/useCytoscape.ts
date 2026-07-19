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
 * Thin React binding around cytoscape (replaces react-cytoscapejs, which
 * is not available in v2). Extensions are registered once at module
 * scope — cxtmenu (npm package, replacing the old vendored copy in
 * `src/lib`) plus every layout the old app exposed, with fcose / cise /
 * d3-force added.
 */

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import fcose from 'cytoscape-fcose';
import cola from 'cytoscape-cola';
import dagre from 'cytoscape-dagre';
import klay from 'cytoscape-klay';
import euler from 'cytoscape-euler';
import avsdf from 'cytoscape-avsdf';
import cise from 'cytoscape-cise';
import spread from 'cytoscape-spread';
import d3Force from 'cytoscape-d3-force';
import cxtmenu from 'cytoscape-cxtmenu';
import { selectableLayouts } from './cytoscapeLayouts';
import type { LayoutName, LayoutOptions } from './cytoscapeLayouts';

// Layout extensions: registration is silent when repeated, and ESM
// evaluates this module once per module graph.
cytoscape.use(coseBilkent);
cytoscape.use(fcose);
cytoscape.use(cola);
cytoscape.use(dagre);
cytoscape.use(klay);
cytoscape.use(euler);
cytoscape.use(avsdf);
cytoscape.use(cise);
cytoscape.use(spread);
cytoscape.use(d3Force);

// The cxtmenu UMD self-registers on import when it can resolve cytoscape;
// registering again only logs a warning — probe first to stay quiet.
{
  const probe = cytoscape({ headless: true });
  if (typeof probe.cxtmenu !== 'function') {
    cytoscape.use(cxtmenu);
  }
  probe.destroy();
}

/** Zoom limits (old CytoscapeConfig / chart effect: min 1e-1, max 5). */
export const MIN_ZOOM = 1e-1;
export const MAX_ZOOM = 5;
/** Old react-cytoscapejs chart prop. */
export const WHEEL_SENSITIVITY = 0.3;

/**
 * Diff-sync cytoscape elements with a new definition list: elements whose
 * id disappeared are removed, new ids are added, surviving ids get their
 * data replaced (so style-relevant fields like color/size/caption update).
 */
export function syncElements(
  cy: cytoscape.Core,
  elements: cytoscape.ElementDefinition[],
): void {
  const incoming = new Map<string, cytoscape.ElementDefinition>();
  elements.forEach((def) => {
    if (def.data.id !== undefined) incoming.set(String(def.data.id), def);
  });
  cy.elements().forEach((ele) => {
    if (!incoming.has(ele.id())) ele.remove();
  });
  const toAdd: cytoscape.ElementDefinition[] = [];
  incoming.forEach((def, id) => {
    const existing = cy.getElementById(id);
    if (existing.nonempty()) {
      existing.data(def.data as Record<string, unknown>);
      if (def.classes !== undefined) {
        existing.classes(def.classes);
      }
    } else {
      toAdd.push(def);
    }
  });
  if (toAdd.length > 0) cy.add(toAdd);
}

/**
 * Run a named layout. Like the old chart effect, `animate`/`fit` are
 * forced on unless explicitly overridden.
 */
export function runLayout(
  cy: cytoscape.Core,
  layoutName: LayoutName,
  overrides: Record<string, unknown> = {},
): cytoscape.Layouts {
  const options: LayoutOptions = {
    ...selectableLayouts[layoutName],
    animate: true,
    fit: true,
    ...overrides,
  };
  const layout = cy.layout(options as unknown as cytoscape.LayoutOptions);
  layout.run();
  return layout;
}

export interface UseCytoscapeOptions {
  elements: cytoscape.ElementDefinition[];
  stylesheet: cytoscape.StylesheetJson;
  layoutName: LayoutName;
  minZoom?: number;
  maxZoom?: number;
  wheelSensitivity?: number;
  /** Called with the instance after creation, and with null on destroy. */
  onCy?: (cy: cytoscape.Core | null) => void;
}

export interface UseCytoscapeResult {
  containerRef: RefObject<HTMLDivElement | null>;
  cy: cytoscape.Core | null;
}

/**
 * Owns a cytoscape instance bound to a div: created on mount, destroyed
 * on unmount, elements diff-synced on change, layout run on demand.
 */
export function useCytoscape({
  elements,
  stylesheet,
  layoutName,
  minZoom = MIN_ZOOM,
  maxZoom = MAX_ZOOM,
  wheelSensitivity = WHEEL_SENSITIVITY,
  onCy,
}: UseCytoscapeOptions): UseCytoscapeResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [cy, setCy] = useState<cytoscape.Core | null>(null);
  const didInitialLayout = useRef(false);
  const onCyRef = useRef(onCy);
  onCyRef.current = onCy;

  // Create/destroy the instance (once per mount).
  useEffect(() => {
    if (!containerRef.current) return undefined;
    const instance = cytoscape({
      container: containerRef.current,
      elements: [],
      style: stylesheet,
      minZoom,
      maxZoom,
      wheelSensitivity,
      // Old CytoscapeConfig interaction options.
      selectionType: 'single',
      boxSelectionEnabled: false,
      panningEnabled: true,
      userPanningEnabled: true,
      autoungrabify: false,
      autolock: false,
    });
    didInitialLayout.current = false;
    setCy(instance);
    onCyRef.current?.(instance);
    return () => {
      onCyRef.current?.(null);
      setCy(null);
      instance.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Diff-sync elements; run the layout once the first elements land.
  useEffect(() => {
    if (!cy) return;
    syncElements(cy, elements);
    if (!didInitialLayout.current && cy.elements().nonempty()) {
      didInitialLayout.current = true;
      runLayout(cy, layoutName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cy, elements]);

  // Re-run the layout when the selected layout changes (skip the initial
  // run, which the elements effect above handles).
  useEffect(() => {
    if (!cy || !didInitialLayout.current) return;
    runLayout(cy, layoutName);
  }, [cy, layoutName]);

  return { containerRef, cy };
}
