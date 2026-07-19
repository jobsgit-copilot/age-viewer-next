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

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Button, Divider, InputNumber, Popconfirm, Select, Space, Typography } from 'antd';
import { CloseOutlined, HomeOutlined, SettingOutlined, SyncOutlined } from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { useGetMetaDataMutation } from '../api/apiSlice';
import { addAlert } from '../alert/alertSlice';
import { setCommand } from '../editor/editorSlice';
import {
  processMetadataResponse,
  setMetaData,
  setMetaDataFailed,
} from '../database/metadataSlice';
import type { LabelCountRow } from '../database/metadataSlice';
import { useCloseSession } from '../database/useCloseSession';
import { toggleMenu } from '../menu/menuSlice';
import {
  changeMaxDataOfGraph,
  changeMaxDataOfTable,
  changeMaxNumOfFrames,
  changeMaxNumOfHistories,
  changeTheme,
  resetSetting,
} from '../setting/settingSlice';
import styles from './Sidebar.module.css';

/** Menu ids live in the navigator slice; icons are a rendering concern. */
const menuIcons: Record<string, ReactNode> = {
  home: <HomeOutlined />,
  setting: <SettingOutlined />,
};

/** Query generators ported verbatim from the old SidebarHome. */
function genLabelQuery(eleType: 'node' | 'edge', labelName: string, graph: string): string {
  if (eleType === 'node') {
    if (labelName === '*') {
      return `SELECT * from cypher('${graph}', $$
        MATCH (V)
        RETURN V
$$) as (V agtype);`;
    }
    return `SELECT * from cypher('${graph}', $$
        MATCH (V:${labelName})
        RETURN V
$$) as (V agtype);`;
  }
  if (labelName === '*') {
    return `SELECT * from cypher('${graph}', $$
        MATCH (V)-[R]-(V2)
        RETURN V,R,V2
$$) as (V agtype, R agtype, V2 agtype);`;
  }
  return `SELECT * from cypher('${graph}', $$
        MATCH (V)-[R:${labelName}]-(V2)
        RETURN V,R,V2
$$) as (V agtype, R agtype, V2 agtype);`;
}

function LabelList({
  eleType,
  rows,
}: {
  eleType: 'node' | 'edge';
  rows: LabelCountRow[];
}) {
  const dispatch = useAppDispatch();
  const graph = useAppSelector((state) => state.database.graph) ?? '';
  const itemClass = eleType === 'node' ? styles.nodeItem : styles.edgeItem;
  return (
    <div className={styles.labelList}>
      {rows.map((row) => (
        <button
          type="button"
          key={row.label}
          className={itemClass}
          onClick={() => dispatch(setCommand(genLabelQuery(eleType, row.label, graph)))}
        >
          {row.label}
          (
          {row.cnt}
          )
        </button>
      ))}
    </div>
  );
}

/**
 * Port of the old SidebarHome: node/edge label summaries (the metadata slice
 * already aggregates the `*` rows) with click-to-editor queries, plus
 * Refresh / Close Session. The old Properties section is omitted — the
 * backend always returns `propertyKeys: []` (contract quirk Q18).
 */
function SidebarHome() {
  const dispatch = useAppDispatch();
  const currentGraph = useAppSelector((state) => state.metadata.currentGraph);
  const currentGraphData = useAppSelector((state) => state.metadata.graphs[state.metadata.currentGraph]);
  const [getMetaData, { isLoading: isRefreshing }] = useGetMetaDataMutation();
  const closeSession = useCloseSession();

  const nodes =
    currentGraphData && 'nodes' in currentGraphData ? currentGraphData.nodes : [];
  const edges =
    currentGraphData && 'edges' in currentGraphData ? currentGraphData.edges : [];

  const refresh = async () => {
    try {
      const metadata = await getMetaData({ currentGraph }).unwrap();
      dispatch(setMetaData(processMetadataResponse(metadata)));
    } catch {
      dispatch(addAlert('ErrorMetaFail'));
    }
  };

  return (
    <div>
      <Typography.Title level={4}>Graph Metadata</Typography.Title>
      <div>
        <b>Node Label</b>
        <LabelList eleType="node" rows={nodes} />
      </div>
      <Divider style={{ margin: '12px 0' }} />
      <div>
        <b>Edge Label</b>
        <LabelList eleType="edge" rows={edges} />
      </div>
      <div className={styles.actions}>
        <Button icon={<SyncOutlined />} onClick={refresh} loading={isRefreshing}>
          Refresh
        </Button>
        <Popconfirm
          title="Are you sure you want to close this window?"
          onConfirm={closeSession}
        >
          <Button icon={<CloseOutlined />} danger>
            Close Session
          </Button>
        </Popconfirm>
      </div>
    </div>
  );
}

