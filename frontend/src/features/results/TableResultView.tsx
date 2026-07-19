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
 * Table view of a cypher result — antd Table built from the result's
 * rows/columns (port of the old CypherResultTable). Object cells are
 * JSON-stringified; primitives render raw (the old view JSON.stringified
 * every cell, quoting plain strings).
 */

import { useMemo } from 'react';
import { Table } from 'antd';
import type { AgtypeValue, CypherResult } from '../../types';
import { stringifyCellValue } from './cytoscapeUtils';
import { useAppSelector } from '../../app/hooks';

/**
 * Synthetic row-key column. The old view renamed a literal `key` result
 * column to a random name for the same reason.
 */
const ROW_KEY = '__age_row_key__';

export interface TableResultViewProps {
  result: CypherResult;
  /** Row cap; defaults to `setting.maxDataOfTable` (0 = unlimited). */
  maxRows?: number;
  className?: string;
}

export default function TableResultView({ result, maxRows, className }: TableResultViewProps) {
  const settingMax = useAppSelector((s) => s.setting.maxDataOfTable);
  const limit = maxRows ?? settingMax;

  const columns = useMemo(
    () =>
      result.columns.map((key) => ({
        title: key,
        dataIndex: key,
        key,
        render: (value: AgtypeValue) => stringifyCellValue(value),
      })),
    [result.columns],
  );

  const rows = useMemo(() => {
    const capped = limit === 0 ? result.rows : result.rows.slice(0, limit);
    return capped.map((row, index) => ({ ...row, [ROW_KEY]: index }));
  }, [result.rows, limit]);

  return (
    <div className={className} style={{ overflow: 'auto' }}>
      <Table columns={columns} dataSource={rows} rowKey={ROW_KEY} size="small" />
    </div>
  );
}
