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

import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { GraphMetadata, LabelMetaRow, MetadataResponse } from '../../types';
import { uid } from '../../app/id';

/**
 * A label-count row as stored client-side. The old MetadataSlice unshifts a
 * synthetic `{label: '*', cnt: <total>}` row ahead of the real meta rows;
 * that row carries only label+cnt, hence the Partial.
 */
export type LabelCountRow = Pick<LabelMetaRow, 'label' | 'cnt'> & Partial<LabelMetaRow>;

/** Graph metadata after client-side aggregation (per graph name). */
export interface StoredGraphMetadata extends Omit<GraphMetadata, 'nodes' | 'edges'> {
  /** Client-generated id (old code used react-uuid). */
  id: string;
  nodes: LabelCountRow[];
  edges: LabelCountRow[];
}

function isFullMetadata(value: MetadataResponse[string]): value is GraphMetadata {
  return Array.isArray((value as GraphMetadata).nodes);
}

function sumCnt(rows: LabelMetaRow[]): number {
  return rows.reduce((total, row) => total + row.cnt, 0);
}

/**
 * Port of the old getMetaData.fulfilled transform: sum `cnt` over
 * nodes/edges and unshift a synthetic `{label: '*', cnt: total}` row,
 * then attach a client id. Non-selected graphs (`{}`) pass through as-is.
 */
export function processMetadataResponse(
  response: MetadataResponse,
): Record<string, StoredGraphMetadata | Record<string, never>> {
  const result: Record<string, StoredGraphMetadata | Record<string, never>> = {};
  Object.entries(response).forEach(([graphName, meta]) => {
    if (!isFullMetadata(meta)) {
      result[graphName] = {};
      return;
    }
    result[graphName] = {
      ...meta,
      nodes: [{ label: '*', cnt: sumCnt(meta.nodes) }, ...meta.nodes],
      edges: [{ label: '*', cnt: sumCnt(meta.edges) }, ...meta.edges],
      id: uid(),
    };
  });
  return result;
}

export interface MetadataState {
  graphs: Record<string, StoredGraphMetadata | Record<string, never>>;
  status: 'init' | 'connected' | 'disconnected';
  dbname: string;
  currentGraph: string;
}

const initialState: MetadataState = {
  graphs: {},
  status: 'init',
  dbname: '',
  currentGraph: '',
};

const metadataSlice = createSlice({
  name: 'metadata',
  initialState,
  reducers: {
    resetMetaData: () => initialState,
    /** Payload from `processMetadataResponse` after a successful /db/meta. */
    setMetaData: (
      state,
      action: PayloadAction<Record<string, StoredGraphMetadata | Record<string, never>>>,
    ) => {
      state.graphs = action.payload;
      state.status = 'connected';
      if (state.currentGraph === '') {
        state.currentGraph = Object.keys(action.payload)[0] ?? '';
      }
    },
    setMetaDataFailed: (state) => {
      state.status = 'disconnected';
    },
    /** Old behavior: select by client id or by graph name. */
    changeCurrentGraph: (state, action: PayloadAction<{ id?: string; name?: string }>) => {
      const found = Object.entries(state.graphs).find(
        ([name, data]) =>
          ('id' in data && data.id === action.payload.id) || name === action.payload.name,
      );
      if (found) {
        [state.currentGraph] = found;
      }
    },
  },
});

export const {
  resetMetaData,
  setMetaData,
  setMetaDataFailed,
  changeCurrentGraph,
} = metadataSlice.actions;

export default metadataSlice.reducer;
