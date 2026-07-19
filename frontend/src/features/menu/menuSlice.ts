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

export interface NavigatorState {
  /**
   * Menu ids only. The old slice stored FontAwesome icon objects in redux
   * (non-serializable); icons are a rendering concern and live in the
   * sidebar component now.
   */
  menuList: string[];
  activeMenu: string;
  isActive: boolean;
}

const initialState: NavigatorState = {
  menuList: ['home', 'setting'],
  activeMenu: 'home',
  isActive: true,
};

const menuSlice = createSlice({
  name: 'navigator',
  initialState,
  reducers: {
    toggleMenu: {
      reducer: (state, action: PayloadAction<{ selectedMenuName: string }>) => {
        let isActive = true;
        let { selectedMenuName } = action.payload;
        if (state.activeMenu === selectedMenuName) {
          selectedMenuName = '';
          isActive = false;
        }
        state.activeMenu = selectedMenuName;
        state.isActive = isActive;
      },
      prepare: (selectedMenuName: string) => ({ payload: { selectedMenuName } }),
    },
  },
});

export const { toggleMenu } = menuSlice.actions;

export default menuSlice.reducer;
