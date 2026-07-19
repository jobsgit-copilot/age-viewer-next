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
import * as path from "node:path";
import fs from 'node:fs'

const sqlBasePath = path.join(import.meta.dirname, '../../sql');

// Available SQL flavor directories (backend/sql/<major>), ascending.
function availableVersions(): number[] {
    return fs.readdirSync(sqlBasePath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
        .map((entry) => Number(entry.name))
        .sort((a, b) => a - b);
}

function getQuery(name: string, version = ''): string {
    const sqlPath = path.join(sqlBasePath, version, `${name}.sql`);
    if (fs.existsSync(sqlPath)) {
        return fs.readFileSync(sqlPath, 'utf8');
    }
    // Graceful fallback for server majors without a dedicated flavor
    // directory (e.g. PG 16+): use the highest available flavor <= the
    // requested major version. Only throw when no such flavor exists.
    const requested = Number(version);
    if (Number.isInteger(requested)) {
        const candidates = availableVersions().filter((v) => v <= requested);
        const fallback = candidates[candidates.length - 1];
        if (fallback !== undefined) {
            const fallbackPath = path.join(sqlBasePath, String(fallback), `${name}.sql`);
            if (fs.existsSync(fallbackPath)) {
                return fs.readFileSync(fallbackPath, 'utf8');
            }
        }
    }
    throw new Error(`SQL does not exist, name = ${name}`);
}

export {getQuery}
