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
 * Ambient declarations for the cytoscape extension packages (none of them
 * ship their own types). Each default-exports a cytoscape extension
 * registrant usable with `cytoscape.use(...)`.
 *
 * This file is intentionally NOT a module (no top-level imports/exports):
 * ambient `declare module` blocks only introduce NEW modules from a
 * global .d.ts file.
 */

declare module 'cytoscape-cxtmenu' {
  const ext: import('cytoscape').Ext;
  export default ext;
}

declare module 'cytoscape-cose-bilkent' {
  const ext: import('cytoscape').Ext;
  export default ext;
}

declare module 'cytoscape-fcose' {
  const ext: import('cytoscape').Ext;
  export default ext;
}

declare module 'cytoscape-cola' {
  const ext: import('cytoscape').Ext;
  export default ext;
}

declare module 'cytoscape-dagre' {
  const ext: import('cytoscape').Ext;
  export default ext;
}

declare module 'cytoscape-klay' {
  const ext: import('cytoscape').Ext;
  export default ext;
}

declare module 'cytoscape-euler' {
  const ext: import('cytoscape').Ext;
  export default ext;
}

declare module 'cytoscape-avsdf' {
  const ext: import('cytoscape').Ext;
  export default ext;
}

declare module 'cytoscape-cise' {
  const ext: import('cytoscape').Ext;
  export default ext;
}

declare module 'cytoscape-spread' {
  const ext: import('cytoscape').Ext;
  export default ext;
}

declare module 'cytoscape-d3-force' {
  const ext: import('cytoscape').Ext;
  export default ext;
}
