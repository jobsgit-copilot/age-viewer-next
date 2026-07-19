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
import { loadSlice } from '../../app/persistence';

export interface EditorState {
  command: string;
  /** True when the command mutates the graph (CREATE/REMOVE/DELETE). */
  updateClause: boolean;
  commandHistory: string[];
  commandFavorites: string[];
}

const persisted = loadSlice<EditorState>('editor');

const initialState: EditorState = {
  command: '',
  updateClause: false,
  commandHistory: persisted?.commandHistory ?? [],
  commandFavorites: persisted?.commandFavorites ?? [],
};

/** Same clause detection as the old EditorSlice (case-sensitive on purpose). */
const UPDATE_CLAUSE = /(CREATE|REMOVE|DELETE)/g;

const editorSlice = createSlice({
  name: 'editor',
  initialState,
  reducers: {
    setCommand: (state, action: PayloadAction<string>) => {
      state.command = action.payload;
      state.updateClause = action.payload.match(UPDATE_CLAUSE) !== null;
    },
    addCommandHistory: (state, action: PayloadAction<string>) => {
      state.commandHistory.push(action.payload);
    },
    addCommandFavorites: (state, action: PayloadAction<string>) => {
      state.commandFavorites.push(action.payload);
    },
    // Needed by the EditorBar star toggle (add if absent, remove if present).
    removeCommandFavorites: (state, action: PayloadAction<string>) => {
      state.commandFavorites = state.commandFavorites.filter(
        (favorite) => favorite !== action.payload,
      );
    },
  },
});

export const { setCommand, addCommandHistory, addCommandFavorites, removeCommandFavorites } =
  editorSlice.actions;

export default editorSlice.reducer;
