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

import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { vi } from 'vitest';
import { createStore } from '../../app/store';
import type { AppStore } from '../../app/store';

/**
 * jsdom lacks matchMedia and ResizeObserver, which antd 5 touches on
 * render. Stub both once per test file.
 */
export function stubBrowserGlobals(): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

/**
 * Same trick as src/features/api/apiSlice.test.ts: fetchBaseQuery always
 * builds `new Request(url, config)` first, and undici's Request rejects
 * relative URLs — so tests replace Request with a recorder that keeps
 * (url, config) verbatim.
 */
export class FakeRequest {
  url: string;
  method: string;
  body: unknown;
  credentials: string;
  headers: Record<string, string>;

  constructor(
    url: string,
    init: { method?: string; body?: unknown; credentials?: string; headers?: unknown } = {},
  ) {
    this.url = url;
    this.method = init.method ?? 'GET';
    this.body = init.body;
    this.credentials = init.credentials ?? 'same-origin';
    const h = init.headers ?? {};
    const entries: Array<[string, string]> =
      typeof (h as Headers).entries === 'function'
        ? [...(h as Headers).entries()]
        : Object.entries(h as Record<string, string>);
    this.headers = Object.fromEntries(entries.map(([k, v]) => [k.toLowerCase(), v]));
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function renderWithStore(ui: ReactElement, store: AppStore = createStore()) {
  return { store, ...render(<Provider store={store}>{ui}</Provider>) };
}
