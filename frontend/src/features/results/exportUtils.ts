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
 * CSV/JSON export of a cypher result (old frame download menu used
 * `json2csv`; v2 uses papaparse's `unparse` + file-saver).
 *
 * Deviation: the old graph frame exported the *cytoscape* element jsons
 * ({label, gid, source, target, properties}); v2 exports the raw result
 * rows instead, which works uniformly for graph and non-graph queries
 * and loses no data.
 */

import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import type { CypherResult } from '../../types';
import { stringifyCellValue } from './cytoscapeUtils';

/** Filename base: old app used the query text with underscores. */
export function exportFileBase(reqString: string): string {
  const base = reqString.replace(/ /g, '_').slice(0, 80);
  return base.length > 0 ? base : 'result';
}

/** CSV text (UTF-8 BOM prefixed, like the old app) for the raw rows. */
export function resultToCsv(result: CypherResult): string {
  const data = result.rows.map((row) =>
    result.columns.map((col) => stringifyCellValue(row[col])),
  );
  return `\uFEFF${Papa.unparse({ fields: result.columns, data })}`;
}

export function downloadResultCsv(result: CypherResult, reqString: string): void {
  saveAs(
    new Blob([resultToCsv(result)], { type: 'text/csv;charset=utf-8' }),
    `${exportFileBase(reqString)}.csv`,
  );
}

export function downloadResultJson(result: CypherResult, reqString: string): void {
  saveAs(
    new Blob([JSON.stringify(result.rows, null, 2)], {
      type: 'application/json;charset=utf-8',
    }),
    `${exportFileBase(reqString)}.json`,
  );
}
