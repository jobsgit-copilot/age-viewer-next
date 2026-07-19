// Minimal type declarations for pg-types@2.x (the published @types/pg-types
// entry is an empty stub; only the surface this backend uses is declared).
declare module 'pg-types' {
    export function getTypeParser(oid: number, format?: string): (value: string) => unknown;
    export function setTypeParser(oid: number, parseFn: (value: string) => unknown): void;
    export function setTypeParser(oid: number, format: string, parseFn: (value: string) => unknown): void;
    export const builtins: Record<string, number>;
}
