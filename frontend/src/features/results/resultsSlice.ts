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
import type { ApiError, CypherResult } from '../../types';
import { removeFrame } from '../frame/frameSlice';

/**
 * Per-frame cypher results, keyed by frame key — the v2 replacement for the
 * old CypherSlice `queryResult` map. The entry is written by EditorBar's run
 * orchestration around the `executeCypher` mutation and consumed by
 * FrameArea's CypherResultFrame branch.
 *
 * A discriminated union (not a flat optional-field record) so TS narrows
 * `result`/`error` on `status` at the render site.
 */
export type FrameResultEntry =
  | { status: 'pending' }
  | { status: 'fulfilled'; result: CypherResult }
  | { status: 'rejected'; error: ApiError };

export type ResultsState = Record<string, FrameResultEntry>;

const initialState: ResultsState = {};

const resultsSlice = createSlice({
  name: 'results',
  initialState,
  reducers: {
    setPending: (state, action: PayloadAction<string>) => {
      state[action.payload] = { status: 'pending' };
    },
    setFulfilled: (state, action: PayloadAction<{ frameKey: string; result: CypherResult }>) => {
      state[action.payload.frameKey] = { status: 'fulfilled', result: action.payload.result };
    },
    setRejected: (state, action: PayloadAction<{ frameKey: string; error: ApiError }>) => {
      state[action.payload.frameKey] = { status: 'rejected', error: action.payload.error };
    },
  },
  extraReducers: (builder) => {
    // Frames close via removeFrame(refKey) (Frame.tsx close button) — drop
    // the cached result alongside so the map cannot leak.
    builder.addCase(removeFrame, (state, action) => {
      delete state[action.payload.refKey];
    });
  },
});

export const { setPending, setFulfilled, setRejected } = resultsSlice.actions;

export default resultsSlice.reducer;
