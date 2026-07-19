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

import { parseAgtype } from './agtypeParser.ts';
import type { ClientBase } from 'pg';

interface TypeParserRegistry {
    setTypeParser(oid: number, parseFn: (value: string) => unknown): void;
}

function AGTypeParse(input: string): unknown {
    return parseAgtype(input);
}

async function setAGETypes(client: ClientBase, types: TypeParserRegistry): Promise<void> {
    await client.query(`
        CREATE EXTENSION IF NOT EXISTS age;
        SET search_path = ag_catalog, "$user", public;
    `)

    // A preloaded age (shared_preload_libraries) needs no LOAD — and a
    // restricted user cannot even ASK: SHOW shared_preload_libraries is a
    // superuser-only GUC since PG 15. So try LOAD and tolerate exactly
    // 42501 (insufficient_privilege); the agtype probe below then decides
    // whether AGE is actually usable.
    let loadDenied = false;
    try {
        await client.query(`LOAD 'age';`);
    } catch (err) {
        if ((err as { code?: string })?.code !== '42501') throw err;
        loadDenied = true;
    }

    const oidResults = await client.query(`
        select typelem
        from pg_type
        where typname = '_agtype';`);

    if (oidResults.rows.length < 1)
        throw new Error(loadDenied
            ? 'AGE is unavailable: LOAD was denied and agtype is not registered (add age to shared_preload_libraries or use a superuser).'
            : 'AGE agtype not found.');

    types.setTypeParser(oidResults.rows[0].typelem, AGTypeParse)
}

async function onConnectQueries(client: ClientBase): Promise<{ server_version: string }> {
    const v = await client.query('show server_version;');
    return {server_version: v.rows[0].server_version};
}

export {setAGETypes, AGTypeParse, onConnectQueries}
