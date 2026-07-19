// @vitest-environment node
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

import { describe, expect, it } from 'vitest';
import { buildRunPlan, historyNext, historyPrev } from './editorHelpers';
import type { RunFlags } from './editorHelpers';

const FLAGS: RunFlags = { closeWhenDisconnect: false, connectionStatusSkip: false };

describe('buildRunPlan (old Editor.jsx onClick branch ladder)', () => {
  it("':play' → Contents frame, no cypher execution", () => {
    expect(buildRunPlan(':play northwind', 'connected', FLAGS)).toEqual({
      trim: [],
      alerts: [],
      frame: { reqString: ':play northwind', frameName: 'Contents' },
      executeCypher: false,
    });
  });

  it("':PLAY' matching is case-insensitive", () => {
    const plan = buildRunPlan(':PLAY guide', 'connected', FLAGS);
    expect(plan.frame?.frameName).toBe('Contents');
  });

  it("':csv' → CSV frame", () => {
    const plan = buildRunPlan(':csv load', 'connected', FLAGS);
    expect(plan.frame?.frameName).toBe('CSV');
    expect(plan.executeCypher).toBe(false);
  });

  it("':server status' → trim + ServerStatus frame, regardless of db status", () => {
    for (const status of ['init', 'connected', 'disconnected'] as const) {
      expect(buildRunPlan(':server status', status, FLAGS)).toEqual({
        trim: ['ServerStatus'],
        alerts: [],
        frame: { reqString: ':server status', frameName: 'ServerStatus' },
        executeCypher: false,
      });
    }
  });

  it("disconnected + ':server disconnect' → error alert + ServerDisconnect frame", () => {
    expect(buildRunPlan(':server disconnect', 'disconnected', FLAGS)).toEqual({
      trim: ['ServerDisconnect', 'ServerConnect'],
      alerts: ['ErrorNoDatabaseConnected'],
      frame: { reqString: ':server disconnect', frameName: 'ServerDisconnect' },
      executeCypher: false,
    });
  });

  it("disconnected + ':server connect' → ServerConnect frame with lowercase command", () => {
    expect(buildRunPlan(':SERVER CONNECT', 'disconnected', FLAGS)).toEqual({
      trim: ['ServerConnect'],
      alerts: [],
      frame: { reqString: ':server connect', frameName: 'ServerConnect' },
      executeCypher: false,
    });
  });

  it("disconnected + ':server connect' + closeWhenDisconnect → no-op", () => {
    expect(
      buildRunPlan(':server connect', 'disconnected', { ...FLAGS, closeWhenDisconnect: true }),
    ).toEqual({ trim: [], alerts: [], executeCypher: false });
  });

  it('disconnected + cypher → error alert + ServerConnect frame', () => {
    expect(buildRunPlan('MATCH (n) RETURN n', 'disconnected', FLAGS)).toEqual({
      trim: ['ServerConnect'],
      alerts: ['ErrorNoDatabaseConnected'],
      frame: { reqString: 'MATCH (n) RETURN n', frameName: 'ServerConnect' },
      executeCypher: false,
    });
  });

  it("connected + ':server disconnect' → ServerDisconnect frame, no alert (fires after actual disconnect)", () => {
    expect(buildRunPlan(':server disconnect', 'connected', FLAGS)).toEqual({
      trim: ['ServerDisconnect'],
      alerts: [],
      frame: { reqString: ':server disconnect', frameName: 'ServerDisconnect' },
      executeCypher: false,
    });
  });

  it("connected + ':server connect' → notice + ServerStatus frame", () => {
    expect(buildRunPlan(':server connect', 'connected', FLAGS)).toEqual({
      trim: ['ServerStatus'],
      alerts: ['NoticeAlreadyConnected'],
      frame: { reqString: ':server connect', frameName: 'ServerStatus' },
      executeCypher: false,
    });
  });

  it("connected + ':server connect' + connectionStatusSkip → no-op", () => {
    expect(
      buildRunPlan(':server connect', 'connected', { ...FLAGS, connectionStatusSkip: true }),
    ).toEqual({ trim: [], alerts: [], executeCypher: false });
  });

  it("connected + cypher → CypherResultFrame + executeCypher", () => {
    expect(buildRunPlan('MATCH (n) RETURN n', 'connected', FLAGS)).toEqual({
      trim: [],
      alerts: [],
      frame: { reqString: 'MATCH (n) RETURN n', frameName: 'CypherResultFrame' },
      executeCypher: true,
    });
  });

  it("'init' status falls through the ladder without a frame (old behavior)", () => {
    expect(buildRunPlan('MATCH (n) RETURN n', 'init', FLAGS)).toEqual({
      trim: [],
      alerts: [],
      executeCypher: false,
    });
  });
});

describe('historyPrev / historyNext (old Ctrl-Up / Ctrl-Down)', () => {
  const history = ['first', 'second', 'third'];

  it('no-ops on empty history', () => {
    expect(historyPrev([], -1)).toBeNull();
    expect(historyNext([], -1)).toBeNull();
  });

  it('Ctrl-Up from fresh (-1) shows the newest entry', () => {
    expect(historyPrev(history, -1)).toEqual({ index: 2, value: 'third' });
  });

  it('Ctrl-Up walks back and sticks at the oldest entry', () => {
    expect(historyPrev(history, 2)).toEqual({ index: 1, value: 'second' });
    expect(historyPrev(history, 1)).toEqual({ index: 0, value: 'first' });
    expect(historyPrev(history, 0)).toEqual({ index: 0, value: 'first' });
  });

  it('Ctrl-Down walks forward and returns to fresh past the newest', () => {
    expect(historyNext(history, 0)).toEqual({ index: 1, value: 'second' });
    expect(historyNext(history, 1)).toEqual({ index: 2, value: 'third' });
    expect(historyNext(history, 2)).toEqual({ index: -1, value: '' });
  });

  it('Ctrl-Down at fresh stays fresh with an empty editor', () => {
    expect(historyNext(history, -1)).toEqual({ index: -1, value: '' });
  });

  it('round trip: up to oldest then down back to empty', () => {
    let index = -1;
    index = historyPrev(history, index)!.index;
    index = historyPrev(history, index)!.index;
    index = historyPrev(history, index)!.index;
    expect(index).toBe(0);
    expect(historyNext(history, historyNext(history, historyNext(history, index)!.index)!.index))
      .toEqual({ index: -1, value: '' });
  });
});
