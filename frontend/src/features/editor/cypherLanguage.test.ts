// @vitest-environment node
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

import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import type { KeywordMatrix } from '../../types';
import {
  INITIAL_KEYWORDS,
  KeywordFinder,
  cypherKeywordCompletions,
  suggestNextKeywords,
} from './cypherLanguage';

/**
 * Matrix: MATCH → {WHERE, RETURN}, WHERE → {RETURN}, RETURN → {}.
 * Rows keep the contract's leading null and "0"/"1" strings (§3.8).
 */
const matrix: KeywordMatrix = {
  kw: ['MATCH', 'WHERE', 'RETURN'],
  relationships: [
    [null, '0', '1', '1'],
    [null, '0', '0', '1'],
    [null, '0', '0', '0'],
  ],
};

describe('KeywordFinder (port of the old KeyWordFinder)', () => {
  const finder = KeywordFinder.fromMatrix(matrix);

  it('knows keywords case-insensitively', () => {
    expect(finder.hasWord('match')).toBe(true);
    expect(finder.hasWord('WHERE')).toBe(true);
    expect(finder.hasWord('nope')).toBe(false);
  });

  it('returns matrix successors, comparing rows as strings (!== "0")', () => {
    expect(finder.getConnectedNames('MATCH')).toEqual(['WHERE', 'RETURN']);
    expect(finder.getConnectedNames('where')).toEqual(['RETURN']);
    expect(finder.getConnectedNames('RETURN')).toEqual([]);
  });

  it('falls back to the INITIAL list for unknown words', () => {
    expect(finder.getConnectedNames('nope')).toEqual([...INITIAL_KEYWORDS]);
    expect(INITIAL_KEYWORDS).toEqual(['MATCH', 'CREATE', 'MERGE']);
  });

  it('skips empty keyword entries', () => {
    const withEmpty = KeywordFinder.fromMatrix({
      kw: ['MATCH', ''],
      relationships: [
        [null, '0', '0'],
        [null, '0', '0'],
      ],
    });
    expect(withEmpty.hasWord('')).toBe(false);
  });
});

describe('suggestNextKeywords', () => {
  const finder = KeywordFinder.fromMatrix(matrix);

  it('suggests successors of the last keyword before the cursor', () => {
    expect(suggestNextKeywords(finder, 'MATCH (n) ')).toEqual(['WHERE', 'RETURN']);
    expect(suggestNextKeywords(finder, 'MATCH (n) WHERE n.id = 1 ')).toEqual(['RETURN']);
  });

  it('suggests the INITIAL list when no keyword precedes the cursor', () => {
    expect(suggestNextKeywords(finder, '')).toEqual([...INITIAL_KEYWORDS]);
    expect(suggestNextKeywords(finder, '(n) ')).toEqual([...INITIAL_KEYWORDS]);
  });
});

function complete(source: ReturnType<typeof cypherKeywordCompletions>, doc: string, explicit = false) {
  const state = EditorState.create({ doc });
  return source(new CompletionContext(state, doc.length, explicit));
}

describe('cypherKeywordCompletions', () => {
  const finder = KeywordFinder.fromMatrix(matrix);
  const source = cypherKeywordCompletions(finder, matrix.kw);

  it('matches case-insensitively at the start of the word', () => {
    const result = complete(cypherKeywordCompletions(null, matrix.kw), 'whe');
    expect(result).not.toBeNull();
    expect(result!.from).toBe(0);
    expect(result!.options.map((o) => o.label)).toEqual(['WHERE']);
  });

  it('does not match mid-word (start-of-word only)', () => {
    // "eturn" is a suffix of RETURN but not a prefix → no completion.
    expect(complete(cypherKeywordCompletions(null, matrix.kw), 'eturn')).toBeNull();
  });

  it('uses the relationship matrix when a keyword precedes the cursor', () => {
    const result = complete(source, 'MATCH (n) RE');
    expect(result!.options.map((o) => o.label)).toEqual(['RETURN']);
    expect(result!.from).toBe('MATCH (n) '.length);
  });

  it('offers the INITIAL keywords on an empty word when explicit', () => {
    const result = complete(source, '', true);
    expect(result!.options.map((o) => o.label)).toEqual([...INITIAL_KEYWORDS]);
  });

  it('returns null for an empty word when not explicit', () => {
    expect(complete(source, '')).toBeNull();
  });

  it('marks the result filter:false so CodeMirror does not re-filter', () => {
    expect(complete(source, 'mat')!.filter).toBe(false);
  });
});
