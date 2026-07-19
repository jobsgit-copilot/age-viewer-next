import assert from 'node:assert';
import { describe, it } from 'node:test';
import { setAGETypes } from '../src/tools/AGEParser.ts';
import GraphRepository from '../src/models/GraphRepository.ts';

/**
 * Fake pg client: records issued queries; fails LOAD with `loadErrorCode`
 * (null = LOAD succeeds) and reports the agtype oid only when `hasAgtype`.
 */
function fakeClient({ loadErrorCode = null, hasAgtype = true }: { loadErrorCode?: string | null; hasAgtype?: boolean } = {}) {
    const queries: string[] = [];
    const client = {
        queries,
        released: 0,
        release() {
            this.released += 1;
        },
        async query(sql: string) {
            queries.push(sql);
            if (sql.includes('LOAD') && loadErrorCode) {
                throw Object.assign(new Error('load denied'), { code: loadErrorCode });
            }
            if (sql.includes('_agtype')) {
                return { rows: hasAgtype ? [{ typelem: 12345 }] : [] };
            }
            return { rows: [] };
        },
    };
    return client;
}

const registry = () => {
    const seen: Array<[number, unknown]> = [];
    return { seen, setTypeParser: (oid: number, fn: unknown) => seen.push([oid, fn]) };
};

describe('setAGETypes', () => {
    it('registers the parser when LOAD succeeds', async () => {
        const types = registry();
        await setAGETypes(fakeClient() as never, types);
        assert.equal(types.seen[0][0], 12345);
        assert.equal(typeof types.seen[0][1], 'function');
    });

    it('tolerates 42501 when agtype is already registered (preloaded server)', async () => {
        const client = fakeClient({ loadErrorCode: '42501', hasAgtype: true });
        const types = registry();
        await setAGETypes(client as never, types);
        assert.equal(types.seen[0][0], 12345);
    });

    it('fails clearly when LOAD is denied and agtype is missing', async () => {
        const client = fakeClient({ loadErrorCode: '42501', hasAgtype: false });
        await assert.rejects(() => setAGETypes(client as never, registry()), /AGE is unavailable/);
    });

    it('propagates non-42501 LOAD failures', async () => {
        const client = fakeClient({ loadErrorCode: '58P01', hasAgtype: true });
        await assert.rejects(() => setAGETypes(client as never, registry()), /load denied/);
    });
});

describe('GraphRepository.getConnection', () => {
    it('releases the client when the AGE setup fails', async () => {
        const client = fakeClient({ loadErrorCode: '42501', hasAgtype: false });
        const repo = new GraphRepository({});
        (repo as unknown as { _pool: unknown })._pool = { connect: async () => client };
        await assert.rejects(() => repo.getConnection());
        assert.equal(client.released, 1);
    });
});
