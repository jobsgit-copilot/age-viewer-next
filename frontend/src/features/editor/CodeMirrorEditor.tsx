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

import { useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import type { ViewUpdate } from '@codemirror/view';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { insertNewline } from '@codemirror/commands';
import { autocompletion, completionStatus } from '@codemirror/autocomplete';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { KeywordMatrix } from '../../types';
import {
  KeywordFinder,
  cypherKeywordCompletions,
  cypherLanguage,
} from './cypherLanguage';
import { historyNext, historyPrev } from './editorHelpers';
import styles from './CodeMirrorEditor.module.css';

export interface CodeMirrorEditorProps {
  /** Controlled editor content (the redux `editor.command`). */
  value: string;
  onChange: (value: string) => void;
  /** Run the current command (Shift-Enter / Ctrl-Enter). */
  onRun: () => void;
  commandHistory: readonly string[];
  /** Keyword matrix from `getKeywords`; autocomplete is skipped while absent. */
  keywordMatrix?: KeywordMatrix;
}

/**
 * Dark editor theme approximating the old look. NOTE: the old app imported
 * `codemirror/theme/ambiance-mobile.css` but that file is an empty stub and
 * no `theme` option was ever set, so the old editor actually rendered the
 * DEFAULT light CodeMirror theme. This dark theme follows the task directive
 * and the v2 palette (`#222430` dark bg, `#2756FF` accent); the grey 90%
 * placeholder comes from the old `CodeMirror.scss`.
 */
const editorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#222430',
      color: '#d4d4d4',
      fontSize: '14px',
    },
    '.cm-content': {
      caretColor: '#ffffff',
      padding: '8px 0',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#ffffff',
    },
    '&.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(39, 86, 255, 0.35)',
    },
    '.cm-gutters': {
      backgroundColor: '#1b1d27',
      color: '#8a8f98',
      border: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
    },
    '.cm-placeholder': {
      color: 'grey',
      opacity: '0.9',
    },
    '.cm-tooltip.cm-tooltip-autocomplete': {
      backgroundColor: '#2b2d3a',
      border: '1px solid #3c3f4f',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: '#2756FF',
      color: '#ffffff',
    },
  },
  { dark: true },
);

const cypherHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#569cd6' },
  { tag: tags.atom, color: '#4ec9b0' },
  { tag: tags.string, color: '#ce9178' },
  { tag: tags.comment, color: '#6a9955' },
  { tag: tags.definition(tags.variableName), color: '#9cdcfe' },
  { tag: tags.variableName, color: '#9cdcfe' },
  { tag: tags.standard(tags.variableName), color: '#dcdcaa' },
  { tag: tags.number, color: '#b5cea8' },
]);

/** Smallest height the drag handle allows (old min-height was 60px). */
const MIN_EDITOR_HEIGHT = 60;

function replaceDoc(view: EditorView, value: string): void {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: value },
    selection: { anchor: value.length },
  });
}

/**
 * CodeMirror 6 port of the old `CodeMirrorWrapper.jsx` (CM5):
 * cypher highlighting, Shift/Ctrl-Enter run, Ctrl-Up/Down history,
 * '$' prompt gutter, placeholder, drag-to-resize, keyword autocomplete.
 */
function CodeMirrorEditor({
  value,
  onChange,
  onRun,
  commandHistory,
  keywordMatrix,
}: CodeMirrorEditorProps) {
  // Refs keep the (memoized) keymap closures pointed at the latest props
  // without rebuilding the editor extensions on every keystroke.
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  const historyRef = useRef(commandHistory);
  historyRef.current = commandHistory;
  const historyIndexRef = useRef(-1);

  const completionSource = useMemo(
    () =>
      cypherKeywordCompletions(
        keywordMatrix ? KeywordFinder.fromMatrix(keywordMatrix) : null,
        keywordMatrix?.kw ?? [],
      ),
    [keywordMatrix],
  );

  const extensions = useMemo(
    () => [
      Prec.high(
        keymap.of([
          {
            key: 'Shift-Enter',
            run: () => {
              onRunRef.current();
              historyIndexRef.current = -1;
              return true;
            },
          },
          {
            key: 'Ctrl-Enter',
            run: () => {
              onRunRef.current();
              historyIndexRef.current = -1;
              return true;
            },
          },
          {
            key: 'Ctrl-ArrowUp',
            run: (view) => {
              const result = historyPrev(historyRef.current, historyIndexRef.current);
              if (result === null) return true;
              historyIndexRef.current = result.index;
              replaceDoc(view, result.value);
              return true;
            },
          },
          {
            key: 'Ctrl-ArrowDown',
            run: (view) => {
              const result = historyNext(historyRef.current, historyIndexRef.current);
              if (result === null) return true;
              historyIndexRef.current = result.index;
              replaceDoc(view, result.value);
              return true;
            },
          },
          {
            // Old wrapper: plain newline, no auto-indent. Yield to the
            // completion popup so Enter still accepts a suggestion.
            key: 'Enter',
            run: (view) => {
              if (completionStatus(view.state) !== null) return false;
              return insertNewline(view);
            },
          },
        ]),
      ),
      cypherLanguage,
      // '$' prompt: single-line commands show a shell-style '$' instead of
      // line number 1 (old `lineNumberFormatter` behavior).
      lineNumbers({
        formatNumber: (lineNo, state) => (state.doc.lines <= 1 ? '$' : String(lineNo)),
      }),
      autocompletion({ override: [completionSource], icons: false }),
      syntaxHighlighting(cypherHighlight),
    ],
    [completionSource],
  );

  // Drag-to-resize: null height = auto-grow with content (old `height:auto`).
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  const onHandleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startHeight = wrapperRef.current?.getBoundingClientRect().height ?? MIN_EDITOR_HEIGHT;
    const startY = event.clientY;
    const onMove = (moveEvent: MouseEvent) => {
      setHeight(Math.max(MIN_EDITOR_HEIGHT, Math.round(startHeight + moveEvent.clientY - startY)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleChange = (nextValue: string, viewUpdate: ViewUpdate) => {
    onChange(nextValue);
    // Old quirk: once content outgrows a dragged height, fall back to
    // auto-grow (58px chrome + 21px per line, as in the old wrapper).
    const lineCount = viewUpdate.state.doc.lines;
    if (height !== null && lineCount > 1 && height < 58 + 21 * lineCount) {
      setHeight(null);
    }
  };

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <CodeMirror
        value={value}
        onChange={handleChange}
        extensions={extensions}
        theme={editorTheme}
        placeholder="Create a query..."
        height={height === null ? undefined : `${height}px`}
        basicSetup={{
          lineNumbers: false,
          autocompletion: false,
        }}
      />
      <div
        className={styles.dragHandle}
        onMouseDown={onHandleMouseDown}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize editor"
        title="Drag to resize"
      />
    </div>
  );
}

export default CodeMirrorEditor;
