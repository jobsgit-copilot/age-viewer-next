import app from '../src/app.ts';
import { connectionForm } from './testDB.ts';
import request from 'supertest';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const START_PATH = '/api/v1';
const GRAPH_NAME = 'test_contract';

const EXPECTED_KW = ["MATCH","WITH","DELETE","CREATE","RETURN","ORDER BY","SKIP","LIMIT",
    "SET","REMOVE","MERGE","AS","WHERE","DETACH"];
const EXPECTED_RELATIONSHIPS = [
    [null, "0","1","1","0","1","0","0","0","0","1","0","0","0","0"],
    [null, "0","0","0","0","0","1","0","0","0","0","0","1","1","0"],
    [null, "0","0","0","0","0","0","0","0","0","0","0","0","0","0"],
    [null, "0","0","0","0","1","0","0","0","0","0","0","0","0","0"],
    [null, "0","0","0","0","1","0","0","0","0","0","0","0","0","0"],
    [null, "0","0","0","0","1","0","1","1","0","0","0","0","0","0"],
    [null, "0","0","0","0","0","0","0","0","0","0","0","0","0","0"],
    [null, "0","0","0","0","0","0","0","0","0","0","0","0","0","0"],
    [null, "0","0","0","0","0","0","0","0","0","0","0","0","0","0"],
    [null, "0","0","0","0","0","0","0","0","0","0","0","0","0","0"],
    [null, "0","0","0","0","1","0","0","0","0","0","0","0","0","0"],
    [null, "0","0","0","0","0","0","0","0","0","0","0","0","0","0"],
    [null, "0","0","0","0","0","0","0","0","0","0","0","0","0","0"],
    [null, "0","0","1","0","0","0","0","0","0","0","0","0","0","0"]
];

