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

import { Button, Col, Popconfirm, Row, Select, Space, Typography } from 'antd';
import { CloseOutlined, SyncOutlined } from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { useGetMetaDataMutation } from '../api/apiSlice';
import { addAlert } from '../alert/alertSlice';
import { changeGraph } from '../database/databaseSlice';
import {
  changeCurrentGraph,
  processMetadataResponse,
  setMetaData,
} from '../database/metadataSlice';
import { useCloseSession } from '../database/useCloseSession';
import Frame from './Frame';

export interface ServerStatusFrameProps {
  frameKey: string;
  reqString: string;
  isPinned: boolean;
}

/**
 * Port of the old `ServerStatusFrame` (+ the ServerDisconnectFrame close
 * flow, folded into `useCloseSession`): connection info, current-graph
 * selector, metadata refresh, close session.
 *
 * Intentionally not ported: the cytoscape metadata chart, the "Create Graph"
 * initializer modal, and the tutorial trigger — those belong to the chart /
 * graph-initializer feature areas.
 */
function ServerStatusFrame({ frameKey, reqString, isPinned }: ServerStatusFrameProps) {
  const dispatch = useAppDispatch();
  const { host, port, user, database } = useAppSelector((state) => state.database);
  const graph = useAppSelector((state) => state.database.graph);
  const graphs = useAppSelector((state) => state.metadata.graphs);
  const currentGraph = useAppSelector((state) => state.metadata.currentGraph);
  const [getMetaData, { isLoading: isRefreshing }] = useGetMetaDataMutation();
  const closeSession = useCloseSession();

  const refreshMetaData = async () => {
    try {
      const metadata = await getMetaData({ currentGraph }).unwrap();
      dispatch(setMetaData(processMetadataResponse(metadata)));
    } catch {
      dispatch(addAlert('ErrorMetaFail'));
    }
  };

  const onSelectGraph = (graphName: string) => {
    dispatch(changeCurrentGraph({ name: graphName }));
    dispatch(changeGraph({ graphName }));
  };

  return (
    <Frame reqString={reqString} frameKey={frameKey} isPinned={isPinned}>
      <Row>
        <Col span={6}>
          <Typography.Title level={4}>Connection Status</Typography.Title>
          <Typography.Text>This is your current connection information.</Typography.Text>
        </Col>
        <Col span={18}>
          <p>
            You are connected as user&nbsp;
            <strong>{user}</strong>
          </p>
          <p>
            to&nbsp;
            <strong>
              {host}
              :
              {port}
              /
              {database}
            </strong>
          </p>
          <p>
            Graph path has been set to&nbsp;
            <strong>{graph}</strong>
          </p>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Select
              style={{ minWidth: 240 }}
              placeholder="Select Graph"
              value={currentGraph || undefined}
              onChange={onSelectGraph}
              options={Object.keys(graphs).map((graphName) => ({
                value: graphName,
                label: graphName,
              }))}
            />
            <Space>
              <Button
                icon={<SyncOutlined />}
                onClick={refreshMetaData}
                loading={isRefreshing}
              >
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
            </Space>
          </Space>
        </Col>
      </Row>
    </Frame>
  );
}

export default ServerStatusFrame;
