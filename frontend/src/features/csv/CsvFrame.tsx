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

import { useState } from 'react';
import { Button, Col, Input, Row, Space, Switch, Typography, Upload } from 'antd';
import type { UploadFile } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import {
  formatApiError,
  isApiError,
  useGetMetaDataMutation,
  useInitGraphFromCsvMutation,
} from '../api/apiSlice';
import { addAlert } from '../alert/alertSlice';
import { processMetadataResponse, setMetaData } from '../database/metadataSlice';
import Frame from '../frames/Frame';

export interface CsvFrameProps {
  frameKey: string;
  reqString: string;
  isPinned: boolean;
}

/**
 * The part filename carries the label name (contract §3.7 — the backend
 * reads `file.originalname`, nothing inside the CSV). The label is derived
 * from the upload's file name minus the `.csv` suffix.
 *
 * DEVIATION from the old `GraphInitializer.jsx`: the old modal had a
 * per-file "label name" text input (defaulting to empty, which produced a
 * SQL syntax error server-side when left blank); v2 derives the label from
 * the file name instead.
 */
export function labelFromFileName(fileName: string): string {
  return fileName.replace(/\.csv$/i, '');
}

/**
 * The ':csv' frame body — the graph initializer, ported from the old
 * `components/initializer/presentation/GraphInitializer.jsx` (the old
 * `components/csv/index.jsx`, which POSTed to the never-implemented
 * `/api/v1/feature/uploadCSV`, was dead weight and is NOT ported).
 *
 * Flow: graph name + dropGraph switch + two drag-and-drop upload areas
 * (files stay client-side via `beforeUpload={() => false}`) → submit
 * builds a multipart FormData (`nodes`/`edges` file parts with the label
 * as part filename, plus `graphName`/`dropGraph` text fields) →
 * `initGraphFromCsv`. On success: CreateGraphSuccess alert + metadata
 * refetch mirrored into the metadata slice (same as ServerConnectFrame).
 * On failure: ErrorCypherQuery alert with the normalized
 * `[severity]:(code) message` text (the apiSlice already normalizes
 * /cypher/init's inline `{...pgError, details}` shape, quirk Q2).
 *
 * DEVIATIONS from the old modal:
 * - The old per-file label inputs are gone (see `labelFromFileName`).
 * - Failure surfaces as an alert instead of the modal's inline error box.
 * - The old code also switched the current graph to the new one after
 *   success; v2 only refreshes metadata — graph selection stays with the
 *   sidebar/status frame.
 */
function CsvFrame({ frameKey, reqString, isPinned }: CsvFrameProps) {
  const dispatch = useAppDispatch();
  const currentGraph = useAppSelector((state) => state.metadata.currentGraph);
  const [graphName, setGraphName] = useState('');
  const [dropGraph, setDropGraph] = useState(false);
  const [nodeFiles, setNodeFiles] = useState<UploadFile[]>([]);
  const [edgeFiles, setEdgeFiles] = useState<UploadFile[]>([]);
  const [initGraphFromCsv, { isLoading }] = useInitGraphFromCsvMutation();
  const [getMetaData] = useGetMetaDataMutation();

  // Contract §3.7: `nodes` is one-or-more, `edges` is zero-or-more.
  const canSubmit = graphName.trim() !== '' && nodeFiles.length > 0 && !isLoading;

  const appendFiles = (formData: FormData, field: 'nodes' | 'edges', files: UploadFile[]) => {
    files.forEach((file) => {
      if (file.originFileObj) {
        formData.append(field, file.originFileObj, labelFromFileName(file.name));
      }
    });
  };

  const onSubmit = async () => {
    const formData = new FormData();
    appendFiles(formData, 'nodes', nodeFiles);
    appendFiles(formData, 'edges', edgeFiles);
    formData.append('graphName', graphName.trim());
    // The backend drops only on exactly the string 'true' (§3.7).
    formData.append('dropGraph', String(dropGraph));

    try {
      await initGraphFromCsv(formData).unwrap();
    } catch (error) {
      dispatch(
        addAlert('ErrorCypherQuery', isApiError(error) ? formatApiError(error) : String(error)),
      );
      return;
    }
    dispatch(addAlert('CreateGraphSuccess'));
    try {
      const metadata = await getMetaData({ currentGraph }).unwrap();
      dispatch(setMetaData(processMetadataResponse(metadata)));
    } catch {
      dispatch(addAlert('ErrorMetaFail'));
    }
  };

  return (
    <Frame reqString={reqString} frameKey={frameKey} isPinned={isPinned}>
      <Row>
        <Col span={6}>
          <Typography.Title level={4}>Create a Graph</Typography.Title>
          <Typography.Text>
            Bulk-import a graph from CSV files — one file per node/edge label.
          </Typography.Text>
        </Col>
        <Col span={18}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Input
              aria-label="Graph Name"
              placeholder="graph name"
              value={graphName}
              onChange={(event) => setGraphName(event.target.value)}
            />
            <Space>
              <Switch
                aria-label="DROP graph if exists"
                checked={dropGraph}
                onChange={setDropGraph}
              />
              <Typography.Text>DROP graph if exists</Typography.Text>
            </Space>
            <Row gutter={16}>
              <Col span={12}>
                <Upload.Dragger
                  multiple
                  accept=".csv"
                  fileList={nodeFiles}
                  beforeUpload={() => false}
                  onChange={({ fileList }) => setNodeFiles(fileList)}
                >
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">Upload Nodes</p>
                  <p className="ant-upload-hint">
                    Header: an <code>id</code> column plus one column per vertex property. The
                    file name (minus .csv) becomes the vertex label.
                  </p>
                </Upload.Dragger>
              </Col>
              <Col span={12}>
                <Upload.Dragger
                  multiple
                  accept=".csv"
                  fileList={edgeFiles}
                  beforeUpload={() => false}
                  onChange={({ fileList }) => setEdgeFiles(fileList)}
                >
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">Upload Edges</p>
                  <p className="ant-upload-hint">
                    Header must include{' '}
                    <code>start_id, start_vertex_type, end_id, end_vertex_type</code>; all
                    remaining columns become edge properties. The file name (minus .csv) becomes
                    the edge label.
                  </p>
                </Upload.Dragger>
              </Col>
            </Row>
            <Button type="primary" disabled={!canSubmit} loading={isLoading} onClick={onSubmit}>
              Create Graph
            </Button>
          </Space>
        </Col>
      </Row>
    </Frame>
  );
}

export default CsvFrame;