/**
 * Port of the old SidebarSetting. Persistence to localStorage is handled by
 * the store subscription in app/store.ts (the old app saved cookies on every
 * change), so this panel only dispatches slice actions.
 */
function SidebarSetting() {
  const dispatch = useAppDispatch();
  const setting = useAppSelector((state) => state.setting);

  return (
    <div>
      <Typography.Title level={4}>Configuration</Typography.Title>
      <b>Themes</b>
      <Divider style={{ margin: '8px 0' }} />
      <Select
        style={{ width: '100%' }}
        value={setting.theme}
        onChange={(value) => dispatch(changeTheme(value))}
        options={[
          { value: 'default', label: 'Default' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
      <div style={{ marginTop: 16 }}>
        <b>Frames</b>
        <Divider style={{ margin: '8px 0' }} />
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>Maximum Number of Frames:</div>
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            value={setting.maxNumOfFrames}
            onChange={(value) => dispatch(changeMaxNumOfFrames(value ?? 0))}
          />
          <div>Max Number of Histories:</div>
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            value={setting.maxNumOfHistories}
            onChange={(value) => dispatch(changeMaxNumOfHistories(value ?? 0))}
          />
        </Space>
      </div>
      <div style={{ marginTop: 16 }}>
        <b>Data Display</b>
        <Divider style={{ margin: '8px 0' }} />
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>Maximum Data of Graph Visualization</div>
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            value={setting.maxDataOfGraph}
            onChange={(value) => dispatch(changeMaxDataOfGraph(value ?? 0))}
          />
          <div>Maximum Data of Table Display</div>
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            value={setting.maxDataOfTable}
            onChange={(value) => dispatch(changeMaxDataOfTable(value ?? 0))}
          />
        </Space>
      </div>
      <div style={{ marginTop: 16 }}>
        <Button type="primary" block onClick={() => dispatch(resetSetting())}>
          Reset Configuration
        </Button>
      </div>
    </div>
  );
}

/**
 * Left sidebar: the old Navigator (menu icon strip) + Sidebar (home/setting
 * panels) combined. Also carries the metadata-fetch wiring of the old
 * Contents.jsx / SidebarHome.jsx effects: once the database reports
 * 'connected', metadata is fetched into the metadata slice; switching the
 * current graph refetches when that graph has no expanded data yet.
 */
function Sidebar() {
  const dispatch = useAppDispatch();
  const { menuList, activeMenu, isActive } = useAppSelector((state) => state.navigator);
  const dbStatus = useAppSelector((state) => state.database.status);
  const metadataStatus = useAppSelector((state) => state.metadata.status);
  const currentGraph = useAppSelector((state) => state.metadata.currentGraph);
  const graphs = useAppSelector((state) => state.metadata.graphs);
  const [getMetaData] = useGetMetaDataMutation();

  useEffect(() => {
    if (dbStatus !== 'connected') return;
    if (metadataStatus === 'connected') {
      if (!currentGraph) return;
      const data = graphs[currentGraph];
      if (data && 'nodes' in data) return;
    }
    let cancelled = false;
    getMetaData({ currentGraph })
      .unwrap()
      .then((metadata) => {
        if (!cancelled) {
          dispatch(setMetaData(processMetadataResponse(metadata)));
        }
      })
      .catch(() => {
        if (!cancelled) {
          dispatch(setMetaDataFailed());
          dispatch(addAlert('ErrorMetaFail'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dbStatus, metadataStatus, currentGraph, graphs, getMetaData, dispatch]);

  return (
    <div className={styles.root}>
      <nav className={styles.menuBar}>
        {menuList.map((menuName) => (
          <Button
            key={menuName}
            id={`side-${menuName}-tab`}
            type="text"
            icon={menuIcons[menuName] ?? null}
            title={menuName}
            aria-label={menuName}
            style={{ color: activeMenu === menuName && isActive ? '#ffffff' : '#b0b0b0' }}
            onClick={() => dispatch(toggleMenu(menuName))}
          />
        ))}
      </nav>
      {isActive && activeMenu === 'home' ? (
        <div className={styles.panel}>
          <SidebarHome />
        </div>
      ) : null}
      {isActive && activeMenu === 'setting' ? (
        <div className={styles.panel}>
          <SidebarSetting />
        </div>
      ) : null}
    </div>
  );
}

export default Sidebar;
