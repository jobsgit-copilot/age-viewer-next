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

import { Button, Col, Form, Input, InputNumber, Row, Typography } from 'antd';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import {
  formatApiError,
  isApiError,
  useConnectMutation,
  useGetMetaDataMutation,
} from '../api/apiSlice';
import { addAlert } from '../alert/alertSlice';
import { addFrame, trimFrame } from '../frame/frameSlice';
import { changeGraph } from '../database/databaseSlice';
import { processMetadataResponse, setMetaData } from '../database/metadataSlice';
import type { ConnectRequest } from '../../types';
import Frame from './Frame';

export interface ServerConnectFrameProps {
  frameKey: string;
  reqString: string;
  isPinned: boolean;
}

type ConnectFormValues = Pick<ConnectRequest, 'host' | 'port' | 'database' | 'user' | 'password'>;

const initialValues: Partial<ConnectFormValues> = {
  database: '',
  host: '',
  password: '',
  user: '',
};

/**
 * Port of the old `ServerConnectFrame` presentation + ServerConnectContainer
 * orchestration. On successful connect: notice alert, trim all ServerConnect
 * frames, refetch + store metadata, point the database slice at the first
 * graph, and open the ServerStatus frame. On failure: ErrorServerConnectFail
 * with the old `[severity]:(code) message` text.
 */
function ServerConnectFrame({ frameKey, reqString, isPinned }: ServerConnectFrameProps) {
  const dispatch = useAppDispatch();
  const currentGraph = useAppSelector((state) => state.metadata.currentGraph);
  const [connect, { isLoading }] = useConnectMutation();
  const [getMetaData] = useGetMetaDataMutation();

  const onFinish = async (values: ConnectFormValues) => {
    try {
      await connect(values).unwrap();
    } catch (error) {
      dispatch(
        addAlert(
          'ErrorServerConnectFail',
          isApiError(error) ? formatApiError(error) : String(error),
        ),
      );
      return;
    }
    dispatch(addAlert('NoticeServerConnected'));
    dispatch(trimFrame('ServerConnect'));
    try {
      const metadata = await getMetaData({ currentGraph }).unwrap();
      dispatch(setMetaData(processMetadataResponse(metadata)));
      const graphName = Object.keys(metadata)[0];
      if (graphName) {
        dispatch(changeGraph({ graphName }));
      }
    } catch {
      dispatch(addAlert('ErrorMetaFail'));
    }
    dispatch(addFrame(':server status', 'ServerStatus'));
  };

  return (
    <Frame reqString={reqString} frameKey={frameKey} isPinned={isPinned}>
      <Row>
        <Col span={6}>
          <Typography.Title level={4}>Connect to Database</Typography.Title>
          <Typography.Text>Database access might require an authenticated connection.</Typography.Text>
        </Col>
        <Col span={18}>
          <Form<ConnectFormValues>
            initialValues={initialValues}
            layout="vertical"
            onFinish={onFinish}
          >
            <Form.Item name="host" label="Connect URL" rules={[{ required: true }]}>
              <Input placeholder="192.168.0.1" />
            </Form.Item>
            <Form.Item name="port" label="Connect Port" rules={[{ required: true }]}>
              <InputNumber placeholder="5432" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="database" label="Database Name" rules={[{ required: true }]}>
              <Input placeholder="postgres" />
            </Form.Item>
            <Form.Item name="user" label="User Name" rules={[{ required: true }]}>
              <Input placeholder="postgres" />
            </Form.Item>
            <Form.Item name="password" label="Password" rules={[{ required: true }]}>
              <Input.Password placeholder="postgres" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={isLoading}>
                Connect
              </Button>
            </Form.Item>
          </Form>
        </Col>
      </Row>
    </Frame>
  );
}

export default ServerConnectFrame;
