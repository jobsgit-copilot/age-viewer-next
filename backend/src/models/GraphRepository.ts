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
import PgConfig from '../config/Pg.ts'

import pg from 'pg';
import types from 'pg-types';
import {setAGETypes, onConnectQueries} from '../tools/AGEParser.ts';
import { getQuery } from '../tools/SQLFlavorManager.ts';

export interface ConnectionInfoBody {
    host?: string;
    port?: number | string;
    database?: string;
    graph?: string;
    user?: string;
    password?: string;
    graphs?: string[];
    server?: string;
}

class GraphRepository {
    _host?: string;
    _port?: number | string;
    _database?: string;
    _server_version?: string | null;
    _graphs: string[];
    _graph?: string;
    _user?: string;
    _password?: string;
    _pool?: pg.Pool;

    constructor({host, port, database, graph, user, password, graphs = [], server}: ConnectionInfoBody = {}) {
        this._host = host;
        this._port = port;
        this._database = database;
        this._server_version = server;
        this._graphs = graphs;
        this._graph = graph;
        this._user = user;
        this._password = password;
    }

    async connect(): Promise<pg.PoolClient> {
        if (!this._pool) {
            this._pool = GraphRepository.newConnectionPool(this.getPoolConnectionInfo());
        }
        const client = await this._pool.connect();
        if (!this._server_version){
            const {server_version: v} = await onConnectQueries(client);
            this._server_version = v;
        }

        return client;
    }

    static newConnectionPool(poolConnectionConfig: Record<string, unknown> | null): pg.Pool {
        return new pg.Pool(poolConnectionConfig ?? undefined);
    }

    // Execute cypher query with params
    async execute(query: string, params: unknown[] = []): Promise<any> {
        let client = await this.getConnection();
        let result = null;
        try {
            result = await client.query(query, params);
        } catch (err) {
            throw err;
        } finally {
            client.release();
        }
        return result;
    }

    async createTransaction(): Promise<[pg.PoolClient, (query: string, params?: unknown[]) => Promise<[unknown, pg.PoolClient]>]> {
        const client = await this.getConnection();
        return [client, async (query, params = [])=>{
            return [await client.query(query, params), client];
        }]
    }

    async initGraphNames(): Promise<void> {
        const { rows } = await this.execute(getQuery('get_graph_names'));
        this._graphs = rows.map((item: { name: string })=>item.name);
        // set current graph to first name
        this.setCurrentGraph(this._graphs[0]);
    }

    /**
     * Get connectionInfo
     */
    async getConnection(): Promise<pg.PoolClient> {

        const client = await this._pool!.connect();

        try {
            await setAGETypes(client, types);
        } catch (err) {
            // Release the checked-out client, otherwise a failed AGE setup
            // leaks it and pool.end() (disconnect) hangs forever.
            client.release();
            throw err;
        }

        return client;
    }

    /**
     * Release connection
     */
    async releaseConnection(): Promise<boolean> {
        try {
            await this._pool!.end();
            return true;
        } catch (err) {
            throw err;
        }
    }

    /**
     * Get connection pool information
     */
    getPoolConnectionInfo(): Record<string, unknown> | null {
        if (!this._host || !this._port || !this._database) {
            return null;
        }
        return {
            host: this._host,
            port: this._port,
            database: this._database,
            version: this._server_version,
            user: this._user,
            password: this._password,
            max: PgConfig.max,
            idleTimeoutMillis: PgConfig.idleTimeoutMillis,
            connectionTimeoutMillis: PgConfig.connectionTimeoutMillis,
        };
    }

    /**
     * Get connection info.
     *
     * Rewrite deviation (api-contract.md §9.1): unlike the original backend,
     * the DB password is NOT included in the returned object so it never
     * reaches the wire.
     */
    getConnectionInfo() {
        if (!this._host || !this._port || !this._database) {
            throw new Error("Not connected");
        }
        return {
            host: this._host,
            version: this._server_version ?? null,
            port: this._port,
            database: this._database,
            user: this._user,
            graphs: this._graphs,
            graph: this._graph,
        };
    }

    get currentGraph(): string | undefined {
        return this._graph;
    }

    setCurrentGraph(name: string | undefined): void {
        this._graph = name;
    }
}

export default GraphRepository;
