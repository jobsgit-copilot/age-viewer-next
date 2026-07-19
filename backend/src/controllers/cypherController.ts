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

import CypherService from "../services/cypherService.ts";
import sessionService from "../services/sessionService.ts";
import GraphCreator from "../models/GraphCreator.ts";
import GraphRepository from "../models/GraphRepository.ts";
import type { NextFunction, Request, Response } from 'express';

/**
 * v2-only helpers (api-contract.md §10): the parameterized endpoints below
 * exist so the new frontend never interpolates raw user input into SQL.
 * The graph name must exist in ag_catalog.ag_graph and is escaped as a SQL
 * string literal; ids and limits are coerced to integers before they are
 * embedded in the cypher text.
 */
async function validateGraphName(graphRepository: GraphRepository, graph: unknown): Promise<string> {
    if (typeof graph !== 'string' || graph.length === 0) {
        throw new Error('graph must be a non-empty string');
    }
    const result = await graphRepository.execute(
        'SELECT name FROM ag_catalog.ag_graph WHERE name = $1', [graph]);
    if (result.rows.length === 0) {
        throw new Error('graph does not exist');
    }
    return graph;
}

function coerceInteger(value: unknown, field: string): string {
    if (typeof value === 'number' && Number.isInteger(value)) {
        return BigInt(value).toString();
    }
    if (typeof value === 'string' && /^-?\d+$/.test(value)) {
        return BigInt(value).toString();
    }
    throw new Error(`${field} must be an integer`);
}

function escapeSqlStringLiteral(value: string): string {
    return value.replace(/'/g, "''");
}

class CypherController {
    async executeCypher(req: Request, res: Response) {
        let connectorService = sessionService.get(req.sessionID);
        if (connectorService!.isConnected()) {
            let cypherService = new CypherService(
                connectorService!.graphRepository!
            );
            let data = await cypherService.executeCypher((req.body ?? {}).cmd);
            res.status(200).json(data).end();
        } else {
            throw new Error("Not connected");
        }
    }

    // v2-only (api-contract.md §10.1): neighbor expansion without
    // client-side SQL interpolation.
    async getNeighbors(req: Request, res: Response) {
        let connectorService = sessionService.get(req.sessionID);
        if (!connectorService!.isConnected()) {
            throw new Error("Not connected");
        }
        const graphRepository = connectorService!.graphRepository!;
        const body = req.body ?? {};
        const graph = await validateGraphName(graphRepository, body.graph);
        const vertexId = coerceInteger(body.vertexId, 'vertexId');
        let limit: string | null = null;
        if (body.limit !== undefined && body.limit !== null) {
            limit = coerceInteger(body.limit, 'limit');
            if (BigInt(limit) < 1n) {
                throw new Error('limit must be a positive integer');
            }
        }
        const cypherQuery =
            `MATCH (S)-[R]-(T) WHERE id(S) = ${vertexId} RETURN S, R, T` +
            (limit === null ? '' : ` LIMIT ${limit}`);
        const sql = `SELECT * FROM cypher('${escapeSqlStringLiteral(graph)}', $$ ${cypherQuery} $$) as (S agtype, R agtype, T agtype);`;
        let cypherService = new CypherService(graphRepository);
        let data = await cypherService.executeCypher(sql);
        res.status(200).json(data).end();
    }

    // v2-only (api-contract.md §10.2): delete a vertex (DETACH DELETE) or an
    // edge (DELETE) by id without client-side SQL interpolation.
    async deleteElement(req: Request, res: Response) {
        let connectorService = sessionService.get(req.sessionID);
        if (!connectorService!.isConnected()) {
            throw new Error("Not connected");
        }
        const graphRepository = connectorService!.graphRepository!;
        const body = req.body ?? {};
        const graph = await validateGraphName(graphRepository, body.graph);
        const id = coerceInteger(body.id, 'id');
        if (body.kind !== 'v' && body.kind !== 'e') {
            throw new Error(`kind must be 'v' or 'e'`);
        }
        const cypherQuery = body.kind === 'v'
            ? `MATCH (S) WHERE id(S) = ${id} DETACH DELETE S`
            : `MATCH ()-[S]-() WHERE id(S) = ${id} DELETE S`;
        const sql = `SELECT * FROM cypher('${escapeSqlStringLiteral(graph)}', $$ ${cypherQuery} $$) as (S agtype);`;
        let cypherService = new CypherService(graphRepository);
        let data = await cypherService.executeCypher(sql);
        res.status(200).json(data).end();
    }

    async createGraph(req: Request, res: Response, next: NextFunction) {
        let db = sessionService.get(req.sessionID);
        // Rewrite deviation (api-contract.md §9.2): the original backend hung
        // without a response here; the rewrite answers immediately.
        if (!db!.isConnected()) {
            throw new Error("Not connected");
        }
        let [client, transaction] = await db!.graphRepository!.createTransaction();
        try {
            const files = (req.files ?? {}) as { [fieldname: string]: Express.Multer.File[] };
            let graph = new GraphCreator({
                nodes: files.nodes,
                edges: files.edges,
                graphName: (req.body ?? {}).graphName,
                dropGraph: (req.body ?? {}).dropGraph === 'true'
            });

            await graph.parseData();
            const DROP = graph.query.graph.drop;
            const CREATE = graph.query.graph.create;
            if (DROP){
                try{
                   await client.query(DROP);
                }catch(e: any){
                    if(e.code !== '3F000') throw e;
                }

            }
            await client.query(CREATE!);
            await transaction('BEGIN');
            await Promise.all(graph.query.labels.map(async (q)=>{
                return await transaction(q);
            }));
            await Promise.all(graph.query.nodes.map(async (q)=>{
                return await transaction(q);
            }));
            await Promise.all(graph.query.edges.map(async (q)=>{
                return await transaction(q);
            }));
            await transaction('COMMIT');
            res.status(204).end();
        } catch (e: any){
            await transaction('ROLLBACK');
            const details = e.toString();
            const err = {
                ...e,
                details
            }
            res.status(500).json(err).end();
        } finally{
            client.release();
        }
    }
}

export default CypherController;
