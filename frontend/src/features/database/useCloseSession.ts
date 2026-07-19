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

import { useCallback } from 'react';
import { useAppDispatch } from '../../app/hooks';
import { useDisconnectMutation } from '../api/apiSlice';
import { addAlert } from '../alert/alertSlice';
import { clearConnection } from './databaseSlice';
import { resetMetaData } from './metadataSlice';
import { trimFrame } from '../frame/frameSlice';

/**
 * "Close Session" orchestration, shared by ServerStatusFrame,
 * ServerDisconnectFrame and the sidebar. Ports the old ServerDisconnectFrame
 * mount effect: run the disconnect mutation and, only on success, clear the
 * connection state, reset metadata and fire the NoticeServerDisconnected
 * alert (the old UI slices had no disconnect-failure alert either, so a
 * failed disconnect leaves state untouched). ServerStatus frames are trimmed
 * since their content is stale afterwards; FrameArea's auto-open effect then
 * brings up the ServerConnect frame.
 */
export function useCloseSession(): () => Promise<void> {
  const dispatch = useAppDispatch();
  const [disconnect] = useDisconnectMutation();

  return useCallback(async () => {
    try {
      await disconnect().unwrap();
    } catch {
      return;
    }
    dispatch(clearConnection());
    dispatch(resetMetaData());
    dispatch(trimFrame('ServerStatus'));
    dispatch(addAlert('NoticeServerDisconnected'));
  }, [disconnect, dispatch]);
}
