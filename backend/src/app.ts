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
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import session from 'express-session';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import { stream } from './config/winston.ts';
import cypherRouter from './routes/cypherRouter.ts';
import databaseRouter from './routes/databaseRouter.ts';
import sessionRouter from './routes/sessionRouter.ts';
import miscellaneousRouter from './routes/miscellaneous.ts';
const app = express();

app.use(cors({
    origin: true,
    credentials: true
}))
app.use(express.static(path.join(import.meta.dirname, '../../frontend/build')));
app.get('/', function (req, res) {
    res.sendFile(path.join(import.meta.dirname, '../../frontend/build', 'index.html'));
});

// The stray top-level `secure: true` is carried over from the original
// backend for parity; express-session ignores it (the real option is
// `cookie.secure`), so the cookie is still sent over plain HTTP.
const sessionOptions: session.SessionOptions & { secure?: boolean } = {
    secret: 'apache-age-viewer',
    secure: true,
    resave: false,
    saveUninitialized: true,
    proxy: true,
    genid: (req) => {
        return randomUUID();
    },
};
app.use(session(sessionOptions));
app.use(logger('common', {stream}));
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cookieParser());

app.use('/api/v1', sessionRouter);
app.use('/api/v1/miscellaneous', miscellaneousRouter);
app.use('/api/v1/cypher', cypherRouter);
app.use('/api/v1/db', databaseRouter);

// Error Handler
app.use(function (err: any, req: Request, res: Response, next: NextFunction) {
    console.error(err);
    res.status(err.status || 500).json(
        {
            severity: err.severity || '',
            message: err.message || '',
            code: err.code || ''
        }
    );
});

process.on('uncaughtException', function (exception) {
    console.log(exception);
});

export default app;
