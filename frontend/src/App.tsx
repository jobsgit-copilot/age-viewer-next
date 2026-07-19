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
import { ConfigProvider, Layout, Typography, theme as antdTheme } from 'antd';
import { useAppDispatch, useAppSelector } from './app/hooks';
import { useGetConnectionStatusQuery, useGetKeywordsQuery } from './features/api/apiSlice';
import { clearConnection, setConnectionInfo } from './features/database/databaseSlice';
import EditorBar from './features/editor/EditorBar';
import Sidebar from './features/sidebar/Sidebar';
import FrameArea from './features/frames/FrameArea';
import AlertHost from './features/alerts/AlertHost';

/**
 * Key colors lifted from the old frontend's `src/static/style.css`:
 * - `#142B80` — dark-navy editor/top bar background
 * - `#2756FF` — primary accent blue
 * - `#222430` — dark-mode background (`--dark-bg`)
 * - `#343a40` — left sidebar/navbar
 */
const colors = {
  topBar: '#142B80',
  primary: '#2756FF',
  darkBg: '#222430',
  sidebar: '#343a40',
} as const;

const { Header, Sider, Content } = Layout;

/**
 * Single-page layout (no router, like the old app): dark navy header with
 * the cypher EditorBar, collapsible dark Sider hosting the menu/sidebar,
 * Content hosting the frame area, and the alert stack mounted once.
 */
function App() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((state) => state.setting.theme);
  const dbStatus = useAppSelector((state) => state.database.status);

  // Hot-path on mount (mirrors the old DefaultTemplate): fetch the cypher
  // keyword matrix and the current connection status. The keyword matrix is
  // cached in RTK Query for the editor autocomplete.
  useGetKeywordsQuery(undefined);
  const connectionStatus = useGetConnectionStatusQuery(undefined);

  // Mirror the async connection status into the `database` UI slice.
  // FrameArea's auto-open effect reacts to the status; the Sidebar effect
  // picks up metadata once the status reports 'connected'.
  useEffect(() => {
    if (connectionStatus.isSuccess) {
      dispatch(setConnectionInfo(connectionStatus.data));
    } else if (connectionStatus.isError) {
      dispatch(clearConnection());
    }
  }, [connectionStatus.isSuccess, connectionStatus.isError, connectionStatus.data, dispatch]);

  return (
    <ConfigProvider
      theme={{
        algorithm: theme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: colors.primary,
          colorInfo: colors.primary,
          ...(theme === 'dark' ? { colorBgBase: colors.darkBg } : {}),
        },
      }}
    >
      <Layout style={{ height: '100vh' }}>
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            background: colors.topBar,
            paddingInline: 16,
            paddingBlock: 8,
            height: 'auto',
            lineHeight: 'normal',
          }}
        >
          <Typography.Title level={4} style={{ color: '#fff', margin: 0, whiteSpace: 'nowrap' }}>
            AGEViewer
          </Typography.Title>
          <div style={{ flex: 1, minWidth: 0 }}>
            <EditorBar />
          </div>
          <Typography.Text style={{ color: 'rgba(255,255,255,0.65)', whiteSpace: 'nowrap' }}>
            {dbStatus}
          </Typography.Text>
        </Header>
        <Layout>
          <Sider
            collapsible
            // antd stuffs `width` into maxWidth/minWidth/width; "auto" is
            // invalid for max-width, so after collapse the 0px inline value
            // stuck and the sider could never re-expand. Keep it numeric.
            width={320}
            collapsedWidth={0}
            theme="dark"
            style={{ background: colors.sidebar }}
          >
            <Sidebar />
          </Sider>
          <Content style={{ padding: 16, overflow: 'auto' }}>
            <FrameArea />
          </Content>
        </Layout>
      </Layout>
      <AlertHost />
    </ConfigProvider>
  );
}

export default App;
