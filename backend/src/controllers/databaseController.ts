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
import sessionService from '../services/sessionService.ts';
import type { NextFunction, Request, Response } from 'express';

class DatabaseController {

    async connectDatabase(req: Request, res: Response, next: NextFunction) {
        let databaseService = sessionService.get(req.sessionID);
        if (!databaseService!.isConnected()) {
            await databaseService!.connectDatabase(req.body ?? {});
        }
        const connectionInfo = databaseService!.getConnectionInfo();
        res.status(200).json(connectionInfo).end();
    }

    async disconnectDatabase(req: Request, res: Response, next: NextFunction) {
        let databaseService = sessionService.get(req.sessionID);
        if (databaseService!.isConnected()) {
            let isDisconnect = await databaseService!.disconnectDatabase();

            if (isDisconnect) {
                res.status(200).json({msg: 'Disconnect Successful'}).end();
            } else {
                res.status(500).json({msg: 'Already Disconnected'}).end();
            }
        } else {
            throw new Error('Not connected');
        }
    }

    async getStatus(req: Request, res: Response, next: NextFunction) {
        let databaseService = sessionService.get(req.sessionID);
        if (databaseService!.isConnected()) {
            await databaseService!.getConnectionStatus();
            res.status(200).json(databaseService!.getConnectionInfo()).end();
        } else {
            throw new Error('Not connected');
        }
    }

    async getMetadata(req: Request, res: Response, next: NextFunction) {
        let databaseService = sessionService.get(req.sessionID);
        if (databaseService!.isConnected()) {
            let metadata = await databaseService!.getMetaData(req.body ?? {});
            res.status(200).json(metadata).end();
        } else {
            throw new Error('Not connected');
        }
    }

    // Rewrite deviation (api-contract.md §9.3): the original registered
    // wrap(undefined) here and 500'd with a TypeError; the rewrite keeps the
    // route but fails with a stable, explicit message instead.
    async getMetaChart(req: Request, res: Response, next: NextFunction) {
        throw new Error('not implemented');
    }
}

export default DatabaseController;
