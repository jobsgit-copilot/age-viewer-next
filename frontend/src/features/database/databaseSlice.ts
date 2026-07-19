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
import type { ConnectionInfo } from '../../types';

export type DatabaseStatus = 'init' | 'connected' | 'disconnected';

/**
 * Connection state for the UI.
 *
 * SECURITY: the DB password is NEVER stored here (the old frontend kept it
 * in this slice — deliberately not ported). The v2 backend also no longer
 * echoes the password in connection-info responses (contract §9.1), so
 * `setConnectionInfo` structurally cannot leak it into the store. All
 * session state lives server-side behind the `connect.sid` cookie.
 */
export interface DatabaseState {
  status: DatabaseStatus;
  host: string;
  port: number | string;
  user: string;
  database: string;
  /** Current graph name; undefined until the backend reports one. */
  graph?: string;
}

const emptyConnection: Omit<DatabaseState, 'status'> = {
  host: '',
  port: '',
  user: '',
  database: '',
  graph: undefined,
};

const initialState: DatabaseState = {
  status: 'init',
  ...emptyConnection,
};

const databaseSlice = createSlice({
  name: 'database',
  initialState,
  reducers: {
    /** Apply a ConnectionInfo response (connect / getConnectionStatus). */
    setConnectionInfo: (state, action: PayloadAction<ConnectionInfo>) => {
      const { host, port, user, database, graph } = action.payload;
      state.host = host;
      state.port = port;
      state.user = user;
      state.database = database;
      state.graph = graph;
      state.status = 'connected';
    },
    /** After disconnect or a failed status check. */
    clearConnection: (): DatabaseState => ({
      status: 'disconnected',
      ...emptyConnection,
    }),
    changeGraph: (state, action: PayloadAction<{ graphName: string }>) => {
      state.graph = action.payload.graphName;
    },
  },
});

export const { setConnectionInfo, clearConnection, changeGraph } = databaseSlice.actions;

export default databaseSlice.reducer;
