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

import { getQuery } from "../tools/SQLFlavorManager.ts";
import { format } from "node:util";
import GraphRepository from '../models/GraphRepository.ts';
import type { ConnectionInfoBody } from '../models/GraphRepository.ts';

interface MetaRequestBody {
    currentGraph?: string;
}

class DatabaseService {
    private _graphRepository: GraphRepository | null = null;

    async getMetaData(body: MetaRequestBody | null | undefined) {
        let gr = this._graphRepository!;
        await gr.initGraphNames();
        const { graphs } = gr.getConnectionInfo();
        await DatabaseService.analyzeGraph(gr);
        if (body) {
            if (graphs.includes(body.currentGraph as string)) {
                return await this.getMetaDataSingle(body.currentGraph as string, graphs);
            } else {
                return await this.getMetaDataSingle(gr.currentGraph as string, graphs);
            }
        } else if (graphs.length > 0) {
            return await this.graphNameInitialize(graphs);
        } else {
            throw new Error('graph does not exist');
        }
    }

    async getMetaDataSingle(curGraph: string, graphs: string[]) {
        let metadata: Record<string, unknown> = {};
        let data: Record<string, unknown> = {};
        const { database } = this.getConnectionInfo();
        let { nodes, edges } = await this.readMetaData(curGraph);
        data.nodes = nodes;
        data.edges = edges;
        data.propertyKeys = await this.getPropertyKeys();
        data.graph = curGraph;
        data.database = database;
        data.role = await this.getRole();
        graphs.forEach((gname) => {
            if (gname !== curGraph) metadata[gname] = {};
            else metadata[gname] = data;
        })
        return metadata;
    }

    async graphNameInitialize(graphs: string[]) {
        let metadata: Record<string, unknown> = {};
        graphs.forEach((gname) => {
            metadata[gname] = {};
        })
        return metadata;
    }

    static async analyzeGraph(gr: GraphRepository): Promise<void> {
        await gr.execute(getQuery('analyze_graph'));
    }

    async readMetaData(graphName: string) {
        let gr = this._graphRepository!;
        const { version } = gr.getConnectionInfo();
        let queryResult = await gr.execute(format(getQuery('meta_data', String(version).split('.')[0]), graphName));
        return this.parseMeta(queryResult.rows);
    }

    async getPropertyKeys() {
        let graphRepository = this._graphRepository!;
        let queryResult = await graphRepository.execute(getQuery('property_keys'));
        return queryResult.rows;
    }

    async getRole() {
        let graphRepository = this._graphRepository!;
        let queryResult = await graphRepository.execute(getQuery('get_role'), [this.getConnectionInfo().user]);
        return queryResult.rows[0];
    }

    async connectDatabase(connectionInfo: ConnectionInfoBody): Promise<boolean> {
        let graphRepository = this._graphRepository;
        if (graphRepository == null) {
            this._graphRepository = new GraphRepository(connectionInfo);
            graphRepository = this._graphRepository;
        }

        try {
            let client = await graphRepository.connect();
            client.release();
        } catch (e) {
            this._graphRepository = null;
            throw e;
        }
        return true;
    }

    async disconnectDatabase(): Promise<boolean> {
        let graphRepository = this._graphRepository;
        if (graphRepository == null) {
            console.log('Already Disconnected');
            return false;
        } else {
            let isRelease = await graphRepository.releaseConnection();
            if (isRelease) {
                this._graphRepository = null;
                return true;
            } else {
                console.log('Failed releaseConnection()');
                return false;
            }
        }
    }

    async getConnectionStatus(): Promise<boolean> {
        let graphRepository = this._graphRepository;
        if (graphRepository == null) {
            return false;
        }

        try {
            let client = await graphRepository.getConnection();
            client.release();
        } catch (err) {
            return false;
        }
        return true;
    }

    getConnectionInfo() {
        if (this.isConnected() === false)
            throw new Error("Not connected");
        return this._graphRepository!.getConnectionInfo();
    }

    isConnected(): boolean {
        return this._graphRepository != null;
    }

    get graphRepository(): GraphRepository | null {
        return this._graphRepository;
    }

    parseMeta(data: Array<{ name: string; kind: string }>) {
        const meta: { edges: unknown[]; nodes: unknown[] } = {
            edges: [],
            nodes: []
        };
        const vertex_name = '_ag_label_vertex';
        const edge_name = '_ag_label_edge';

        data.forEach((element) => {
            if (element.name === vertex_name || element.name === edge_name) {
                return;
            }

            if (element.kind === 'v') meta.nodes.push(element);
            if (element.kind === 'e') meta.edges.push(element);
        });
        return meta;
    }
}

export default DatabaseService;
