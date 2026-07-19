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
import { about, defaultSetting } from '../../conf/config';

export interface SettingState {
  theme: string;
  maxNumOfFrames: number;
  maxNumOfHistories: number;
  maxDataOfGraph: number;
  maxDataOfTable: number;
  releaseDate: string;
  version: string;
  license: string;
}

const defaults: SettingState = {
  theme: defaultSetting.theme,
  maxNumOfFrames: defaultSetting.maxNumOfFrames,
  maxNumOfHistories: defaultSetting.maxNumOfHistories,
  maxDataOfGraph: defaultSetting.maxDataOfGraph,
  maxDataOfTable: defaultSetting.maxDataOfTable,
  releaseDate: about.releaseDate,
  version: about.version,
  license: about.license,
};

// Hydrate from localStorage (old app used cookies — see persistence.ts).
const initialState: SettingState = { ...defaults, ...loadSlice<SettingState>('setting') };

export interface SettingValues {
  theme: string;
  maxNumOfFrames: number;
  maxNumOfHistories: number;
  maxDataOfGraph: number;
  maxDataOfTable: number;
}

const settingSlice = createSlice({
  name: 'setting',
  initialState,
  reducers: {
    resetSetting: () => ({ ...defaults }),
    changeTheme: (state, action: PayloadAction<string>) => {
      state.theme = action.payload;
    },
    changeMaxNumOfFrames: (state, action: PayloadAction<number>) => {
      state.maxNumOfFrames = action.payload;
    },
    changeMaxNumOfHistories: (state, action: PayloadAction<number>) => {
      state.maxNumOfHistories = action.payload;
    },
    changeMaxDataOfGraph: (state, action: PayloadAction<number>) => {
      state.maxDataOfGraph = action.payload;
    },
    changeMaxDataOfTable: (state, action: PayloadAction<number>) => {
      state.maxDataOfTable = action.payload;
    },
    changeSettings: (state, action: PayloadAction<Partial<SettingValues>>) => {
      Object.assign(state, action.payload);
    },
  },
});

export const {
  resetSetting,
  changeTheme,
  changeMaxNumOfFrames,
  changeMaxNumOfHistories,
  changeMaxDataOfGraph,
  changeMaxDataOfTable,
  changeSettings,
} = settingSlice.actions;

export default settingSlice.reducer;
