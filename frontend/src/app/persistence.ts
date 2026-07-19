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
 * localStorage persistence for UI state.
 *
 * DEVIATION from the old frontend: the old app persisted settings in
 * cookies (`react-cookies`, `features/cookie/CookieUtil.js`). Cookies are
 * sent to the server on every request, which makes no sense for pure UI
 * state; the v2 frontend uses localStorage instead. Only non-sensitive UI
 * state is ever written here — never credentials.
 */

const STORAGE_PREFIX = 'age-viewer:';

/** Load one persisted slice; returns undefined when absent or unreadable. */
export function loadSlice<T>(key: string): Partial<T> | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return undefined;
    return JSON.parse(raw) as Partial<T>;
  } catch {
    return undefined;
  }
}

/** Persist one slice; storage failures (quota, privacy mode) are ignored. */
export function saveSlice(key: string, value: unknown): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* persistence is best-effort */
  }
}

export function removeSlice(key: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    /* ignore */
  }
}
