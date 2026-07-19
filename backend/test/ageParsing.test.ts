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

import { AGTypeParse } from "../src/tools/AGEParser.ts";
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Test Connector Api', () => {
    it('Object Circulating', () => {
        const ret = AGTypeParse('{"id": 1688849860263937, "label": "car", "properties": {"a": {"b":{"c":{"d":[1, 2, "A"]}}}}}::vertex');
        assert.deepStrictEqual(ret, {
            id: 1688849860263937,
            label: 'car',
            properties: {
                a: {
                    b: {
                        c: {
                            d: [
                                1,
                                2,
                                'A'
                            ]
                        }
                    }
                }
            }
        });
    });

    it('Null Properties', () => {
        const ret = AGTypeParse('{"id": 1688849860263937, "label": "car", "properties": {}}::vertex');
        assert.deepStrictEqual(ret, {"id":1688849860263937,"label":"car","properties":{}});
    });

    it('Path', () => {
        const ret = AGTypeParse('[{"id": 844424930131969, "label": "Part", "properties": {"part_num": "123"}}::vertex, {"id": 1125899906842625, "label": "used_by", "end_id": 844424930131970, "start_id": 844424930131969, "properties": {"quantity": 1}}::edge, {"id": 844424930131970, "label": "Part", "properties": {"part_num": "345"}}::vertex]::path');
        assert.deepStrictEqual(ret, [
            {
                id: 844424930131969,
                label: 'Part',
                properties: { part_num: '123' }
            },
            {
                id: 1125899906842625,
                label: 'used_by',
                end_id: 844424930131970,
                start_id: 844424930131969,
                properties: { quantity: 1 }
            },
            {
                id: 844424930131970,
                label: 'Part',
                properties: { part_num: '345' }
            }
        ]);
    });

    it('Edge', () => {
        const ret = AGTypeParse('{"id": 1125899906842625, "label": "used_by", "end_id": 844424930131970, "start_id": 844424930131969, "properties": {"quantity": 1}}::edge');
        assert.deepStrictEqual(ret, {
            id: 1125899906842625,
            label: 'used_by',
            end_id: 844424930131970,
            start_id: 844424930131969,
            properties: { quantity: 1 }
        });
    });

    it('String', () => {
        const ret = AGTypeParse('"parent"');
        assert.deepStrictEqual(ret, 'parent');
    });
});

describe('Hand-written parser behavior (post-ANTLR)', () => {
    it('Float array elements are emitted once as numbers (old duplication bug fixed)', () => {
        const ret = AGTypeParse('[1.5, 2.5]');
        assert.deepStrictEqual(ret, [1.5, 2.5]);
    });

    it('NaN and infinities parse to JS number values', () => {
        assert.deepStrictEqual(AGTypeParse('NaN'), NaN);
        assert.deepStrictEqual(AGTypeParse('Infinity'), Infinity);
        assert.deepStrictEqual(AGTypeParse('-Infinity'), -Infinity);
        assert.deepStrictEqual(AGTypeParse('[NaN, Infinity, -Infinity]'), [NaN, Infinity, -Infinity]);
    });

    it('Root scalars', () => {
        assert.deepStrictEqual(AGTypeParse('1'), 1);
        assert.deepStrictEqual(AGTypeParse('-42'), -42);
        assert.deepStrictEqual(AGTypeParse('3.14'), 3.14);
        assert.deepStrictEqual(AGTypeParse('"x"'), 'x');
        assert.deepStrictEqual(AGTypeParse('true'), true);
        assert.deepStrictEqual(AGTypeParse('false'), false);
        assert.deepStrictEqual(AGTypeParse('null'), null);
    });

    it('Annotated root scalars discard the annotation', () => {
        assert.deepStrictEqual(AGTypeParse('1::numeric'), 1);
        assert.deepStrictEqual(AGTypeParse('1.5::numeric'), 1.5);
        assert.deepStrictEqual(AGTypeParse('"x"::text'), 'x');
        assert.deepStrictEqual(AGTypeParse('true::bool'), true);
    });

    it('Empty object and array', () => {
        assert.deepStrictEqual(AGTypeParse('{}'), {});
        assert.deepStrictEqual(AGTypeParse('[]'), []);
    });

    it('Nested arrays of annotated vertices', () => {
        const ret = AGTypeParse('[[{"id": 1, "label": "a", "properties": {}}::vertex, {"id": 2, "label": "b", "properties": {}}::vertex]]::path');
        assert.deepStrictEqual(ret, [[
            { id: 1, label: 'a', properties: {} },
            { id: 2, label: 'b', properties: {} }
        ]]);
    });

    it('Escaped and unicode strings use JSON semantics', () => {
        assert.deepStrictEqual(AGTypeParse('"\\u0041\\u00e9"'), 'Aé');
        assert.deepStrictEqual(AGTypeParse('"a\\nb\\t\\"q\\"\\\\"'), 'a\nb\t"q"\\');
        assert.deepStrictEqual(AGTypeParse('{"\\u006b\\u0065\\u0079": "v"}'), { key: 'v' });
    });

    it('Exponent floats', () => {
        assert.deepStrictEqual(AGTypeParse('[1e3, 2.5e-2, -1.5E+2, 0.5e0]'), [1000, 0.025, -150, 0.5]);
        assert.deepStrictEqual(AGTypeParse('-2E10'), -20000000000);
    });

    it('Annotation on nested pair values and array elements is discarded', () => {
        assert.deepStrictEqual(AGTypeParse('{"a": 1::numeric, "b": [2::numeric], "c": {"d": "x"::text}}'), { a: 1, b: [2], c: { d: 'x' } });
    });

    it('Invalid input throws', () => {
        assert.throws(() => AGTypeParse('{invalid'));
        assert.throws(() => AGTypeParse('[1,'));
        assert.throws(() => AGTypeParse('"unterminated'));
        assert.throws(() => AGTypeParse('1 2'));
        assert.throws(() => AGTypeParse(''));
    });
});
