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
 * Text view of a cypher result — pre-formatted aligned dump like the old
 * CypherResultText (which used the `ascii-table` package; v2 builds the
 * same shape manually since that package is not installed).
 */

import { useMemo } from 'react';
import type { CypherResult } from '../../types';
import { stringifyCellValue } from './cytoscapeUtils';

export interface TextResultViewProps {
  result: CypherResult;
  className?: string;
}

/** Aligned plain-text table: header, separator, one line per row. */
export function toTextTable(result: CypherResult): string {
  const { columns, rows } = result;
  if (columns.length === 0) return '(no columns)';
  const cells = rows.map((row) => columns.map((col) => stringifyCellValue(row[col])));
  const widths = columns.map((col, i) =>
    Math.max(col.length, ...cells.map((row) => row[i].length)),
  );
  const line = (values: string[]) =>
    values.map((value, i) => value.padEnd(widths[i])).join(' | ').trimEnd();
  const separator = widths.map((w) => '-'.repeat(w)).join('-+-');
  return [line(columns), separator, ...cells.map(line)].join('\n');
}

export default function TextResultView({ result, className }: TextResultViewProps) {
  const text = useMemo(() => toTextTable(result), [result]);
  return (
    <div className={className} style={{ height: '100%', overflow: 'auto' }}>
      <pre style={{ margin: 0, padding: 8, fontSize: 12 }}>{text}</pre>
    </div>
  );
}
