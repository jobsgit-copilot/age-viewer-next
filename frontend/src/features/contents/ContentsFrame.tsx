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

import { Result } from 'antd';
import Frame from '../frames/Frame';

export interface ContentsFrameProps {
  frameKey: string;
  reqString: string;
  isPinned: boolean;
  /** Target of the ':play <target>' command (frameSlice parses it into frameProps). */
  playTarget?: string;
}

/**
 * The ':play <target>' frame body — a documented placeholder.
 *
 * The old `components/frame/presentations/ContentsFrame.jsx` was dead
 * weight: its slide list was hard-coded empty (no play targets — no
 * northwind or any other tutorial content — ever shipped in the old repo),
 * and its mount effect unconditionally dispatched
 * `addAlert('ErrorPlayLoadFail', playTarget)` + `removeFrame(refKey)`, so
 * the frame always errored out and removed itself. There are no demo
 * queries to port and no 'load sample queries' action to offer.
 *
 * v2 renders this placeholder instead of replicating the alert-and-vanish
 * behavior; the play target (from frameProps, falling back to parsing the
 * reqString exactly like frameSlice does) is shown so the user can tell
 * what was asked for.
 */
function ContentsFrame({ frameKey, reqString, isPinned, playTarget }: ContentsFrameProps) {
  const target = playTarget ?? reqString.trim().split(/\s+/).pop() ?? '';

  return (
    <Frame reqString={reqString} frameKey={frameKey} isPinned={isPinned}>
      <Result
        status="info"
        title={`:play ${target}`}
        subTitle={`No playground content is available for '${target}'. Interactive tutorials never shipped with AGE Viewer, so this frame is a placeholder.`}
      />
    </Frame>
  );
}

export default ContentsFrame;
