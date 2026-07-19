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

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Popconfirm } from 'antd';
import {
  CloseOutlined,
  CompressOutlined,
  CopyOutlined,
  DownOutlined,
  ExpandOutlined,
  PushpinFilled,
  PushpinOutlined,
  SyncOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { useAppDispatch } from '../../app/hooks';
import { pinFrame, removeFrame } from '../frame/frameSlice';
import { setCommand } from '../editor/editorSlice';
import styles from './Frame.module.css';

export interface FrameProps {
  /** Command the frame was created for; displayed trimmed in the header. */
  reqString: string;
  /** Frame key in the frames slice (the old code called this `refKey`). */
  frameKey: string;
  isPinned: boolean;
  /** When given, a Refresh button shows in the header (old `onRefresh`). */
  onRefresh?: () => void;
  /** Render the body without padding (old `bodyNoPadding`, used by charts). */
  bodyNoPadding?: boolean;
  children: ReactNode;
}

/**
 * Generic frame wrapper, ported from the old `components/frame/Frame.jsx`.
 *
 * Deviations from the old wrapper:
 * - The close confirmation uses antd `Popconfirm` instead of
 *   `window.confirm` (same prompt text), so it stays testable in jsdom.
 * - The pin/unpin toggle is enabled — the old JSX had it commented out even
 *   though FrameSlice always supported it; ordering is handled by the slice.
 * - `removeActiveRequests(refKey)` on close is gone with the old CypherSlice;
 *   RTK Query mutations are not tracked per frame.
 * - The old search/filter/edge-weight header buttons belong to the cypher
 *   result frames and land with that feature.
 */
function Frame({ reqString, frameKey, isPinned, onRefresh, bodyNoPadding, children }: FrameProps) {
  const dispatch = useAppDispatch();
  const [isFullScreen, setFullScreen] = useState(false);
  const [isExpand, setExpand] = useState(true);

  const trimmed = reqString.trim();

  return (
    <div className={`${styles.frame} ${isFullScreen ? styles.fullScreen : ''}`}>
      <div className={styles.frameHeader}>
        <div className={styles.frameHeaderText}>
          {'$ '}
          <strong>{trimmed}</strong>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            title="copy to editor"
            onClick={() => dispatch(setCommand(trimmed))}
          />
        </div>
        <div>
          <Button
            type="text"
            size="small"
            icon={isPinned ? <PushpinFilled /> : <PushpinOutlined />}
            title={isPinned ? 'Unpin' : 'Pin'}
            onClick={() => dispatch(pinFrame(frameKey))}
          />
          <Button
            type="text"
            size="small"
            icon={isFullScreen ? <CompressOutlined /> : <ExpandOutlined />}
            title="Expand"
            onClick={() => setFullScreen(!isFullScreen)}
          />
          {onRefresh ? (
            <Button
              type="text"
              size="small"
              icon={<SyncOutlined />}
              title="Refresh"
              onClick={() => onRefresh()}
            />
          ) : null}
          <Button
            type="text"
            size="small"
            icon={isExpand ? <UpOutlined /> : <DownOutlined />}
            title={isExpand ? 'Hide' : 'Show'}
            onClick={() => setExpand(!isExpand)}
          />
          <Popconfirm
            title="Are you sure you want to close this window?"
            onConfirm={() => dispatch(removeFrame(frameKey))}
          >
            <Button type="text" size="small" icon={<CloseOutlined />} title="Close Window" />
          </Popconfirm>
        </div>
      </div>
      <div
        className={`${styles.frameBody} ${isExpand ? '' : styles.contract} ${
          bodyNoPadding ? styles.noPadding : ''
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export default Frame;
