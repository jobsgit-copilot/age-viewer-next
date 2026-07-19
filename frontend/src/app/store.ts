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

import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { apiSlice } from '../features/api/apiSlice';
import { saveSlice } from './persistence';
import databaseReducer from '../features/database/databaseSlice';
import metadataReducer from '../features/database/metadataSlice';
import framesReducer from '../features/frame/frameSlice';
import resultsReducer from '../features/results/resultsSlice';
import editorReducer from '../features/editor/editorSlice';
import settingReducer from '../features/setting/settingSlice';
import alertsReducer from '../features/alert/alertSlice';
import modalReducer from '../features/modal/modalSlice';
import navigatorReducer from '../features/menu/menuSlice';
import layoutReducer from '../features/layout/layoutSlice';

/**
 * State keys keep the old frontend's names (`navigator`, `frames`, ...).
 * All server state (connection info, metadata, cypher results, keywords)
 * lives in `api` via RTK Query — the UI slices below carry no thunks.
 */
const reducer = {
  [apiSlice.reducerPath]: apiSlice.reducer,
  navigator: navigatorReducer,
  setting: settingReducer,
  database: databaseReducer,
  metadata: metadataReducer,
  frames: framesReducer,
  results: resultsReducer,
  alerts: alertsReducer,
  editor: editorReducer,
  modal: modalReducer,
  layout: layoutReducer,
};

export function createStore() {
  return configureStore({
    reducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(apiSlice.middleware),
  });
}

export type AppStore = ReturnType<typeof createStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

export const store = createStore();

setupListeners(store.dispatch);

// Persist UI-only slices to localStorage (old app used cookies — see
// app/persistence.ts). Writes are throttled and only happen when the
// relevant slice reference actually changed.
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let lastSetting = store.getState().setting;
let lastEditor = store.getState().editor;

store.subscribe(() => {
  const { setting, editor } = store.getState();
  if (setting === lastSetting && editor === lastEditor) return;
  lastSetting = setting;
  lastEditor = editor;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    saveSlice('setting', store.getState().setting);
    const editorState = store.getState().editor;
    saveSlice('editor', {
      commandHistory: editorState.commandHistory,
      commandFavorites: editorState.commandFavorites,
    });
  }, 300);
});
