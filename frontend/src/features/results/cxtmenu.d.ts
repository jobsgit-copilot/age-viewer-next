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
 * Module augmentation adding the `cy.cxtmenu(...)` core method that
 * cytoscape-cxtmenu registers at runtime (the augmentation pattern is
 * documented in cytoscape's own bundled index.d.ts). Being a module file
 * (note the import), `declare module 'cytoscape'` AUGMENTS cytoscape's
 * bundled types instead of replacing them.
 */

import type cytoscape from 'cytoscape';

declare module 'cytoscape' {
  interface CxtMenuCommand {
    /** HTML string rendered inside the menu item. */
    content?: string;
    select?: (ele: cytoscape.SingularElementArgument) => void;
    enabled?: boolean;
  }

  interface CxtMenuOptions {
    selector?: string;
    commands?: CxtMenuCommand[];
    menuRadius?: number | ((ele: cytoscape.SingularElementArgument) => number);
    fillColor?: string;
    activeFillColor?: string;
    activePadding?: number;
    indicatorSize?: number;
    separatorWidth?: number;
    spotlightPadding?: number;
    minSpotlightRadius?: number;
    maxSpotlightRadius?: number;
    openMenuEvents?: string;
    itemColor?: string;
    itemTextShadowColor?: string;
    zIndex?: number;
    atMouse?: boolean;
    [key: string]: unknown;
  }

  interface CxtMenuInstance {
    destroy(): void;
  }

  interface Core {
    cxtmenu(options?: CxtMenuOptions): CxtMenuInstance;
  }
}
