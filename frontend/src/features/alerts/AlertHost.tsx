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
import { Alert, Button } from 'antd';
import type { AlertProps as AntdAlertProps } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { removeAlert } from '../alert/alertSlice';
import type { NamedAlert } from '../alert/alertSlice';
import { setCommand } from '../editor/editorSlice';

interface AlertContent {
  type: AntdAlertProps['type'];
  message: string;
  description: ReactNode;
}

/** Inline ":command" button that copies a command into the editor. */
function CommandLink({ command }: { command: string }) {
  const dispatch = useAppDispatch();
  return (
    <Button
      type="link"
      size="small"
      icon={<PlayCircleOutlined />}
      onClick={() => dispatch(setCommand(command))}
      style={{ padding: 0 }}
    >
      {command}
    </Button>
  );
}

/**
 * The named-alert mapping ported from the old
 * `components/alert/presentations/Alert.jsx` — alert names are unchanged.
 */
function alertContent(alertName: string, errorMessage: string): AlertContent | null {
  switch (alertName) {
    case 'NoticeServerDisconnected':
      return {
        type: 'warning',
        message: 'Database Disconnected',
        description: (
          <p>
            Database is Disconnected. You may use
            <CommandLink command=":server connect" /> to establish connection. There&apos;s a
            graph waiting for you.
          </p>
        ),
      };
    case 'NoticeServerConnected':
      return {
        type: 'success',
        message: 'Database Connected',
        description: (
          <p>
            Successfully database is connected. You may use
            <CommandLink command=":server status" /> to confirm connected database information.
          </p>
        ),
      };
    case 'ErrorServerConnectFail':
      return {
        type: 'error',
        message: 'Database Connection Failed',
        description: (
          <>
            <p>
              Failed to connect to the database. Are you sure the database is running on the
              server?
            </p>
            {errorMessage}
          </>
        ),
      };
    case 'ErrorNoDatabaseConnected':
      return {
        type: 'error',
        message: 'No Database Connected',
        description: (
          <>
            <p>
              You haven&apos;t set database connection. You may use
              <CommandLink command=":server connect" /> to establish connection. There&apos;s a
              graph waiting for you.
            </p>
            {errorMessage}
          </>
        ),
      };
    case 'ErrorMetaFail':
      return {
        type: 'error',
        message: 'Metadata Load Error',
        description: <p>Unexpectedly error occurred while getting metadata.</p>,
      };
    case 'ErrorCypherQuery':
      return {
        type: 'error',
        message: 'Query Error',
        description: <p>Your query was not executed properly. Refer the below error message.</p>,
      };
    case 'ErrorPlayLoadFail':
      return {
        type: 'error',
        message: 'Failed to Load Play Target',
        description: <p>&apos;{errorMessage}&apos; does not exists.</p>,
      };
    case 'NoticeAlreadyConnected':
      return {
        type: 'info',
        message: 'Already Connected to Database',
        description: (
          <p>
            You are currently connected to a database. If you want to access to another
            database, you may execute
            <CommandLink command=":server disconnect" /> to disconnect from current database
            first.
          </p>
        ),
      };
    case 'CreateGraphSuccess':
      return {
        type: 'success',
        message: 'Graph Created',
        description: 'Successfully created new graph',
      };
    default:
      return null;
  }
}

function SingleAlert({ alert }: { alert: NamedAlert }) {
  const dispatch = useAppDispatch();
  const { key, errorMessage } = alert.alertProps;

  // Old behavior: alerts auto-dismiss after 10 seconds.
  useEffect(() => {
    const timer = setTimeout(() => {
      dispatch(removeAlert(key));
    }, 10000);
    return () => clearTimeout(timer);
  }, [dispatch, key]);

  const content = alertContent(alert.alertName, errorMessage);
  if (!content) {
    return null;
  }
  return (
    <Alert
      type={content.type}
      showIcon
      closable
      message={content.message}
      description={content.description}
      onClose={() => dispatch(removeAlert(key))}
    />
  );
}

/**
 * Renders the alert stack from the alertSlice (the old app stacked antd
 * Alert components inside the editor area; v2 hosts them as a fixed stack
 * in the top-right corner). Mount once near the app root.
 */
function AlertHost() {
  const alerts = useAppSelector((state) => state.alerts);
  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: 420,
        maxWidth: '90vw',
      }}
    >
      {alerts.map((alert) => (
        <SingleAlert key={alert.alertProps.key} alert={alert} />
      ))}
    </div>
  );
}

export default AlertHost;
