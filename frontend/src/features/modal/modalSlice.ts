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

export interface ModalState {
  isOpen: boolean;
  isTutorial: boolean;
  graphHistory: string[];
  elementHistory: unknown[];
}

const initialState: ModalState = {
  isOpen: false,
  isTutorial: false,
  graphHistory: [],
  elementHistory: [],
};

const modalSlice = createSlice({
  name: 'modal',
  initialState,
  reducers: {
    openModal: (state) => {
      state.isOpen = true;
    },
    closeModal: (state) => {
      state.isOpen = false;
    },
    openTutorial: (state) => {
      state.isTutorial = true;
    },
    closeTutorial: (state) => {
      state.isTutorial = false;
    },
    addGraphHistory: {
      reducer: (state, action: PayloadAction<{ graph: string }>) => {
        state.graphHistory.push(action.payload.graph);
      },
      prepare: (graph: string) => ({ payload: { graph } }),
    },
    addElementHistory: {
      reducer: (state, action: PayloadAction<{ element: unknown }>) => {
        state.elementHistory.push(action.payload.element);
      },
      prepare: (element: unknown) => ({ payload: { element } }),
    },
    removeGraphHistory: (state) => {
      state.graphHistory = [];
    },
    removeElementHistory: (state) => {
      state.elementHistory = [];
    },
  },
});

export const {
  openModal,
  closeModal,
  openTutorial,
  closeTutorial,
  addGraphHistory,
  addElementHistory,
  removeGraphHistory,
  removeElementHistory,
} = modalSlice.actions;

export default modalSlice.reducer;
