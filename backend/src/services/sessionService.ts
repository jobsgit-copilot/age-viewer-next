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
import DatabaseService from './databaseService.ts';

interface SessionEntry {
    service: DatabaseService;
    lastSeen: number;
}

// Rewrite deviation (api-contract.md §9.4): the original backend kept every
// session's DatabaseService (and its pg.Pool) alive until process exit.
// This rewrite adds an idle reaper: entries not seen for longer than
// IDLE_LIMIT_MS have their pool ended and are removed from the map.
const REAP_INTERVAL_MS = 10 * 60 * 1000; // sweep every 10 minutes
const IDLE_LIMIT_MS = 60 * 60 * 1000;    // reap entries idle for over 60 minutes

class SessionService {
    private _sessionMap = new Map<string, SessionEntry>();

    constructor() {
        const timer = setInterval(() => {
            void this._reapIdle();
        }, REAP_INTERVAL_MS);
        timer.unref();
    }

    put(key: string, value: DatabaseService): void {
        this._sessionMap.set(key, { service: value, lastSeen: Date.now() });
    }

    get(key: string): DatabaseService | null {
        const entry = this._sessionMap.get(key);
        if (!entry) {
            return null;
        }
        entry.lastSeen = Date.now();
        return entry.service;
    }

    private async _reapIdle(): Promise<void> {
        const now = Date.now();
        for (const [key, entry] of this._sessionMap) {
            if (now - entry.lastSeen <= IDLE_LIMIT_MS) {
                continue;
            }
            this._sessionMap.delete(key);
            try {
                if (entry.service.isConnected()) {
                    await entry.service.disconnectDatabase();
                }
            } catch {
                // a pool that fails to end is dropped from the map regardless
            }
        }
    }
}
const sessionService = new SessionService();

export default sessionService;
