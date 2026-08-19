import type { Entries } from "type-fest";

/**
 * `Object.keys` and `Object.entries` widen the key back to `string`, because a
 * value can always carry more properties than its type lists. A record declared
 * from a literal here has exactly the keys it names, so the narrower type holds
 * — and saying so once beats an assertion at every call.
 */
export function objectKeys<Value extends object>(value: Value) {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return Object.keys(value) as (keyof Value)[];
}

export function objectEntries<Value extends object>(value: Value) {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return Object.entries(value) as Entries<Value>;
}

export function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function clamp(num: number, min: number, max: number) {
  return Math.min(Math.max(num, min), max);
}
