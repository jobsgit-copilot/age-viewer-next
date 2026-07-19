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

import { Button, Col, Row, Space, Typography } from 'antd';
import { useAppDispatch, useAppStore } from '../../app/hooks';
import { trimFrame } from '../frame/frameSlice';
import { useCloseSession } from '../database/useCloseSession';
import Frame from './Frame';

export interface ServerDisconnectFrameProps {
  frameKey: string;
  reqString: string;
  isPinned: boolean;
}

/**
 * The ':server disconnect' frame body.
 *
 * DEVIATION from the old `ServerDisconnectFrame.jsx`: the old frame
 * disconnected in a mount effect and showed a static "Disconnected
 * Succesfully" notice. v2 turns it into the confirmation step the old
 * sidebar "Close Session" Modal.confirm had ('Are you sure...'): Disconnect
 * runs the shared `useCloseSession` orchestration (disconnect mutation →
 * clear connection + reset metadata + trim ServerStatus frames) and trims
 * this frame on success; Cancel just trims it. On a failed disconnect the
 * hook leaves state untouched, so the frame stays open.
 */
function ServerDisconnectFrame({ frameKey, reqString, isPinned }: ServerDisconnectFrameProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const closeSession = useCloseSession();

  const onDisconnect = async () => {
    await closeSession();
    // useCloseSession swallows disconnect failures (state untouched); trim
    // only when the disconnect actually went through.
    if (store.getState().database.status === 'disconnected') {
      dispatch(trimFrame('ServerDisconnect'));
    }
  };

  const onCancel = () => {
    dispatch(trimFrame('ServerDisconnect'));
  };

  return (
    <Frame reqString={reqString} frameKey={frameKey} isPinned={isPinned}>
      <Row>
        <Col span={6}>
          <Typography.Title level={4}>Disconnect from Database</Typography.Title>
          <Typography.Text>Close the current database session.</Typography.Text>
        </Col>
        <Col span={18}>
          <Typography.Paragraph>
            Are you sure you want to disconnect from the database?
          </Typography.Paragraph>
          <Space>
            <Button type="primary" danger onClick={onDisconnect}>
              Disconnect
            </Button>
            <Button onClick={onCancel}>Cancel</Button>
          </Space>
        </Col>
      </Row>
    </Frame>
  );
}

export default ServerDisconnectFrame;
