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

/**
 * Top-level result frame: given a query string and its (successful)
 * cypher result, render the Graph / Table / Text / Meta view switch
 * (old CypherResultTab behavior, as an antd Segmented) plus the frame
 * download menu (CSV / JSON; PNG lives in the graph view's footer).
 *
 * Defaults to the Graph view when the rows contain graph elements;
 * utility/DDL results (`commandMessage`) render as a plain status line,
 * exactly like the old table view did.
 */

import { useMemo, useState } from 'react';
import { Button, Dropdown, Segmented } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { CypherResult } from '../../types';
import GraphResultView from './GraphResultView';
import TableResultView from './TableResultView';
import TextResultView from './TextResultView';
import MetaResultView from './MetaResultView';
import { commandMessage, rowsContainGraphElements } from './cytoscapeUtils';
import { downloadResultCsv, downloadResultJson } from './exportUtils';
import styles from './ResultFrame.module.css';

export interface ResultFrameProps {
  /** The query/command string this result belongs to. */
  reqString: string;
  /** Successful result of an `executeCypher` mutation. */
  result: CypherResult;
  className?: string;
}

type ViewKey = 'graph' | 'table' | 'text' | 'meta';

export default function ResultFrame({ reqString, result, className }: ResultFrameProps) {
  const hasGraph = useMemo(() => rowsContainGraphElements(result.rows), [result.rows]);
  const statusMessage = useMemo(() => commandMessage(result), [result]);
  const [view, setView] = useState<ViewKey>(hasGraph ? 'graph' : 'table');

  if (statusMessage !== null) {
    return (
      <div className={`${styles.root} ${className ?? ''}`}>
        <div className={styles.statusMessage}>{statusMessage}</div>
      </div>
    );
  }

  return (
    <div className={`${styles.root} ${className ?? ''}`}>
      <div className={styles.header}>
        <Segmented
          value={view}
          onChange={(value) => setView(value as ViewKey)}
          options={[
            { value: 'graph', label: 'Graph', disabled: !hasGraph },
            { value: 'table', label: 'Table' },
            { value: 'text', label: 'Text' },
            { value: 'meta', label: 'Meta' },
          ]}
        />
        <Dropdown
          menu={{
            items: [
              { key: 'csv', label: 'Download CSV' },
              { key: 'json', label: 'Download JSON' },
            ],
            onClick: ({ key }) => {
              if (key === 'csv') downloadResultCsv(result, reqString);
              else if (key === 'json') downloadResultJson(result, reqString);
            },
          }}
        >
          <Button size="small" icon={<DownloadOutlined />}>
            Export
          </Button>
        </Dropdown>
      </div>
      <div className={styles.body}>
        {view === 'graph' && hasGraph && (
          <GraphResultView result={result} exportName={reqString.replace(/ /g, '_')} />
        )}
        {view === 'table' && <TableResultView result={result} className={styles.fill} />}
        {view === 'text' && <TextResultView result={result} className={styles.fill} />}
        {view === 'meta' && (
          <MetaResultView reqString={reqString} result={result} className={styles.fill} />
        )}
      </div>
    </div>
  );
}
