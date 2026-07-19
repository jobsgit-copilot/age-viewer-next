import app from '../src/app.ts';
import { connectionForm } from './testDB.ts';
import request from 'supertest';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const START_PATH = '/api/v1';
const GRAPH_NAME = `test_v2_${Date.now().toString(36)}`;

describe('v2 parameterized endpoints', () => {
    const agent = request.agent(app);
    let aId: number;
    let bId: number;
    let eId: number;

    before(async () => {
        const res = await agent
            .post(`${START_PATH}/db/connect`)
            .send({ ...connectionForm });
        assert.equal(res.status, 200);
        const created = await agent
            .post(`${START_PATH}/cypher`)
            .send({ cmd: `SELECT * FROM create_graph('${GRAPH_NAME}');` });
        assert.equal(created.status, 200);
        // two vertices and one edge between them
        const populated = await agent
            .post(`${START_PATH}/cypher`)
            .send({ cmd: `SELECT * FROM cypher('${GRAPH_NAME}', $$ CREATE (a:p {name:'a'})-[e:r {w:1}]->(b:p {name:'b'}) RETURN a, b, e $$) as (a agtype, b agtype, e agtype);` });
        assert.equal(populated.status, 200);
        const row = populated.body.rows[0];
        aId = row.a.id;
        bId = row.b.id;
        eId = row.e.id;
        assert.equal(typeof aId, 'number');
        assert.equal(typeof eId, 'number');
    });

    it('POST /cypher/neighbors returns the connected rows', async () => {
        const res = await agent
            .post(`${START_PATH}/cypher/neighbors`)
            .send({ graph: GRAPH_NAME, vertexId: aId });
        assert.equal(res.status, 200);
        // PostgreSQL folds the unquoted output-column aliases to lowercase
        assert.deepEqual(res.body.columns, ['s', 'r', 't']);
        assert.equal(res.body.command, 'SELECT');
        assert.equal(res.body.rows.length, 1);
        const { s: S, r: R, t: T } = res.body.rows[0];
        assert.equal(S.id, aId);
        assert.equal(S.label, 'p');
        assert.equal(R.id, eId);
        assert.equal(R.start_id, aId);
        assert.equal(R.end_id, bId);
        assert.equal(T.id, bId);
    });

    it('POST /cypher/neighbors honors limit', async () => {
        const res = await agent
            .post(`${START_PATH}/cypher/neighbors`)
            .send({ graph: GRAPH_NAME, vertexId: aId, limit: 1 });
        assert.equal(res.status, 200);
        assert.equal(res.body.rows.length, 1);
        const limited = await agent
            .post(`${START_PATH}/cypher/neighbors`)
            .send({ graph: GRAPH_NAME, vertexId: aId, limit: 0 });
        assert.equal(limited.status, 500);
        assert.deepEqual(limited.body, { severity: '', message: 'limit must be a positive integer', code: '' });
    });

    it('validation failures produce the standard 500 error shape', async () => {
        // unknown graph
        let res = await agent
            .post(`${START_PATH}/cypher/neighbors`)
            .send({ graph: 'no_such_graph_v2_xyz', vertexId: 1 });
        assert.equal(res.status, 500);
        assert.deepEqual(res.body, { severity: '', message: 'graph does not exist', code: '' });

        // injection attempt via the graph name is only a failed lookup
        res = await agent
            .post(`${START_PATH}/cypher/neighbors`)
            .send({ graph: `x'); DROP TABLE ag_catalog.ag_graph; --`, vertexId: 1 });
        assert.equal(res.status, 500);
        assert.deepEqual(res.body, { severity: '', message: 'graph does not exist', code: '' });

        // non-integer vertexId
        res = await agent
            .post(`${START_PATH}/cypher/neighbors`)
            .send({ graph: GRAPH_NAME, vertexId: 'abc' });
        assert.equal(res.status, 500);
        assert.deepEqual(res.body, { severity: '', message: 'vertexId must be an integer', code: '' });

        res = await agent
            .post(`${START_PATH}/cypher/neighbors`)
            .send({ graph: GRAPH_NAME, vertexId: 1.5 });
        assert.equal(res.status, 500);
        assert.deepEqual(res.body, { severity: '', message: 'vertexId must be an integer', code: '' });

        // empty graph name
        res = await agent
            .post(`${START_PATH}/cypher/neighbors`)
            .send({ graph: '', vertexId: 1 });
        assert.equal(res.status, 500);
        assert.deepEqual(res.body, { severity: '', message: 'graph must be a non-empty string', code: '' });

        // bad kind
        res = await agent
            .post(`${START_PATH}/cypher/element/delete`)
            .send({ graph: GRAPH_NAME, id: 1, kind: 'x' });
        assert.equal(res.status, 500);
        assert.deepEqual(res.body, { severity: '', message: "kind must be 'v' or 'e'", code: '' });

        // non-integer delete id
        res = await agent
            .post(`${START_PATH}/cypher/element/delete`)
            .send({ graph: GRAPH_NAME, id: '1 OR 1=1', kind: 'v' });
        assert.equal(res.status, 500);
        assert.deepEqual(res.body, { severity: '', message: 'id must be an integer', code: '' });
    });

    it('POST /cypher/neighbors without a connection -> 500 "Not connected"', async () => {
        const res = await request(app)
            .post(`${START_PATH}/cypher/neighbors`)
            .send({ graph: GRAPH_NAME, vertexId: 1 });
        assert.equal(res.status, 500);
        assert.deepEqual(res.body, { severity: '', message: 'Not connected', code: '' });
    });

    it('POST /cypher/element/delete removes the edge, then the vertices', async () => {
        // delete the edge
        let res = await agent
            .post(`${START_PATH}/cypher/element/delete`)
            .send({ graph: GRAPH_NAME, id: eId, kind: 'e' });
        assert.equal(res.status, 200);
        assert.equal(res.body.command, 'SELECT');

        // edge is gone: neighbor expansion now returns no rows
        res = await agent
            .post(`${START_PATH}/cypher/neighbors`)
            .send({ graph: GRAPH_NAME, vertexId: aId });
        assert.equal(res.status, 200);
        assert.equal(res.body.rows.length, 0);

        // delete both vertices
        res = await agent
            .post(`${START_PATH}/cypher/element/delete`)
            .send({ graph: GRAPH_NAME, id: bId, kind: 'v' });
        assert.equal(res.status, 200);
        res = await agent
            .post(`${START_PATH}/cypher/element/delete`)
            .send({ graph: GRAPH_NAME, id: String(aId), kind: 'v' });
        assert.equal(res.status, 200);

        // nothing left
        res = await agent
            .post(`${START_PATH}/cypher`)
            .send({ cmd: `SELECT * FROM cypher('${GRAPH_NAME}', $$ MATCH (n) RETURN n $$) as (n agtype);` });
        assert.equal(res.status, 200);
        assert.equal(res.body.rows.length, 0);
    });

    after(async () => {
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
