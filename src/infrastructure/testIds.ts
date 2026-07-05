/**
 * Deterministic, valid uuids for tests. The `user_id` columns are `uuid` (STACK-4), so a pg-backed test
 * (pglite) rejects the old `"user-a"` string literals — tests use these instead. Not production code;
 * imported only by `*.test.ts` / contract suites.
 */
export const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const USER_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
