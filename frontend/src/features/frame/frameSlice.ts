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

import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { uid } from '../../app/id';

export interface FrameProps {
  /** Trimmed query/command string the frame was created for. */
  reqString: string;
  /** Unique frame key (client-generated unless supplied). */
  key: string;
  /** Target of a `:play <target>` command frame. */
  playTarget?: string;
}

export interface Frame {
  frameName: string;
  frameProps: FrameProps;
  isPinned: boolean;
  /** Original index captured on pin, used to restore position on unpin. */
  orgIndex?: number;
}

export type FramesState = Frame[];

const initialState: FramesState = [];

const frameSlice = createSlice({
  name: 'frames',
  initialState,
  reducers: {
    addFrame: {
      reducer: (
        state,
        action: PayloadAction<{ reqString: string; frameName: string; refKey?: string }>,
      ) => {
        const reqString = action.payload.reqString.trim();
        const firstNotPinnedIndex = state.findIndex((frame) => frame.isPinned === false);
        const { frameName } = action.payload;

        const frameProps: FrameProps = {
          reqString,
          key: action.payload.refKey ? action.payload.refKey : uid(),
        };

        if (reqString.startsWith(':play')) {
          frameProps.playTarget = reqString.split(/\s+/).pop();
        }

        // New frames go ahead of the first unpinned frame; pinned frames
        // stay on top. (When every frame is pinned findIndex yields -1 and
        // splice inserts before the last element — old behavior kept.)
        state.splice(firstNotPinnedIndex, 0, { frameName, frameProps, isPinned: false });
        state.forEach((frame) => {
          if (frame.orgIndex) {
            frame.orgIndex += 1;
          }
        });
      },
      prepare: (reqString: string, frameName: string, refKey?: string) => ({
        payload: { reqString, frameName, refKey },
      }),
    },
    removeFrame: {
      reducer: (state, action: PayloadAction<{ refKey: string }>) =>
        state.filter((frame) => frame.frameProps.key !== action.payload.refKey),
      prepare: (refKey: string) => ({ payload: { refKey } }),
    },
    pinFrame: {
      reducer: (state, action: PayloadAction<{ refKey: string }>) => {
        const frameKey = action.payload.refKey;
        const frameIndex = state.findIndex((frame) => frame.frameProps.key === frameKey);
        if (frameIndex === -1) return;
        if (!state[frameIndex].isPinned) {
          state[frameIndex].isPinned = true;
          state[frameIndex].orgIndex = frameIndex;
          state.splice(0, 0, state.splice(frameIndex, 1)[0]);
        } else {
          state[frameIndex].isPinned = false;
          const indexMoveTo = state[frameIndex].orgIndex ?? frameIndex;
          state.splice(indexMoveTo, 0, state.splice(frameIndex, 1)[0]);
        }
      },
      prepare: (refKey: string) => ({ payload: { refKey } }),
    },
    trimFrame: {
      reducer: (state, action: PayloadAction<{ frameName: string }>) =>
        state.filter((frame) => frame.frameName !== action.payload.frameName),
      prepare: (frameName: string) => ({ payload: { frameName } }),
    },
  },
});

export const { addFrame, removeFrame, pinFrame, trimFrame } = frameSlice.actions;

export default frameSlice.reducer;
