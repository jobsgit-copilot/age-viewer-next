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

import { StreamLanguage } from '@codemirror/language';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
// `@codemirror/legacy-modes/mode/cypher` is the same CM5 cypher stream mode
// the old frontend loaded from `codemirror/mode/cypher/cypher.js`, but
// shipped as a proper ES module with types. The raw CM5 file is a UMD
// wrapper with NO export (it only registers the mode via side effects on
// the CM5 global), so the legacy-modes build is used instead — it avoids
// bundling the whole CM5 library and has no CJS-interop risk under Vite.
import { cypher } from '@codemirror/legacy-modes/mode/cypher';
import type { KeywordMatrix } from '../../types';

/** CM6 language support for cypher (syntax highlighting). */
export const cypherLanguage = StreamLanguage.define(cypher);

/** Keywords suggested when no preceding keyword gives matrix context. */
export const INITIAL_KEYWORDS = ['MATCH', 'CREATE', 'MERGE'] as const;

/**
 * TypeScript port of the old `features/query_builder/KeyWordFinder.js`.
 *
 * `relationships` rows keep their leading `null` and their "0"/"1" STRINGS
 * (contract §3.8) — `getConnectedNames` deliberately compares `!== '0'`,
 * never a boolean/number conversion.
 */
export class KeywordFinder {
  private keywordMap: Record<string, Array<string | null>> = {};
  private allKeywords = new Set<string>();

  static fromMatrix(data: KeywordMatrix): KeywordFinder {
    const finder = new KeywordFinder();
    data.kw.forEach((element, index) => {
      if (element === '') return;
      finder.keywordMap[element] = data.relationships[index].slice(1);
      finder.allKeywords.add(element);
    });
    return finder;
  }

  hasWord(word: string): boolean {
    return this.allKeywords.has(word.toUpperCase());
  }

  /** Keywords allowed right after `kw`; INITIAL list for unknown words. */
  getConnectedNames(kw: string): string[] {
    const key = kw.toUpperCase();
    if (!this.allKeywords.has(key)) {
      return [...INITIAL_KEYWORDS];
    }
    const relationships = this.keywordMap[key];
    const keywordList = Object.keys(this.keywordMap);
    const relatedKeys: string[] = [];
    relationships.forEach((element, index) => {
      if (element !== '0') {
        relatedKeys.push(keywordList[index]);
      }
    });
    return relatedKeys;
  }
}

/**
 * Keywords to suggest at the cursor: the matrix successors of the last
 * keyword typed before it (KeyWordFinder logic), or the INITIAL list when
 * no known keyword precedes the cursor.
 */
export function suggestNextKeywords(finder: KeywordFinder, textBefore: string): string[] {
  const words = textBefore.match(/[A-Za-z]+/g) ?? [];
  for (let i = words.length - 1; i >= 0; i -= 1) {
    if (finder.hasWord(words[i])) {
      return finder.getConnectedNames(words[i]);
    }
  }
  return [...INITIAL_KEYWORDS];
}

const WORD = /\w*$/;

/**
 * Completion source: case-insensitive start-of-word filtering over the
 * candidate keywords. `filter: false` keeps CodeMirror's own (fuzzier)
 * matcher from re-filtering the result, so the start-of-word semantics
 * stay exactly as implemented here.
 */
export function cypherKeywordCompletions(
  finder: KeywordFinder | null,
  fallbackKeywords: readonly string[],
) {
  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(WORD);
    if (word === null || (word.from === word.to && !context.explicit)) {
      return null;
    }
    const prefix = word.text.toUpperCase();
    const candidates = finder
      ? suggestNextKeywords(finder, context.state.sliceDoc(0, word.from))
      : [...fallbackKeywords];
    const options: Completion[] = candidates
      .filter((kw) => kw.toUpperCase().startsWith(prefix))
      .map((kw) => ({ label: kw, type: 'keyword' }));
    if (options.length === 0) return null;
    return { from: word.from, options, filter: false, validFor: /^\w*$/ };
  };
}
