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

import type { DatabaseStatus } from '../database/databaseSlice';

/**
 * Pure helpers extracted from the old editor components so the behavior is
 * unit-testable without a CodeMirror/jsdom environment:
 * - `historyPrev`/`historyNext` — Ctrl-Up/Ctrl-Down command-history
 *   navigation from the old CodeMirrorWrapper.
 * - `buildRunPlan` — the Run-button orchestration from the old Editor.jsx
 *   `onClick` (frame-name mapping, trims, alerts, cypher execution flag).
 */

export interface HistoryNavResult {
  /** New history cursor; -1 means "past the newest entry" (fresh command). */
  index: number;
  /** Editor content to show. */
  value: string;
}

/**
 * Previous (older) history entry — old `Ctrl-Up` logic.
 *
 * DEVIATION: the old wrapper initialized the cursor to `history.length`
 * instead of -1, which made a first Ctrl-Down read `history[length + 1]`
 * (undefined). The cursor now starts at -1; Ctrl-Up from -1 behaves exactly
 * like the old first Ctrl-Up (newest entry).
 */
export function historyPrev(history: readonly string[], index: number): HistoryNavResult | null {
  if (history.length === 0) return null;
  if (index === -1) {
    const currentIdx = history.length - 1;
    return { index: currentIdx, value: history[currentIdx] };
  }
  if (index === 0) {
    return { index: 0, value: history[0] };
  }
  return { index: index - 1, value: history[index - 1] };
}

/** Next (newer) history entry — old `Ctrl-Down` logic. */
export function historyNext(history: readonly string[], index: number): HistoryNavResult | null {
  if (history.length === 0) return null;
  if (index === -1) {
    return { index: -1, value: '' };
  }
  if (index === history.length - 1) {
    return { index: -1, value: '' };
  }
  return { index: index + 1, value: history[index + 1] };
}

/** Static feature flags the old Editor.jsx read from `conf/config.js`. */
export interface RunFlags {
  closeWhenDisconnect: boolean;
  connectionStatusSkip: boolean;
}

/**
 * What a Run click should do, derived 1:1 from the old Editor.jsx onClick
 * branch ladder. `frame` is the single frame to add (with a fresh refKey);
 * `trim`/`alerts` fire before it, in order. `executeCypher` marks the only
 * branch that actually talks to the database.
 */
export interface RunPlan {
  trim: string[];
  alerts: string[];
  frame?: { reqString: string; frameName: string };
  executeCypher: boolean;
}

const NO_PLAN: RunPlan = { trim: [], alerts: [], executeCypher: false };

export function buildRunPlan(
  command: string,
  status: DatabaseStatus,
  flags: RunFlags,
): RunPlan {
  const upper = command.toUpperCase();

  if (upper.startsWith(':PLAY')) {
    return { ...NO_PLAN, frame: { reqString: command, frameName: 'Contents' } };
  }
  if (upper.startsWith(':CSV')) {
    return { ...NO_PLAN, frame: { reqString: command, frameName: 'CSV' } };
  }
  if (upper === ':SERVER STATUS') {
    return {
      ...NO_PLAN,
      trim: ['ServerStatus'],
      frame: { reqString: command, frameName: 'ServerStatus' },
    };
  }
  if (status === 'disconnected' && upper === ':SERVER DISCONNECT') {
    return {
      ...NO_PLAN,
      trim: ['ServerDisconnect', 'ServerConnect'],
      alerts: ['ErrorNoDatabaseConnected'],
      frame: { reqString: command, frameName: 'ServerDisconnect' },
    };
  }
  if (status === 'disconnected' && upper === ':SERVER CONNECT') {
    if (flags.closeWhenDisconnect) return NO_PLAN;
    return {
      ...NO_PLAN,
      trim: ['ServerConnect'],
      frame: { reqString: ':server connect', frameName: 'ServerConnect' },
    };
  }
  if (status === 'disconnected') {
    return {
      ...NO_PLAN,
      trim: ['ServerConnect'],
      alerts: ['ErrorNoDatabaseConnected'],
      frame: { reqString: command, frameName: 'ServerConnect' },
    };
  }
  if (status === 'connected' && upper === ':SERVER DISCONNECT') {
    // No alert at frame-open: the ServerDisconnect frame is the confirmation
    // step; 'NoticeServerDisconnected' fires from useCloseSession only after
    // the disconnect mutation actually succeeds.
    return {
      ...NO_PLAN,
      trim: ['ServerDisconnect'],
      frame: { reqString: command, frameName: 'ServerDisconnect' },
    };
  }
  if (status === 'connected' && upper === ':SERVER CONNECT') {
    if (flags.connectionStatusSkip) return NO_PLAN;
    return {
      ...NO_PLAN,
      trim: ['ServerStatus'],
      alerts: ['NoticeAlreadyConnected'],
      frame: { reqString: command, frameName: 'ServerStatus' },
    };
  }
  if (status === 'connected') {
    return {
      ...NO_PLAN,
      frame: { reqString: command, frameName: 'CypherResultFrame' },
      executeCypher: true,
    };
  }
  // 'init' (or any unknown status): the old ladder fell through without
  // adding a frame; history/clear still happen in the caller.
  return NO_PLAN;
}
