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
 * Meta view of a cypher result. The old app had two things here:
 * `CypherResultMeta` (query + host info + raw JSON) and the
 * `MetadataCytoscapeChart` (label-count graph from the broken
 * `/db/metaChart` endpoint, contract §3.5). v2 deliberately keeps the
 * simple one: an antd Descriptions summary (connection, query, row
 * counts) plus the raw JSON dump — no cytoscape chart.
 */

import { Descriptions } from 'antd';
import type { CypherResult } from '../../types';
import { useAppSelector } from '../../app/hooks';

export interface MetaResultViewProps {
  reqString: string;
  result: CypherResult;
  className?: string;
}

export default function MetaResultView({ reqString, result, className }: MetaResultViewProps) {
  const database = useAppSelector((s) => s.database);
  return (
    <div className={className} style={{ overflow: 'auto', padding: 8 }}>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="Database URI">
          {database.host}:{database.port}
        </Descriptions.Item>
        <Descriptions.Item label="Database">{database.database}</Descriptions.Item>
        <Descriptions.Item label="Graph">{database.graph ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="Executed Query">{reqString}</Descriptions.Item>
        <Descriptions.Item label="Command">{result.command}</Descriptions.Item>
        <Descriptions.Item label="Row Count">{result.rowCount ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="Data">
          <pre style={{ margin: 0, maxHeight: 320, overflow: 'auto' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </Descriptions.Item>
      </Descriptions>
    </div>
  );
}
