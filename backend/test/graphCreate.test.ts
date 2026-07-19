import app from '../src/app.ts';
import { connectionForm } from './testDB.ts';
import path from 'node:path';
import request from 'supertest';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const START_PATH = '/api/v1';
const GRAPH_NAME = 'test_graph_create';

describe('Graph Creation', () => {
    const agent = request.agent(app);

    before(async () => {
        const res = await agent
            .post(`${START_PATH}/db/connect`)
            .send({ ...connectionForm });
        assert.equal(res.status, 200);
    });

    it('creates a graph', async () => {
        const res = await agent
            .post(`${START_PATH}/cypher/init`)
            .field('graphName', GRAPH_NAME)
            .field('dropGraph', 'true')
            .attach('nodes', getPathForFile('make.csv'), 'Make')
            .attach('nodes', getPathForFile('model.csv'), 'Model')
            .attach('edges', getPathForFile('has_model.csv'), 'has_model');
        assert.equal(res.status, 204);
    });

    after(async () => {
        await agent
            .post(`${START_PATH}/cypher`)
            .send({ cmd: `SELECT * FROM drop_graph('${GRAPH_NAME}', true);` });
        await agent.get(`${START_PATH}/db/disconnect`);
    });
});

function getPathForFile(fname: string): string {
    return path.join(import.meta.dirname, 'test-data', fname);
}
