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
import { Alert, Spin, Typography } from 'antd';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { addFrame, trimFrame } from '../frame/frameSlice';
import type { Frame as FrameEntry } from '../frame/frameSlice';
import { formatApiError } from '../api/apiSlice';
import { ResultFrame } from '../results';
import ServerDisconnectFrame from './ServerDisconnectFrame';
import CsvFrame from '../csv/CsvFrame';
import ContentsFrame from '../contents/ContentsFrame';
import Frame from './Frame';
import ServerConnectFrame from './ServerConnectFrame';
import ServerStatusFrame from './ServerStatusFrame';

/**
 * Cypher result frame: the Frame wrapper around the results workstream's
 * ResultFrame, fed from the results slice by frame key (written by
 * EditorBar's run orchestration). Pending → centered spinner; rejected →
 * the formatted ApiError (the ErrorCypherQuery alert also fired at run
 * time); fulfilled → the Graph/Table/Text/Meta result view.
 */
function CypherResultFrameBody({
  frameKey,
  reqString,
  isPinned,
}: {
  frameKey: string;
  reqString: string;
  isPinned: boolean;
}) {
  const entry = useAppSelector((state) => state.results[frameKey]);

  let body;
  if (!entry || entry.status === 'pending') {
    body = (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin />
      </div>
    );
  } else if (entry.status === 'rejected') {
    body = (
      <Alert
        type="error"
        showIcon
        message="Query Error"
        description={formatApiError(entry.error)}
      />
    );
  } else {
    body = <ResultFrame reqString={reqString} result={entry.result} />;
  }

  return (
    <Frame reqString={reqString} frameKey={frameKey} isPinned={isPinned} bodyNoPadding>
      {body}
    </Frame>
  );
}

/** frameName → component dispatch, completing the old Frames.jsx ladder. */
function renderFrame(frame: FrameEntry) {
  const { key, reqString, playTarget } = frame.frameProps;
  switch (frame.frameName) {
    case 'ServerConnect':
      return (
        <ServerConnectFrame key={key} frameKey={key} reqString={reqString} isPinned={frame.isPinned} />
      );
    case 'ServerStatus':
      return (
        <ServerStatusFrame key={key} frameKey={key} reqString={reqString} isPinned={frame.isPinned} />
      );
    case 'ServerDisconnect':
      return (
        <ServerDisconnectFrame key={key} frameKey={key} reqString={reqString} isPinned={frame.isPinned} />
      );
    case 'CSV':
      return <CsvFrame key={key} frameKey={key} reqString={reqString} isPinned={frame.isPinned} />;
    case 'Contents':
      return (
        <ContentsFrame
          key={key}
          frameKey={key}
          reqString={reqString}
          isPinned={frame.isPinned}
          playTarget={playTarget}
        />
      );
    case 'CypherResultFrame':
      return (
        <CypherResultFrameBody key={key} frameKey={key} reqString={reqString} isPinned={frame.isPinned} />
      );
    default:
      // Defensive: every frameName EditorBar can produce is handled above.
      return (
        <Frame key={key} frameKey={key} reqString={reqString} isPinned={frame.isPinned}>
          <Typography.Text type="secondary">
            {`Unknown frame "${frame.frameName}".`}
          </Typography.Text>
        </Frame>
      );
  }
}

/**
 * The frame list, ported from the old `components/contents/presentations/
 * Frames.jsx`. Renders every frame in the frames slice, dispatching on
 * frameName.
 *
 * Auto-open behavior: when the database status flips to 'disconnected' and
 * no ServerConnect frame is open, open one; when 'connected', trim
 * ServerConnect frames. (The old `connectionStatusSkip`-gated auto-open of
 * ServerStatus on page load and the `closeWhenDisconnect` window.close path
 * were not ported — those config flags are not part of the v2 setting slice.)
 */
function FrameArea() {
  const dispatch = useAppDispatch();
  const frames = useAppSelector((state) => state.frames);
  const status = useAppSelector((state) => state.database.status);
  const maxNumOfFrames = useAppSelector((state) => state.setting.maxNumOfFrames);

  useEffect(() => {
    if (status === 'disconnected') {
      if (!frames.some((frame) => frame.frameName === 'ServerConnect')) {
        dispatch(addFrame(':server connect', 'ServerConnect'));
      }
    } else if (status === 'connected') {
      if (frames.some((frame) => frame.frameName === 'ServerConnect')) {
        dispatch(trimFrame('ServerConnect'));
      }
    }
  }, [status, frames, dispatch]);

  return (
    <div className="frame-area">
      {frames.map((frame, index) => {
        // Old quirk kept 1:1: `index > maxNumOfFrames` renders maxNumOfFrames+1
        // frames; 0 means unlimited.
        if (maxNumOfFrames !== 0 && index > maxNumOfFrames) {
          return null;
        }
        return renderFrame(frame);
      })}
    </div>
  );
}

export default FrameArea;
