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
import { createStore } from './store';
import { apiSlice } from '../features/api/apiSlice';
import { setCommand, addCommandHistory, addCommandFavorites } from '../features/editor/editorSlice';
import { addFrame, pinFrame, removeFrame, trimFrame } from '../features/frame/frameSlice';
import { addAlert, removeAlert } from '../features/alert/alertSlice';
import { setConnectionInfo, clearConnection, changeGraph } from '../features/database/databaseSlice';
import {
  changeCurrentGraph,
  processMetadataResponse,
  setMetaData,
} from '../features/database/metadataSlice';
import { toggleMenu } from '../features/menu/menuSlice';
import { setLabel } from '../features/layout/layoutSlice';
import { changeTheme, changeSettings, resetSetting } from '../features/setting/settingSlice';
import { openModal, closeModal } from '../features/modal/modalSlice';
import type { MetadataResponse } from '../types';

describe('store registration', () => {
  it('registers every slice under the expected state key', () => {
    const store = createStore();
    const state = store.getState();
    expect(Object.keys(state).sort()).toEqual(
      [
        apiSlice.reducerPath,
        'alerts',
        'database',
        'editor',
        'frames',
        'layout',
        'metadata',
        'modal',
        'navigator',
        'results',
        'setting',
      ].sort(),
    );
  });

  it('has the expected initial states', () => {
    const state = createStore().getState();
    expect(state.database.status).toBe('init');
    expect(state.metadata).toMatchObject({
      graphs: {},
      status: 'init',
      currentGraph: '',
    });
    expect(state.frames).toEqual([]);
    expect(state.results).toEqual({});
    expect(state.alerts).toEqual([]);
    expect(state.editor).toMatchObject({
      command: '',
      updateClause: false,
      commandHistory: [],
      commandFavorites: [],
    });
    expect(state.navigator).toMatchObject({ activeMenu: 'home', isActive: true });
    expect(state.layout).toEqual({ isLabel: false });
    expect(state.modal).toMatchObject({ isOpen: false, isTutorial: false });
    expect(state.setting.theme).toBe('default');
  });
});

describe('database slice', () => {
  it('stores only non-sensitive connection info (never the password)', () => {
    const store = createStore();
    store.dispatch(
      setConnectionInfo({
        host: 'localhost',
        version: '14.5',
        port: 5432,
        database: 'agedb',
        user: 'postgres',
        graphs: [],
        graph: 'g1',
      }),
    );
    const { database } = store.getState();
    expect(database.status).toBe('connected');
    expect(database).toMatchObject({ host: 'localhost', database: 'agedb', graph: 'g1' });
    expect(database).not.toHaveProperty('password');
    store.dispatch(clearConnection());
    expect(store.getState().database.status).toBe('disconnected');
    store.dispatch(changeGraph({ graphName: 'g2' }));
    expect(store.getState().database.graph).toBe('g2');
  });
});

describe('editor slice', () => {
  it('flags update clauses via the CREATE/REMOVE/DELETE regex', () => {
    const store = createStore();
    store.dispatch(setCommand('MATCH (n) RETURN n'));
    expect(store.getState().editor.updateClause).toBe(false);
    store.dispatch(setCommand('CREATE (n:Person)'));
    expect(store.getState().editor.updateClause).toBe(true);
    store.dispatch(setCommand('MATCH (n) REMOVE n.age RETURN n'));
    expect(store.getState().editor.updateClause).toBe(true);
    store.dispatch(addCommandHistory('MATCH (n) RETURN n'));
    store.dispatch(addCommandFavorites('CREATE (n:Person)'));
    expect(store.getState().editor.commandHistory).toHaveLength(1);
    expect(store.getState().editor.commandFavorites).toHaveLength(1);
  });
});

