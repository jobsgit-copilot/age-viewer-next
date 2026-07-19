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

import { useMemo, useState } from 'react';
import { Button, Drawer, Select, Space, Tooltip } from 'antd';
import { BuildOutlined } from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { useGetKeywordsQuery } from '../api/apiSlice';
import { KeywordFinder, suggestNextKeywords } from '../editor/cypherLanguage';
import { setCommand } from '../editor/editorSlice';
import CodeMirrorEditor from '../editor/CodeMirrorEditor';
import barStyles from '../editor/EditorBar.module.css';

/**
 * Port of the old `components/query_builder/BuilderContainer`: a left drawer
 * that assembles a cypher query by clicking keyword buttons, then hands the
 * wrapped `SELECT * FROM cypher(...)` command to the main editor. The keyword
 * graph is the same KeywordFinder matrix the editor autocomplete uses.
 */
function QueryBuilderDrawer() {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [graph, setGraph] = useState<string>();
  const graphs = useAppSelector((state) => state.metadata.graphs);
  // Shares the cache entry App.tsx warms on mount — no extra request.
  const keywords = useGetKeywordsQuery(undefined);

  const finder = useMemo(
    () => (keywords.data ? KeywordFinder.fromMatrix(keywords.data) : null),
    [keywords.data],
  );
  const suggestions = finder ? suggestNextKeywords(finder, query) : [];

  const appendKeyword = (word: string) => {
    setQuery((prev) => (prev === '' ? word : `${prev.trim()}\n${word}`));
  };

  const canSubmit = graph !== undefined && query.trim() !== '';
  const submit = () => {
    if (!canSubmit) return;
    dispatch(setCommand(`SELECT * FROM cypher('${graph}', $$ ${query} $$) as (V agtype)`));
    setOpen(false);
  };

  return (
    <>
      <Tooltip title="Query Generator">
        <Button
          type="text"
          className={barStyles.barButton}
          icon={<BuildOutlined />}
          onClick={() => setOpen(true)}
          aria-label="Query Generator"
        />
      </Tooltip>
      <Drawer title="Query Generator" placement="left" open={open} onClose={() => setOpen(false)}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Select
            placeholder="Select Graph"
            aria-label="Select Graph"
            value={graph}
            onChange={setGraph}
            options={Object.keys(graphs).map((name) => ({ value: name, label: name }))}
            style={{ width: '100%' }}
          />
          <CodeMirrorEditor
            value={query}
            onChange={setQuery}
            onRun={submit}
            commandHistory={[]}
            keywordMatrix={keywords.data}
          />
          <Space wrap>
            {suggestions.map((word) => (
              <Button key={word} size="small" onClick={() => appendKeyword(word)}>
                {word}
              </Button>
            ))}
          </Space>
          <Button type="primary" onClick={submit} disabled={!canSubmit}>
            Submit
          </Button>
        </Space>
      </Drawer>
    </>
  );
}

export default QueryBuilderDrawer;
