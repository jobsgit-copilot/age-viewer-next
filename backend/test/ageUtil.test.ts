import assert from 'node:assert';
import { describe, it } from 'node:test';
import { toAgeProps } from '../src/util/ObjectExtras.ts';

describe('object serialize', () => {
    it('serialize basic', () => {
        let serial = toAgeProps({ 'id': 2, 'name': 'hi' });
        assert.equal(serial, "{id:2, name:'hi'}");
    });
});