describe('API contract', () => {
    const agent = request.agent(app);

    before(async () => {
        const res = await agent
            .post(`${START_PATH}/db/connect`)
            .send({ ...connectionForm });
        assert.equal(res.status, 200);
        // connect response must not echo the password back (rewrite deviation §9.1)
        assert.ok(!('password' in res.body), 'connect response leaks password');
        assert.equal(res.body.host, connectionForm.host);
        assert.equal(res.body.database, connectionForm.database);
        assert.equal(res.body.user, connectionForm.user);
        assert.equal(res.body.port, connectionForm.port);
        assert.deepEqual(res.body.graphs, []);
        assert.equal(typeof res.body.version, 'string');
        // (re)create the graph for this suite
        await agent
            .post(`${START_PATH}/cypher`)
            .send({ cmd: `SELECT * FROM drop_graph('${GRAPH_NAME}', true);` });
        const created = await agent
            .post(`${START_PATH}/cypher`)
            .send({ cmd: `SELECT * FROM create_graph('${GRAPH_NAME}');` });
        assert.equal(created.status, 200);
    });

    it('GET /db before connect -> 500 {severity,message,code} "Not connected"', async () => {
        const res = await request(app).get(`${START_PATH}/db`);
        assert.equal(res.status, 500);
        assert.deepEqual(res.body, { severity: '', message: 'Not connected', code: '' });
    });

    it('GET /miscellaneous -> keyword adjacency matrix', async () => {
        const res = await request(app).get(`${START_PATH}/miscellaneous`);
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.kw, EXPECTED_KW);
        assert.deepEqual(res.body.relationships, EXPECTED_RELATIONSHIPS);
    });

    it('GET /db/metaChart -> 500 "not implemented"', async () => {
        const res = await request(app).get(`${START_PATH}/db/metaChart`);
        assert.equal(res.status, 500);
        assert.deepEqual(res.body, { severity: '', message: 'not implemented', code: '' });
    });

    it('POST /cypher with a cypher query through ag_catalog -> parsed agtype rows', async () => {
        const res = await agent
            .post(`${START_PATH}/cypher`)
            .send({ cmd: `SELECT * FROM cypher('${GRAPH_NAME}', $$ CREATE (n:t {v:1}) RETURN n $$) as (a agtype);` });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.columns, ['a']);
        assert.equal(res.body.command, 'SELECT');
        assert.equal(res.body.rowCount, 1);
        assert.equal(res.body.rows.length, 1);
        const vertex = res.body.rows[0].a;
        assert.equal(typeof vertex.id, 'number');
        assert.equal(vertex.label, 't');
        assert.deepEqual(vertex.properties, { v: 1 });
    });

    it('POST /cypher with multiple statements -> only the last result is returned', async () => {
        const res = await agent
            .post(`${START_PATH}/cypher`)
            .send({ cmd: 'SELECT 1; SELECT 2;' });
        assert.equal(res.status, 200);
        assert.equal(res.body.command, 'SELECT');
        assert.deepEqual(res.body.rows, [{ '?column?': 2 }]);
        assert.deepEqual(res.body.columns, ['?column?']);
    });

    it('POST /cypher with bad cypher -> 500 {severity,message,code}', async () => {
        const res = await agent
            .post(`${START_PATH}/cypher`)
            .send({ cmd: `SELECT * FROM cypher('${GRAPH_NAME}', $$ THIS IS NOT CYPHER $$) as (a agtype);` });
        assert.equal(res.status, 500);
        assert.equal(res.body.severity, 'ERROR');
        assert.equal(typeof res.body.message, 'string');
        assert.notEqual(res.body.message, '');
        assert.equal(typeof res.body.code, 'string');
        assert.notEqual(res.body.code, '');
    });

    it('POST /cypher with empty cmd -> 500 "Query not entered!"', async () => {
        const res = await agent
            .post(`${START_PATH}/cypher`)
            .send({});
        assert.equal(res.status, 500);
        assert.deepEqual(res.body, { severity: '', message: 'Query not entered!', code: '' });
    });

    it('POST /db/meta -> metadata object keyed by graph names (PG18 via sql/15 fallback)', async () => {
        const res = await agent
            .post(`${START_PATH}/db/meta`)
            .send({ currentGraph: GRAPH_NAME });
        assert.equal(res.status, 200);
        assert.ok(GRAPH_NAME in res.body, 'selected graph is not a key of the response');
        const meta = res.body[GRAPH_NAME];
        assert.ok(Array.isArray(meta.nodes));
        assert.ok(Array.isArray(meta.edges));
        assert.deepEqual(meta.propertyKeys, []);
        assert.equal(meta.graph, GRAPH_NAME);
        assert.equal(meta.database, connectionForm.database);
        assert.equal(meta.role.user_name, connectionForm.user);
        assert.ok(meta.role.role_name === 'admin' || meta.role.role_name === 'user');
        const labelRow = meta.nodes.find((row: any) => row.label === 't');
        assert.ok(labelRow, 'label "t" not found in meta.nodes');
        assert.equal(labelRow.kind, 'v');
        assert.equal(typeof labelRow.cnt, 'number');
    });

    it('GET /db while connected -> 200 connection info without password', async () => {
        const res = await agent.get(`${START_PATH}/db`);
        assert.equal(res.status, 200);
        assert.ok(!('password' in res.body), 'status response leaks password');
        assert.equal(res.body.host, connectionForm.host);
        assert.equal(res.body.database, connectionForm.database);
    });

    it('cleanup: drop graph, then GET /db/disconnect -> 200', async () => {
        const dropped = await agent
            .post(`${START_PATH}/cypher`)
            .send({ cmd: `SELECT * FROM drop_graph('${GRAPH_NAME}', true);` });
        assert.equal(dropped.status, 200);
        const res = await agent.get(`${START_PATH}/db/disconnect`);
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { msg: 'Disconnect Successful' });
    });

    after(async () => {
        // best-effort cleanup in case a test above failed mid-way
        try {
            await agent
                .post(`${START_PATH}/cypher`)
                .send({ cmd: `SELECT * FROM drop_graph('${GRAPH_NAME}', true);` });
            await agent.get(`${START_PATH}/db/disconnect`);
        } catch {
            // ignore
        }
    });
});
