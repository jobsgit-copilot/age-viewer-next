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

/**
 * Hand-written recursive-descent parser for Apache AGE's `agtype` text
 * format: JSON plus `::IDENT` type annotations (parsed and discarded at any
 * nesting level, e.g. `{"id": 1}::vertex`, `[1, 2]::path`, `1::numeric`).
 *
 * Replaces the ANTLR-generated parser; the grammar is kept in Agtype.g4 as
 * documentation. Strings are unescaped with JSON semantics exactly like the
 * old listener (`JSON.parse` on the raw token).
 *
 * Deliberate behavior fix vs. the old ANTLR listener (api-contract.md §9.8):
 * float array elements are emitted ONCE as numbers — the old listener pushed
 * both the raw text and the parsed number (`[1.5]` parsed to `["1.5", 1.5]`).
 */

export function parseAgtype(input: string): unknown {
    return new AgtypeTextParser(input).parseRoot();
}

class AgtypeTextParser {
    private pos = 0;
    private readonly text: string;

    constructor(text: string) {
        this.text = text;
    }

    parseRoot(): unknown {
        const value = this.parseValue();
        this.skipWhitespace();
        if (this.pos !== this.text.length) {
            throw this.error('unexpected trailing characters');
        }
        return value;
    }

    /** agValue: a value with an optional trailing `::IDENT` annotation. */
    private parseValue(): unknown {
        const value = this.parseBareValue();
        this.skipWhitespace();
        if (this.text.startsWith('::', this.pos)) {
            this.pos += 2;
            this.skipWhitespace();
            this.parseIdent();
        }
        return value;
    }

    private parseBareValue(): unknown {
        this.skipWhitespace();
        const c = this.text[this.pos];
        switch (c) {
            case '"':
                return this.parseString();
            case '{':
                return this.parseObject();
            case '[':
                return this.parseArray();
            case 't':
                this.expectKeyword('true');
                return true;
            case 'f':
                this.expectKeyword('false');
                return false;
            case 'n':
                this.expectKeyword('null');
                return null;
            case 'N':
                this.expectKeyword('NaN');
                return NaN;
            case 'I':
                this.expectKeyword('Infinity');
                return Infinity;
            default:
                if (c === '-' || isDigit(c)) {
                    return this.parseNumber();
                }
                throw this.error('unexpected character');
        }
    }

    private parseObject(): Record<string, unknown> {
        this.pos++; // consume '{'
        const obj: Record<string, unknown> = {};
        this.skipWhitespace();
        if (this.text[this.pos] === '}') {
            this.pos++;
            return obj;
        }
        for (;;) {
            this.skipWhitespace();
            if (this.text[this.pos] !== '"') {
                throw this.error('expected a string object key');
            }
            const key = this.parseString();
            this.skipWhitespace();
            this.expect(':');
            obj[key] = this.parseValue();
            this.skipWhitespace();
            const c = this.text[this.pos];
            if (c === ',') {
                this.pos++;
                continue;
            }
            if (c === '}') {
                this.pos++;
                return obj;
            }
            throw this.error(`expected ',' or '}'`);
        }
    }

    private parseArray(): unknown[] {
        this.pos++; // consume '['
        const arr: unknown[] = [];
        this.skipWhitespace();
        if (this.text[this.pos] === ']') {
            this.pos++;
            return arr;
        }
        for (;;) {
            arr.push(this.parseValue());
            this.skipWhitespace();
            const c = this.text[this.pos];
            if (c === ',') {
                this.pos++;
                continue;
            }
            if (c === ']') {
                this.pos++;
                return arr;
            }
            throw this.error(`expected ',' or ']'`);
        }
    }

    /** Raw token scanned verbatim, then unescaped via JSON semantics. */
    private parseString(): string {
        const start = this.pos;
        this.pos++; // consume opening '"'
        while (this.pos < this.text.length) {
            const c = this.text[this.pos];
            if (c === '\\') {
                this.pos += 2;
                continue;
            }
            if (c === '"') {
                this.pos++;
                return JSON.parse(this.text.slice(start, this.pos));
            }
            this.pos++;
        }
        throw this.error('unterminated string');
    }

    /** INTEGER | RegularFloat | ExponentFloat | '-'? 'Infinity' */
    private parseNumber(): number {
        const start = this.pos;
        if (this.text[this.pos] === '-') {
            this.pos++;
        }
        if (this.text.startsWith('Infinity', this.pos)) {
            this.pos += 'Infinity'.length;
            return parseFloat(this.text.slice(start, this.pos));
        }
        this.parseIntDigits();
        let isFloat = false;
        if (this.text[this.pos] === '.') {
            if (!isDigit(this.text[this.pos + 1])) {
                throw this.error('expected a digit after the decimal point');
            }
            this.pos++;
            while (isDigit(this.text[this.pos])) {
                this.pos++;
            }
            isFloat = true;
        }
        const e = this.text[this.pos];
        if (e === 'e' || e === 'E') {
            let i = this.pos + 1;
            const sign = this.text[i];
            if (sign === '+' || sign === '-') {
                i++;
            }
            if (!isDigit(this.text[i])) {
                throw this.error('expected a digit in the exponent');
            }
            this.pos = i;
            while (isDigit(this.text[this.pos])) {
                this.pos++;
            }
            isFloat = true;
        }
        const raw = this.text.slice(start, this.pos);
        return isFloat ? parseFloat(raw) : parseInt(raw, 10);
    }

    /** INT: '0' | [1-9] [0-9]* */
    private parseIntDigits(): void {
        const c = this.text[this.pos];
        if (c === '0') {
            this.pos++;
            return;
        }
        if (isDigitOneToNine(c)) {
            do {
                this.pos++;
            } while (isDigit(this.text[this.pos]));
            return;
        }
        throw this.error('expected a digit');
    }

    private parseIdent(): void {
        const rest = this.text.slice(this.pos);
        const match = /^[A-Za-z_][0-9A-Za-z_]*/.exec(rest);
        if (!match) {
            throw this.error('expected an identifier after ::');
        }
        this.pos += match[0].length;
    }

    private expectKeyword(keyword: string): void {
        if (!this.text.startsWith(keyword, this.pos)) {
            throw this.error(`expected '${keyword}'`);
        }
        this.pos += keyword.length;
    }

    private expect(char: string): void {
        if (this.text[this.pos] !== char) {
            throw this.error(`expected '${char}'`);
        }
        this.pos++;
    }

    private skipWhitespace(): void {
        while (this.pos < this.text.length) {
            const c = this.text[this.pos];
            if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
                this.pos++;
            } else {
                return;
            }
        }
    }

    private error(message: string): Error {
        return new Error(`invalid agtype: ${message} at position ${this.pos}`);
    }
}

function isDigit(c: string | undefined): boolean {
    return c !== undefined && c >= '0' && c <= '9';
}

function isDigitOneToNine(c: string | undefined): boolean {
    return c !== undefined && c >= '1' && c <= '9';
}
