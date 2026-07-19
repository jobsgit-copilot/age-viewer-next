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

import { useCallback } from 'react';
import { Button, Dropdown, Tooltip } from 'antd';
import {
  CloseCircleOutlined,
  DownOutlined,
  HistoryOutlined,
  PlayCircleOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons';
import { useAppDispatch, useAppSelector, useAppStore } from '../../app/hooks';
import { uid } from '../../app/id';
import { defaultSetting } from '../../conf/config';
import {
  formatApiError,
  isApiError,
  useExecuteCypherMutation,
  useGetKeywordsQuery,
  useGetMetaDataMutation,
} from '../api/apiSlice';
import {
  addCommandFavorites,
  addCommandHistory,
  removeCommandFavorites,
  setCommand,
} from './editorSlice';
import { addFrame, trimFrame } from '../frame/frameSlice';
import { setFulfilled, setPending, setRejected } from '../results/resultsSlice';
import { addAlert } from '../alert/alertSlice';
import { processMetadataResponse, setMetaData } from '../database/metadataSlice';
import { setLabel } from '../layout/layoutSlice';
import { buildRunPlan } from './editorHelpers';
import CodeMirrorEditor from './CodeMirrorEditor';
import QueryBuilderDrawer from '../builder/QueryBuilderDrawer';
import styles from './EditorBar.module.css';

/**
 * Top bar: cypher editor + toolbar. Port of the old
 * `components/contents/presentations/Editor.jsx` — run orchestration,
 * favorites, history and the label toggle, rebuilt with antd 5.
 *
 * Deliberately NOT ported: the sidebar menu toggle button (belongs to the
 * layout/sidebar feature) and the alert list rendering (alert display is a
 * separate feature; this component only dispatches alerts).
 */
function EditorBar() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const command = useAppSelector((state) => state.editor.command);
  const updateClause = useAppSelector((state) => state.editor.updateClause);
  const commandHistory = useAppSelector((state) => state.editor.commandHistory);
  const commandFavorites = useAppSelector((state) => state.editor.commandFavorites);
  const isLabel = useAppSelector((state) => state.layout.isLabel);

  const [executeCypher] = useExecuteCypherMutation();
  const [getMetaData] = useGetMetaDataMutation();
  // Subscribes to the same cache entry App.tsx already warms; the matrix
  // feeds the editor autocomplete.
  const keywords = useGetKeywordsQuery(undefined);

  const runCommand = useCallback(() => {
    const currentCommand = store.getState().editor.command;
    // DEVIATION: the old onClick ran even an empty command (creating an
    // empty frame and firing an empty query); an empty run now no-ops.
    if (currentCommand.trim() === '') return;

    const plan = buildRunPlan(currentCommand, store.getState().database.status, {
      closeWhenDisconnect: defaultSetting.closeWhenDisconnect,
      connectionStatusSkip: defaultSetting.connectionStatusSkip,
    });

    const refKey = uid();
    plan.trim.forEach((frameName) => dispatch(trimFrame(frameName)));
    plan.alerts.forEach((alertName) => dispatch(addAlert(alertName)));
    if (plan.frame) {
      dispatch(addFrame(plan.frame.reqString, plan.frame.frameName, refKey));
    }

    if (plan.executeCypher) {
      // The frame renders from the results slice (FrameArea's
      // CypherResultFrame branch): pending → spinner, fulfilled →
      // ResultFrame, rejected → error body.
      dispatch(setPending(refKey));
      executeCypher({ cmd: currentCommand })
        .unwrap()
        .then((result) => {
          dispatch(setFulfilled({ frameKey: refKey, result }));
          // CREATE/REMOVE/DELETE mutate the graph → refresh metadata
          // (old: `if (update) dispatch(getMetaData())`); the response is
          // mirrored into the metadata slice like everywhere else.
          if (updateClause) {
            getMetaData()
              .unwrap()
              .then((metadata) => dispatch(setMetaData(processMetadataResponse(metadata))))
              .catch(() => dispatch(addAlert('ErrorMetaFail')));
          }
        })
        .catch((error: unknown) => {
          dispatch(
            setRejected({
              frameKey: refKey,
              error: isApiError(error)
                ? error
                : { severity: '', message: String(error), code: '' },
            }),
          );
          const message = isApiError(error) ? formatApiError(error) : String(error);
          dispatch(addAlert('ErrorCypherQuery', message));
          // Old behavior: restore the failed command into an empty editor.
          if (store.getState().editor.command === '') {
            dispatch(setCommand(currentCommand));
          }
        });
    }

    dispatch(addCommandHistory(currentCommand));
    // Old behavior: run-and-clear.
    dispatch(setCommand(''));
  }, [dispatch, executeCypher, getMetaData, store, updateClause]);

  const isFavorite = command !== '' && commandFavorites.includes(command);
  const toggleFavorite = () => {
    if (command.trim() === '') return;
    if (isFavorite) {
      dispatch(removeCommandFavorites(command));
    } else {
      dispatch(addCommandFavorites(command));
    }
  };

  const historyItems = [...commandHistory].reverse().map((entry, index) => ({
    key: String(index),
    label: entry,
  }));
  const favoriteItems = commandFavorites.map((entry, index) => ({
    key: String(index),
    label: entry,
  }));
  const pickHistory = ({ key }: { key: string }) => {
    dispatch(setCommand([...commandHistory].reverse()[Number(key)]));
  };
  const pickFavorite = ({ key }: { key: string }) => {
    dispatch(setCommand(commandFavorites[Number(key)]));
  };

  return (
    <div className={styles.bar}>
      <div className={styles.editorCell}>
        <CodeMirrorEditor
          value={command}
          onChange={(next) => dispatch(setCommand(next))}
          onRun={runCommand}
          commandHistory={commandHistory}
          keywordMatrix={keywords.data}
        />
      </div>
      <div className={styles.toolbar}>
        <QueryBuilderDrawer />
        {command !== '' && (
          <Tooltip title="Clear command">
            <Button
              type="text"
              className={styles.barButton}
              icon={<CloseCircleOutlined />}
              // DEVIATION: the old eraser only cleared on double-click.
              onClick={() => dispatch(setCommand(''))}
              aria-label="Clear Command"
            />
          </Tooltip>
        )}
        <Tooltip title="Run Query">
          <Button
            type="text"
            className={styles.barButton}
            icon={<PlayCircleOutlined />}
            onClick={runCommand}
            aria-label="Run Query"
          />
        </Tooltip>
        <Tooltip title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
          <Button
            type="text"
            className={styles.barButton}
            icon={isFavorite ? <StarFilled /> : <StarOutlined />}
            onClick={toggleFavorite}
            disabled={command.trim() === ''}
            aria-label="Toggle favorite"
          />
        </Tooltip>
        <Dropdown
          menu={{ items: favoriteItems, onClick: pickFavorite }}
          trigger={['click']}
          disabled={commandFavorites.length === 0}
        >
          <Button
            type="text"
            className={styles.barButton}
            icon={<DownOutlined />}
            aria-label="Favorites"
            disabled={commandFavorites.length === 0}
          />
        </Dropdown>
        <Dropdown
          menu={{ items: historyItems, onClick: pickHistory }}
          trigger={['click']}
          disabled={commandHistory.length === 0}
        >
          <Button
            type="text"
            className={styles.barButton}
            icon={<HistoryOutlined />}
            aria-label="History"
            disabled={commandHistory.length === 0}
          />
        </Dropdown>
        <Button
          type={isLabel ? 'primary' : 'default'}
          size="small"
          onClick={() => dispatch(setLabel())}
          aria-pressed={isLabel}
        >
          Labels
        </Button>
      </div>
    </div>
  );
}

export default EditorBar;
