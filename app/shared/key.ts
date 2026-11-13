/** A camelCase name with no dot, else `never`. */
export type Name<N extends string> = N extends
  | ""
  | Capitalize<N>
  | `${string}.${string}`
  ? never
  : N;

/** A `feature.name` identifier: a lower-case feature, one dot, a camelCase name, no third level; anything else is `never`. */
export type DottedKey<K extends string> = K extends `${infer F}.${infer N}`
  ? F extends Name<F>
    ? N extends Name<N>
      ? K
      : never
    : never
  : never;