describe('frames slice', () => {
  it('adds frames ahead of unpinned ones and keeps pinned frames on top', () => {
    const store = createStore();
    store.dispatch(addFrame('MATCH (a) RETURN a', 'CypherFrame', 'key-a'));
    store.dispatch(addFrame('MATCH (b) RETURN b', 'CypherFrame', 'key-b'));
    // Old FrameSlice behavior: new frames are inserted before the first
    // unpinned frame, so the newest unpinned frame comes first.
    expect(store.getState().frames.map((f) => f.frameProps.key)).toEqual(['key-b', 'key-a']);

    store.dispatch(pinFrame('key-a'));
    let frames = store.getState().frames;
    expect(frames[0]).toMatchObject({
      frameProps: { key: 'key-a' },
      isPinned: true,
      orgIndex: 1,
    });

    // New frames land after the pinned block.
    store.dispatch(addFrame('MATCH (c) RETURN c', 'CypherFrame', 'key-c'));
    frames = store.getState().frames;
    expect(frames.map((f) => f.frameProps.key)).toEqual(['key-a', 'key-c', 'key-b']);

    // Unpinning moves the frame back toward its recorded original index
    // (bumped by later insertions, so it lands at the end here).
    store.dispatch(pinFrame('key-a'));
    frames = store.getState().frames;
    expect(frames[0].isPinned).toBe(false);
    expect(frames.map((f) => f.frameProps.key)).toEqual(['key-c', 'key-b', 'key-a']);
  });

  it('marks :play frames with their target', () => {
    const store = createStore();
    store.dispatch(addFrame(':play northwind', 'CypherFrame', 'key-play'));
    expect(store.getState().frames[0].frameProps.playTarget).toBe('northwind');
  });

  it('removes frames by key and trims by frame name', () => {
    const store = createStore();
    store.dispatch(addFrame('q1', 'CypherFrame', 'key-1'));
    store.dispatch(addFrame('q2', 'TableFrame', 'key-2'));
    store.dispatch(removeFrame('key-1'));
    expect(store.getState().frames).toHaveLength(1);
    store.dispatch(trimFrame('TableFrame'));
    expect(store.getState().frames).toHaveLength(0);
  });
});

describe('metadata slice', () => {
  it('aggregates label counts with a synthetic * row and keeps {} graphs', () => {
    const response: MetadataResponse = {
      g1: {
        nodes: [
          { label: 'Person', cnt: 3, namespace_id: 1, namespace: 1, oid: 1, name: 'Person', kind: 'v', graph: 1 },
          { label: 'City', cnt: 4, namespace_id: 1, namespace: 1, oid: 2, name: 'City', kind: 'v', graph: 1 },
        ],
        edges: [
          { label: 'KNOWS', cnt: 5, namespace_id: 1, namespace: 1, oid: 3, name: 'KNOWS', kind: 'e', graph: 1 },
        ],
        propertyKeys: [],
        graph: 'g1',
        database: 'agedb',
        role: { user_name: 'postgres', role_name: 'admin' },
      },
      g2: {},
    };
    const processed = processMetadataResponse(response);
    const g1 = processed.g1 as { nodes: Array<{ label: string; cnt: number }>; edges: Array<{ label: string; cnt: number }>; id: string };
    expect(g1.nodes[0]).toEqual({ label: '*', cnt: 7 });
    expect(g1.edges[0]).toEqual({ label: '*', cnt: 5 });
    expect(g1.nodes).toHaveLength(3);
    expect(g1.id).toBeTruthy();
    expect(processed.g2).toEqual({});
  });

  it('sets metadata and resolves currentGraph by id or name', () => {
    const store = createStore();
    const processed = processMetadataResponse({
      g1: {
        nodes: [],
        edges: [],
        propertyKeys: [],
        graph: 'g1',
        database: 'agedb',
      },
    });
    store.dispatch(setMetaData(processed));
    expect(store.getState().metadata.status).toBe('connected');
    expect(store.getState().metadata.currentGraph).toBe('g1');
    store.dispatch(changeCurrentGraph({ name: 'g1' }));
    expect(store.getState().metadata.currentGraph).toBe('g1');
  });
});

describe('remaining UI slices', () => {
  it('alerts stack with typed severity', () => {
    const store = createStore();
    store.dispatch(addAlert('ErrorServerConnectFail', 'boom'));
    store.dispatch(addAlert('SomeNotice'));
    const { alerts } = store.getState();
    expect(alerts).toHaveLength(2);
    expect(alerts[0].alertProps.alertType).toBe('Error');
    expect(alerts[0].alertProps.errorMessage).toBe('boom');
    expect(alerts[1].alertProps.alertType).toBe('Notice');
    store.dispatch(removeAlert(alerts[0].alertProps.key));
    expect(store.getState().alerts).toHaveLength(1);
  });

  it('menu toggle, layout label, modal open/close, settings', () => {
    const store = createStore();
    store.dispatch(toggleMenu('setting'));
    expect(store.getState().navigator).toMatchObject({ activeMenu: 'setting', isActive: true });
    store.dispatch(toggleMenu('setting'));
    expect(store.getState().navigator).toMatchObject({ activeMenu: '', isActive: false });

    store.dispatch(setLabel());
    expect(store.getState().layout.isLabel).toBe(true);

    store.dispatch(openModal());
    expect(store.getState().modal.isOpen).toBe(true);
    store.dispatch(closeModal());
    expect(store.getState().modal.isOpen).toBe(false);

    store.dispatch(changeTheme('dark'));
    expect(store.getState().setting.theme).toBe('dark');
    store.dispatch(changeSettings({ maxNumOfFrames: 10 }));
    expect(store.getState().setting.maxNumOfFrames).toBe(10);
    store.dispatch(resetSetting());
    expect(store.getState().setting.theme).toBe('default');
    expect(store.getState().setting.maxNumOfFrames).toBe(0);
  });
});
