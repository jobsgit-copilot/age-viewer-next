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
import { uid } from '../../app/id';

export type AlertType = 'Notice' | 'Error';

export interface AlertProps {
  key: string;
  alertType: AlertType;
  errorMessage: string;
}

export interface NamedAlert {
  alertName: string;
  alertProps: AlertProps;
}

export type AlertsState = NamedAlert[];

const ERROR_ALERTS = ['ErrorServerConnectFail', 'ErrorNoDatabaseConnected', 'ErrorPlayLoadFail'];

const initialState: AlertsState = [];

const alertSlice = createSlice({
  name: 'alerts',
  initialState,
  reducers: {
    addAlert: {
      reducer: (state, action: PayloadAction<{ alertName: string; message?: string }>) => {
        const { alertName, message: errorMessage = '' } = action.payload;
        const alertType: AlertType = ERROR_ALERTS.includes(alertName) ? 'Error' : 'Notice';
        state.push({ alertName, alertProps: { key: uid(), alertType, errorMessage } });
      },
      prepare: (alertName: string, message?: string) => ({ payload: { alertName, message } }),
    },
    removeAlert: {
      reducer: (state, action: PayloadAction<{ alertKey: string }>) =>
        state.filter((alert) => alert.alertProps.key !== action.payload.alertKey),
      prepare: (alertKey: string) => ({ payload: { alertKey } }),
    },
  },
});

export const { addAlert, removeAlert } = alertSlice.actions;

export default alertSlice.reducer;
